import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";

/* The team's side of the client portal. */

export type PriceType = "fixed" | "from" | "quote";
export type ServiceBilling = "one_time" | "monthly" | "quarterly" | "yearly";
export type RequestStatus = "new" | "in_discussion" | "quoted" | "accepted" | "started" | "declined" | "withdrawn";

export interface ServiceRow {
  id: string;
  name: string;
  summary: string | null;
  description: string | null;
  category: string | null;
  priceType: PriceType;
  price: number | null;
  billing: ServiceBilling;
  deliveryDays: number | null;
  requiredDocs: { name: string; hint?: string | null }[];
  templateProjectId: string | null;
  ownerUserId: string | null;
  active: boolean;
  position: number;
  priceLabel: string;
  requests: number;
  open: number;
}

export interface Person {
  name: string;
  image: string | null;
  jobTitle: string | null;
}

export interface RequestRow {
  id: string;
  label: string;
  title: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  clientId: string | null;
  clientName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  assigneeUserId: string | null;
  assignee: Person | null;
  projectId: string | null;
  serviceName: string | null;
  unread: number;
  docsWaiting: number;
  lastMessageAt: string | null;
}

export interface FileRef {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface PortalMessage {
  id: string;
  authorKind: "client" | "staff" | "system";
  body: string;
  createdAt: string;
  seenByClientAt: string | null;
  author: Person | null;
  files: FileRef[];
}

export interface ChecklistItem {
  id: string;
  name: string;
  hint: string | null;
  status: "requested" | "uploaded" | "accepted" | "rejected";
  note: string | null;
  uploadedAt: string | null;
  files: FileRef[];
}

export interface RequestDetail {
  request: RequestRow & { details: string | null; declineReason: string | null; serviceId: string | null; quoteId: string | null; number: number };
  service: ServiceRow | null;
  client: { id: string; name: string; legalName: string | null; gstin: string | null; email: string | null; billingAddress: string | null } | null;
  contact: { name: string | null; email: string; phone: string | null } | null;
  quote: { id: string; number: string | null; status: string; total: number; currency: string } | null;
  project: { id: string; name: string; key: string } | null;
  messages: PortalMessage[];
  documents: ChecklistItem[];
}

export const PORTAL_KEYS = ["services", "service-requests", "service-request", "project-client", "requests-summary", "portal-settings"];

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: "neutral" | "collab" | "finance" | "people" | "danger" | "brand" }> = {
  new: { label: "New", tone: "brand" },
  in_discussion: { label: "In discussion", tone: "collab" },
  quoted: { label: "Quoted", tone: "finance" },
  accepted: { label: "Quote accepted", tone: "people" },
  started: { label: "Project started", tone: "people" },
  declined: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const usePortalSettings = () =>
  useQuery({ queryKey: ["portal-settings"], queryFn: () => api<{ listed: boolean; tagline: string | null; url: string; directoryUrl: string }>("portal-settings") });
export const useServices = () => useQuery({ queryKey: ["services"], queryFn: () => api<{ services: ServiceRow[] }>("services") });
export const useServiceRequests = (status: string) =>
  useQuery({ queryKey: ["service-requests", status], queryFn: () => api<{ requests: RequestRow[] }>(`service-requests${status ? `?status=${status}` : ""}`), refetchInterval: 30_000 });
export const useServiceRequest = (id: string) => useQuery({ queryKey: ["service-request", id], queryFn: () => api<RequestDetail>(`service-requests/${id}`), refetchInterval: 15_000 });
export const useRequestsSummary = (enabled: boolean) =>
  useQuery({ queryKey: ["requests-summary"], queryFn: () => api<{ new: number; unread: number }>("service-requests-summary"), enabled, refetchInterval: 60_000 });
export const useProjectClient = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ["project-client", id],
    queryFn: () =>
      api<{
        clientId: string | null;
        portalPeople: { name: string | null; email: string; lastSignInAt: string | null }[];
        portalUrl: string;
        request: { id: string; label: string } | null;
        messages: PortalMessage[];
        documents: ChecklistItem[];
      }>(`projects/${id}/client`),
    enabled,
    refetchInterval: 15_000,
  });
