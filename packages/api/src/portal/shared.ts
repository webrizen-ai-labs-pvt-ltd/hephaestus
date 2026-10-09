import { formatMoney } from "@operant/core";
import {
  attachments,
  clientDocuments,
  type Db,
  employees,
  financeSettings,
  members,
  notifications,
  orgs,
  portalMessages,
  portalUsers,
  type services,
} from "@operant/db";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { sendAsOrg } from "../email/org-mail.ts";
import type { ApiDeps } from "../context.ts";
import { deliver, renderEmail } from "../finance/email.ts";

export type Service = typeof services.$inferSelect;

export const portalBase = (deps: ApiDeps) => (deps.portalUrl ?? "http://localhost:5175").replace(/\/$/, "");

export const REQUEST_LABEL = (n: number) => `REQ-${n}`;

/** "₹5,000", "From ₹5,000 a month", "Price on request". */
export function priceLabel(s: Pick<Service, "priceType" | "price" | "billing">, currency = "INR") {
  if (s.priceType === "quote" || s.price == null) return "Price on request";
  const per = { one_time: "", monthly: " a month", quarterly: " a quarter", yearly: " a year" }[s.billing];
  return `${s.priceType === "from" ? "From " : ""}${formatMoney(s.price, currency)}${per}`;
}

/** Who hears about client activity: the people named, or else the org's owners and admins. */
export async function staffRecipients(db: Db, orgId: string, preferred: (string | null | undefined)[]) {
  const named = [...new Set(preferred.filter((x): x is string => Boolean(x)))];
  if (named.length) return named;
  const rows = await db
    .select({ userId: members.userId })
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.status, "active"), sql`${members.roles} && array['owner','admin']::text[]`));
  return rows.map((r) => r.userId);
}

/** In-app (and optionally email) notification for team members, from client activity. */
export async function notifyStaff(
  deps: ApiDeps,
  orgId: string,
  userIds: string[],
  n: { type: string; title: string; body?: string; link: string },
  opts: { email?: boolean } = {},
) {
  if (!userIds.length) return;
  await deps.db.insert(notifications).values(userIds.map((recipientId) => ({ orgId, recipientId, ...n })));
  await Promise.all(userIds.map((userId) => deps.realtime.publish({ channel: `org:${orgId}:user:${userId}`, type: "notification", payload: { type: n.type } })));
  if (!opts.email || !deps.mailer.enabled) return;
  const rows = await deps.db
    .select({ email: members.email, name: members.name })
    .from(members)
    .where(and(eq(members.orgId, orgId), inArray(members.userId, userIds), eq(members.status, "active")));
  const href = `${deps.appUrl.replace(/\/$/, "")}${n.link}`;
  for (const r of rows) {
    const { html, text } = renderEmail({ greeting: `Hi ${r.name.split(" ")[0]},`, lead: `${n.title}${n.body ? `: ${n.body}` : ""}`, cta: { label: "Open in Operant", href }, signOff: "Operant" });
    await deliver(deps.mailer, { to: r.email, subject: n.title, html, text });
  }
}

/** Email a client's people about something new in the portal. Never throws. */
export async function emailClientPeople(
  deps: ApiDeps,
  orgId: string,
  to: { clientId: string | null; portalUserId: string | null },
  msg: { subject: string; lead: string; path: string; cta?: string },
) {
  if (!deps.mailer.enabled) return;
  const people = await deps.db
    .select({ email: portalUsers.email, name: portalUsers.name })
    .from(portalUsers)
    .where(
      and(
        eq(portalUsers.orgId, orgId),
        or(to.clientId ? eq(portalUsers.clientId, to.clientId) : sql`false`, to.portalUserId ? eq(portalUsers.id, to.portalUserId) : sql`false`),
      ),
    );
  if (!people.length) return;
  const [org] = await deps.db.select({ name: orgs.name, slug: orgs.slug }).from(orgs).where(eq(orgs.id, orgId));
  const [fs] = await deps.db.select({ legalName: financeSettings.legalName, email: financeSettings.email }).from(financeSettings).where(eq(financeSettings.orgId, orgId));
  const seller = fs?.legalName ?? org!.name;
  for (const p of people) {
    const { html, text } = renderEmail({
      greeting: `Hello${p.name ? ` ${p.name.split(" ")[0]}` : ""},`,
      lead: msg.lead,
      cta: { label: msg.cta ?? "Open your portal", href: `${portalBase(deps)}/${org!.slug}${msg.path}` },
      signOff: `Thank you,\n${seller}`,
      footnote: `You're receiving this because you use ${seller}'s client portal.`,
    });
    await sendAsOrg(deps, orgId, { to: p.email, subject: msg.subject, html, text, replyTo: fs?.email ?? null });
  }
}

/** A team member as clients see them: name, photo and job title. */
export async function staffCards(db: Db, orgId: string, userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return new Map<string, StaffCard>();
  const rows = await db
    .select({ userId: members.userId, memberId: members.id, name: members.name, image: members.image, jobTitle: employees.jobTitle })
    .from(members)
    .leftJoin(employees, and(eq(employees.memberId, members.id), eq(employees.orgId, orgId)))
    .where(and(eq(members.orgId, orgId), inArray(members.userId, ids)));
  return new Map(rows.map((r) => [r.userId, { name: r.name, image: r.image, jobTitle: r.jobTitle }]));
}

export interface StaffCard {
  name: string;
  image: string | null;
  jobTitle: string | null;
}

/** A conversation and checklist belong to a request, or to the project it became. */
export type Scope = { requestId: string } | { projectId: string };
const msgScope = (s: Scope) => ("requestId" in s ? eq(portalMessages.requestId, s.requestId) : eq(portalMessages.projectId, s.projectId));
const docScope = (s: Scope) => ("requestId" in s ? eq(clientDocuments.requestId, s.requestId) : eq(clientDocuments.projectId, s.projectId));

export interface FileRef {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: Date;
}

async function filesFor(db: Db, orgId: string, ownerType: string, ids: string[]) {
  if (!ids.length) return new Map<string, FileRef[]>();
  const rows = await db
    .select({ id: attachments.id, ownerId: attachments.ownerId, name: attachments.name, contentType: attachments.contentType, size: attachments.size, createdAt: attachments.createdAt })
    .from(attachments)
    .where(and(eq(attachments.orgId, orgId), eq(attachments.ownerType, ownerType), inArray(attachments.ownerId, ids), isNull(attachments.deletedAt)))
    .orderBy(asc(attachments.createdAt));
  const map = new Map<string, FileRef[]>();
  for (const { ownerId, ...f } of rows) map.set(ownerId, [...(map.get(ownerId) ?? []), f]);
  return map;
}

/** The conversation, oldest first, with each author's name and photo, and attached files. */
export async function conversation(db: Db, orgId: string, scope: Scope) {
  const rows = await db
    .select({
      id: portalMessages.id,
      authorKind: portalMessages.authorKind,
      body: portalMessages.body,
      createdAt: portalMessages.createdAt,
      seenByClientAt: portalMessages.seenByClientAt,
      seenByStaffAt: portalMessages.seenByStaffAt,
      staffName: members.name,
      staffImage: members.image,
      staffTitle: employees.jobTitle,
      clientName: portalUsers.name,
      clientEmail: portalUsers.email,
      portalUserId: portalMessages.portalUserId,
    })
    .from(portalMessages)
    .leftJoin(members, eq(members.id, portalMessages.memberId))
    .leftJoin(employees, and(eq(employees.memberId, portalMessages.memberId), eq(employees.orgId, orgId)))
    .leftJoin(portalUsers, eq(portalUsers.id, portalMessages.portalUserId))
    .where(and(eq(portalMessages.orgId, orgId), msgScope(scope)))
    .orderBy(asc(portalMessages.createdAt))
    .limit(500);
  const files = await filesFor(
    db,
    orgId,
    "portal_message",
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    id: r.id,
    authorKind: r.authorKind,
    body: r.body,
    createdAt: r.createdAt,
    seenByClientAt: r.seenByClientAt,
    seenByStaffAt: r.seenByStaffAt,
    portalUserId: r.portalUserId,
    author:
      r.authorKind === "staff"
        ? { name: r.staffName ?? "Team member", image: r.staffImage, jobTitle: r.staffTitle }
        : r.authorKind === "client"
          ? { name: r.clientName ?? r.clientEmail ?? "Client", image: null, jobTitle: null }
          : null,
    files: files.get(r.id) ?? [],
  }));
}

/** The document checklist, with what's been uploaded against each item. */
export async function documentChecklist(db: Db, orgId: string, scope: Scope) {
  const rows = await db
    .select()
    .from(clientDocuments)
    .where(and(eq(clientDocuments.orgId, orgId), docScope(scope)))
    .orderBy(asc(clientDocuments.createdAt));
  const files = await filesFor(
    db,
    orgId,
    "client_document",
    rows.map((r) => r.id),
  );
  return rows.map((d) => ({ id: d.id, name: d.name, hint: d.hint, status: d.status, note: d.note, uploadedAt: d.uploadedAt, reviewedAt: d.reviewedAt, files: files.get(d.id) ?? [] }));
}

/** Mark the other side's messages as seen by this side. */
export async function markSeen(db: Db, orgId: string, scope: Scope, by: "client" | "staff") {
  if (by === "client") {
    await db
      .update(portalMessages)
      .set({ seenByClientAt: new Date() })
      .where(and(eq(portalMessages.orgId, orgId), msgScope(scope), isNull(portalMessages.seenByClientAt), sql`${portalMessages.authorKind} <> 'client'`));
  } else {
    await db
      .update(portalMessages)
      .set({ seenByStaffAt: new Date() })
      .where(and(eq(portalMessages.orgId, orgId), msgScope(scope), isNull(portalMessages.seenByStaffAt), eq(portalMessages.authorKind, "client")));
  }
}
