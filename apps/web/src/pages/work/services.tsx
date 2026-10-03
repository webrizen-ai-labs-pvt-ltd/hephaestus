import { can } from "@hephaestus/core";
import { Badge, Button, Card, Dialog, DialogContent, EmptyState, Field, Input, Segmented, Select, Skeleton, Textarea, Toggle } from "@hephaestus/ui";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Copy, ExternalLink, FileText, Plus, Store, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "../../components/app-shell.tsx";
import { api, type Me } from "../../lib/api.ts";
import { useMembers } from "../../lib/collab.ts";
import { toPaise, toRupees } from "../../lib/finance.ts";
import { useApiMutation } from "../../lib/people.ts";
import { PORTAL_KEYS, type PriceType, type ServiceBilling, type ServiceRow, usePortalSettings, useServices } from "../../lib/portal.ts";
import { useProjects } from "../../lib/work.ts";
import { WorkBody } from "./layout.tsx";

const BILLING_LABEL: Record<ServiceBilling, string> = { one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };

function ServiceDialog({ service, onClose }: { service?: ServiceRow; onClose: () => void }) {
  const { data: members } = useMembers();
  const { data: projects } = useProjects("current");
  const [name, setName] = useState(service?.name ?? "");
  const [summary, setSummary] = useState(service?.summary ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [category, setCategory] = useState(service?.category ?? "");
  const [priceType, setPriceType] = useState<PriceType>(service?.priceType ?? "quote");
  const [price, setPrice] = useState(service?.price != null ? toRupees(service.price) : "");
  const [billing, setBilling] = useState<ServiceBilling>(service?.billing ?? "one_time");
  const [days, setDays] = useState(service?.deliveryDays ? String(service.deliveryDays) : "");
  const [docs, setDocs] = useState(service?.requiredDocs ?? []);
  const [docName, setDocName] = useState("");
  const [template, setTemplate] = useState(service?.templateProjectId ?? "");
  const [owner, setOwner] = useState(service?.ownerUserId ?? "");

  const save = useApiMutation(
    () => {
      const body = {
        name,
        summary: summary || null,
        description: description || null,
        category: category || null,
        priceType,
        price: priceType === "quote" ? null : toPaise(price),
        billing,
        deliveryDays: days ? Number(days) : null,
        requiredDocs: docs,
        templateProjectId: template || null,
        ownerUserId: owner || null,
      };
      return service ? api(`services/${service.id}`, { method: "PATCH", body: JSON.stringify(body) }) : api("services", { method: "POST", body: JSON.stringify(body) });
    },
    { invalidate: PORTAL_KEYS, success: service ? "Service saved" : "Service added to your portal", onSuccess: onClose },
  );

  const addDoc = () => {
    if (!docName.trim()) return;
    setDocs([...docs, { name: docName.trim() }]);
    setDocName("");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={service ? "Edit service" : "New service"}
        icon={Store}
        className="w-[min(680px,calc(100vw-32px))]"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!name.trim() || (priceType !== "quote" && !price) || save.isPending} onClick={() => save.mutate(undefined)}>
              {service ? "Save" : "Add service"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="GST return filing" autoFocus />
          </Field>
          <Field label="Category (optional)">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} placeholder="Tax" />
          </Field>
          <Field label="One line about it" className="sm:col-span-2">
            <Input value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200} placeholder="Monthly GSTR-1 and GSTR-3B, reconciled with your books" />
          </Field>
          <Field label="Description (optional)" className="sm:col-span-2">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={5000} placeholder="What's included, what isn't, how it works." />
          </Field>
          <Field label="Price" className="sm:col-span-2">
            <Segmented
              variant="toggle"
              aria-label="Price"
              value={priceType}
              onChange={setPriceType}
              items={[
                { key: "fixed", label: "Fixed price" },
                { key: "from", label: "Starting from" },
                { key: "quote", label: "On request" },
              ]}
            />
          </Field>
          {priceType !== "quote" ? (
            <>
              <Field label={priceType === "from" ? "From (₹)" : "Price (₹)"} hint="Before GST">
                <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Billed">
                <Select value={billing} onChange={(e) => setBilling(e.target.value as ServiceBilling)}>
                  {Object.entries(BILLING_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : (
            <p className="text-xs text-tertiary sm:col-span-2">Clients see "Price on request". You send a quote from the request.</p>
          )}
          <Field label="Usual turnaround (days, optional)">
            <Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <Field label="New requests go to" hint="Otherwise owners and admins">
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Owners and admins</option>
              {members?.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project template (optional)" hint="Its stages, milestones and tasks are copied when work starts." className="sm:col-span-2">
            <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">No template</option>
              {projects?.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <div className="text-sm font-medium text-secondary">Documents to ask for</div>
            <p className="text-xs text-tertiary">The client gets a checklist to upload these when they request the service.</p>
            <ul className="mt-2 space-y-1.5">
              {docs.map((d, i) => (
                <li key={`${d.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm">
                  <FileText className="size-4 text-quaternary" />
                  <span className="flex-1">{d.name}</span>
                  <button type="button" aria-label={`Remove ${d.name}`} onClick={() => setDocs(docs.filter((_, j) => j !== i))} className="text-quaternary hover:text-secondary">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Input value={docName} onChange={(e) => setDocName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDoc())} placeholder="e.g. PAN card" maxLength={120} />
              <Button onClick={addDoc} disabled={!docName.trim()}>
                Add
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Portal visibility: listed in the public directory, the tagline, and the link to share. */
function PortalCard({ canManage }: { canManage: boolean }) {
  const { data } = usePortalSettings();
  const [tagline, setTagline] = useState<string | null>(null);
  const save = useApiMutation((body: { listed?: boolean; tagline?: string | null }) => api("portal-settings", { method: "PATCH", body: JSON.stringify(body) }), {
    invalidate: PORTAL_KEYS,
    success: "Saved",
  });
  if (!data) return <Skeleton className="h-28 w-full" />;
  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Your client portal</h2>
          <a href={data.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 font-mono text-sm text-brand-secondary hover:underline">
            {data.url} <ExternalLink className="size-3.5" />
          </a>
        </div>
        <Button size="sm" onClick={() => (void navigator.clipboard?.writeText(data.url), toast.success("Portal link copied"))}>
          <Copy /> Copy link
        </Button>
      </div>
      <Toggle
        isSelected={data.listed}
        isDisabled={!canManage}
        onChange={(v) => save.mutate({ listed: v })}
        size="md"
        label="Show in the public directory"
        hint={
          <>
            New clients can find you at{" "}
            <a href={data.directoryUrl} target="_blank" rel="noreferrer" className="underline">
              {data.directoryUrl.replace(/^https?:\/\//, "")}
            </a>
            . Clients with your link can always reach your portal.
          </>
        }
      />
      <Field label="Tagline" hint="One line under your name in the directory and on your portal.">
        <div className="flex gap-2">
          <Input value={tagline ?? data.tagline ?? ""} onChange={(e) => setTagline(e.target.value)} maxLength={160} disabled={!canManage} placeholder="Chartered accountants for growing businesses" />
          {canManage && tagline !== null && tagline !== (data.tagline ?? "") ? (
            <Button variant="primary" onClick={() => save.mutate({ tagline: tagline || null }, { onSuccess: () => setTagline(null) })}>
              Save
            </Button>
          ) : null}
        </div>
      </Field>
    </Card>
  );
}

export function ServicesPage({ me }: { me: Me }) {
  const { data } = useServices();
  const [editing, setEditing] = useState<ServiceRow | "new" | null>(null);
  const canManage = can(me.org.permissions, "settings", "manage");
  const toggle = useApiMutation(({ id, active }: { id: string; active: boolean }) => api(`services/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }), { invalidate: PORTAL_KEYS });
  const remove = useApiMutation((id: string) => api<{ hidden: boolean }>(`services/${id}`, { method: "DELETE" }), {
    invalidate: PORTAL_KEYS,
    onSuccess: (r) => toast.success(r.hidden ? "Hidden from the portal (it has requests, so it's kept)" : "Service deleted"),
  });

  return (
    <WorkBody>
      <Link to="/work/requests" className="inline-flex items-center gap-1 text-sm text-tertiary hover:text-primary">
        <ArrowLeft className="size-4" /> Client requests
      </Link>
      <PageHeader
        title="Services"
        description="What clients can request in your portal. Show a fixed price, a starting price, or 'on request'."
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus /> New service
            </Button>
          ) : null
        }
      />
      <PortalCard canManage={canManage} />
      {!data ? (
        <Skeleton className="h-64 w-full" />
      ) : data.services.length === 0 ? (
        <Card>
          <EmptyState icon={<Store />} title="No services yet" description="Add what you offer. Clients see it in your portal and can request it." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.services.map((s) => (
            <Card key={s.id} className={s.active ? "flex flex-col p-5" : "flex flex-col p-5 opacity-60"}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {s.category ? <div className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">{s.category}</div> : null}
                  <h3 className="font-semibold">{s.name}</h3>
                  {s.summary ? <p className="mt-1 line-clamp-2 text-sm text-tertiary">{s.summary}</p> : null}
                </div>
                {canManage ? <Toggle isSelected={s.active} onChange={(v) => toggle.mutate({ id: s.id, active: v })} size="sm" aria-label="Show in the portal" /> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="brand" pill>
                  {s.priceLabel}
                </Badge>
                {s.deliveryDays ? <Badge tone="neutral">{s.deliveryDays} days</Badge> : null}
                {s.requiredDocs.length ? <Badge tone="neutral">{s.requiredDocs.length} documents</Badge> : null}
                {s.templateProjectId ? <Badge tone="neutral">Has template</Badge> : null}
                {!s.active ? <Badge tone="neutral">Hidden</Badge> : null}
              </div>
              <div className="mt-auto flex items-center gap-2 pt-4 text-sm">
                <Link to="/work/requests" className="text-tertiary hover:text-secondary">
                  {s.open} open · {s.requests} request{s.requests === 1 ? "" : "s"} in all
                </Link>
                {canManage ? (
                  <>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditing(s)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => confirm(`Delete ${s.name}?`) && remove.mutate(s.id)}>
                      <Trash2 />
                    </Button>
                  </>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing ? <ServiceDialog service={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </WorkBody>
  );
}
