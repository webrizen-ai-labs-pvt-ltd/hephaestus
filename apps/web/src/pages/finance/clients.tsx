import { can, INDIAN_STATES, isValidGstin, stateOfGstin } from "@hephaestus/core";
import { Avatar, Button, Card, cn, Dialog, DialogContent, EmptyState, Field, Input, Select, Skeleton, Textarea } from "@hephaestus/ui";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Building2, FilePlus2, Mail, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { PageHeader } from "../../components/app-shell.tsx";
import { Thread } from "../../components/collab/thread.tsx";
import { api, type Me } from "../../lib/api.ts";
import { type ClientInfo, compactMoney, FINANCE_KEYS, money, useClient, useClients, useDocs } from "../../lib/finance.ts";
import { formatDate, useApiMutation } from "../../lib/people.ts";
import { FinanceBody, StatusPill } from "./layout.tsx";
import { displayStatus } from "../../lib/finance.ts";
import { useCrumb } from "../../lib/breadcrumbs.ts";

type Contact = { name: string; email: string | null; phone: string | null; designation: string | null; isPrimary: boolean };

export function ClientDialog({
  open,
  onOpenChange,
  client,
  contacts: initialContacts = [],
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  client?: ClientInfo & { id: string; email?: string | null; phone?: string | null };
  contacts?: Contact[];
  onSaved?: (id: string) => void;
}) {
  const [f, setF] = useState({
    name: client?.name ?? "",
    legalName: client?.legalName ?? "",
    gstin: client?.gstin ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    billingAddress: client?.billingAddress ?? "",
    stateCode: client?.stateCode ?? "",
    country: client?.country ?? "IN",
    currency: client?.currency ?? "INR",
    paymentTermsDays: client?.paymentTermsDays?.toString() ?? "",
    notes: client?.notes ?? "",
  });
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const abroad = f.country !== "IN";

  const save = useApiMutation(
    async () => {
      const body = JSON.stringify({
        name: f.name,
        legalName: f.legalName || null,
        gstin: abroad ? null : f.gstin || null,
        email: f.email || null,
        phone: f.phone || null,
        billingAddress: f.billingAddress || null,
        stateCode: abroad ? null : f.stateCode || null,
        country: f.country,
        currency: f.currency,
        paymentTermsDays: f.paymentTermsDays === "" ? null : Number(f.paymentTermsDays),
        notes: f.notes || null,
        contacts: contacts.filter((c) => c.name.trim()),
      });
      if (client) {
        await api(`clients/${client.id}`, { method: "PATCH", body });
        return client.id;
      }
      return (await api<{ client: { id: string } }>("clients", { method: "POST", body })).client.id;
    },
    { invalidate: FINANCE_KEYS, success: client ? "Client updated" : "Client added", onSuccess: (id) => (onOpenChange(false), onSaved?.(id)) },
  );

  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Enter a name";
    if (!abroad && f.gstin && !isValidGstin(f.gstin)) e.gstin = "That GSTIN isn't valid";
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = "Enter a valid email";
    setErrors(e);
    if (!Object.values(e).some(Boolean)) save.mutate(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={client ? "Edit client" : "New client"}
        icon={Building2}
        className="w-[min(680px,calc(100vw-32px))]"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={save.isPending} onClick={submit}>
              {client ? "Save" : "Add client"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name}>
            <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Spice Route Restaurants" autoFocus maxLength={160} />
          </Field>
          <Field label="Legal name" hint="As registered, for the invoice">
            <Input value={f.legalName} onChange={(e) => set("legalName", e.target.value)} maxLength={200} />
          </Field>
          <Field label="Country">
            <Select value={f.country} onChange={(e) => (set("country", e.target.value), set("currency", e.target.value === "IN" ? "INR" : f.currency === "INR" ? "USD" : f.currency))}>
              <option value="IN">India</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="AE">United Arab Emirates</option>
              <option value="SG">Singapore</option>
              <option value="AU">Australia</option>
              <option value="CA">Canada</option>
              <option value="DE">Germany</option>
            </Select>
          </Field>
          {abroad ? (
            <Field label="Currency">
              <Select value={f.currency} onChange={(e) => set("currency", e.target.value)}>
                {["USD", "GBP", "EUR", "AED", "SGD", "AUD", "CAD"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="GSTIN" error={errors.gstin} hint={f.gstin && isValidGstin(f.gstin) ? INDIAN_STATES[stateOfGstin(f.gstin)] : "Leave blank if they aren't registered"}>
              <Input
                value={f.gstin}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 15);
                  set("gstin", v);
                  if (isValidGstin(v)) set("stateCode", stateOfGstin(v));
                }}
                placeholder="27AAPFU0939F1ZV"
                className="font-mono"
              />
            </Field>
          )}
          {!abroad ? (
            <Field label="State (place of supply)" hint="Decides CGST + SGST or IGST">
              <Select value={f.stateCode} onChange={(e) => set("stateCode", e.target.value)} disabled={Boolean(f.gstin && isValidGstin(f.gstin))}>
                <option value="">Same as yours</option>
                {Object.entries(INDIAN_STATES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Payment terms" hint="Days to pay; blank uses your default">
            <Input type="number" min={0} max={365} value={f.paymentTermsDays} onChange={(e) => set("paymentTermsDays", e.target.value)} placeholder="15" />
          </Field>
          <Field label="Billing email" error={errors.email} hint="Invoices and reminders go here">
            <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="accounts@client.com" />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={32} />
          </Field>
          <Field label="Billing address" className="sm:col-span-2">
            <Textarea value={f.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} maxLength={500} className="min-h-16" />
          </Field>
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between text-sm font-medium">
              Contacts
              <Button type="button" size="sm" variant="ghost" onClick={() => setContacts((c) => [...c, { name: "", email: null, phone: null, designation: null, isPrimary: c.length === 0 }])}>
                <Plus /> Add
              </Button>
            </div>
            {contacts.map((c, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_32px] gap-2">
                <Input value={c.name} placeholder="Name" aria-label="Contact name" onChange={(e) => setContacts((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Input value={c.email ?? ""} placeholder="Email" aria-label="Contact email" onChange={(e) => setContacts((l) => l.map((x, j) => (j === i ? { ...x, email: e.target.value || null } : x)))} />
                <Input value={c.designation ?? ""} placeholder="Role" aria-label="Contact role" onChange={(e) => setContacts((l) => l.map((x, j) => (j === i ? { ...x, designation: e.target.value || null } : x)))} />
                <Button type="button" size="icon" variant="ghost" aria-label="Remove contact" onClick={() => setContacts((l) => l.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ClientsPage({ me }: { me: Me }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useClients(deferred || undefined);
  const canCreate = can(me.org.permissions, "client", "create");
  const list = data?.clients ?? [];

  return (
    <FinanceBody>
      <PageHeader
        title={me.settings.terms.client.many}
        description="Who you work for and what they owe."
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus /> New {me.settings.terms.client.one.toLowerCase()}
            </Button>
          ) : null
        }
      />
      <div className="relative sm:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, GSTIN or email" className="pl-9" />
      </div>
      {isLoading ? <Skeleton className="h-40" /> : null}
      {!isLoading && list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 />}
            title={deferred ? "No one matches" : "Add your first client"}
            description="Clients hold billing details: GSTIN, place of supply and where invoices go."
            action={canCreate && !deferred ? <Button variant="primary" onClick={() => setAdding(true)}><Plus /> New client</Button> : null}
          />
        </Card>
      ) : (
        <ul className="rise rise-1 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((cl) => {
            const collected = cl.billed ? Math.round(((cl.billed - cl.outstanding) / cl.billed) * 100) : 0;
            return (
              <li key={cl.id}>
                <Link to="/finance/clients/$id" params={{ id: cl.id }} className="group block h-full">
                  <Card className="flex h-full flex-col p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-primary">
                    <div className="flex items-start gap-3">
                      <Avatar name={cl.name} className="size-11 rounded-xl text-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-[16px] font-bold">{cl.name}</div>
                        <div className="truncate text-xs text-tertiary">{cl.email ?? "No billing email"}</div>
                      </div>
                      {cl.overdue ? <span className="rounded-full bg-error-solid/12 px-2 py-0.5 text-[11px] text-error-primary">Overdue</span> : null}
                    </div>
                    <div className="mt-3 truncate text-xs text-tertiary">
                      {cl.gstin ? <span className="font-mono text-primary">{cl.gstin}</span> : cl.country !== "IN" ? `${cl.country} · ${cl.currency}` : cl.stateCode ? INDIAN_STATES[cl.stateCode] : "Unregistered"}
                    </div>
                    <dl className="mt-auto grid grid-cols-2 gap-3 pt-4">
                      <div>
                        <dt className="text-[11px] text-tertiary">Billed</dt>
                        <dd className="font-mono text-sm">{compactMoney(cl.billed, cl.currency)}</dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-[11px] text-tertiary">Outstanding</dt>
                        <dd className={cn("font-mono text-sm", cl.overdue ? "text-error-primary" : !cl.outstanding && "text-quaternary")}>
                          {cl.outstanding ? compactMoney(cl.outstanding, cl.currency) : "—"}
                        </dd>
                      </div>
                    </dl>
                    {cl.billed ? (
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-[var(--chart-collected)]" style={{ width: `${collected}%` }} />
                        </div>
                        <div className="mt-1 text-[11px] text-quaternary">{collected}% collected</div>
                      </div>
                    ) : null}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? <ClientDialog open onOpenChange={setAdding} onSaved={(id) => navigate({ to: "/finance/clients/$id", params: { id } })} /> : null}
    </FinanceBody>
  );
}

export function ClientPage({ me }: { me: Me }) {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const { data, isLoading } = useClient(id);
  useCrumb(data?.client.name);
  const { data: docs } = useDocs({ clientId: id });
  const [editing, setEditing] = useState(false);
  const archive = useApiMutation(() => api(`clients/${id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) }), {
    invalidate: FINANCE_KEYS,
    success: "Client archived",
    onSuccess: () => navigate({ to: "/finance/clients" }),
  });

  if (isLoading || !data) {
    return (
      <FinanceBody>
        <Skeleton className="h-40 w-full" />
      </FinanceBody>
    );
  }
  const { client: cl, contacts } = data;
  const rows = docs?.documents ?? [];
  const today = docs?.today ?? new Date().toISOString().slice(0, 10);
  const outstanding = rows.filter((r) => r.kind === "invoice" && ["sent", "partially_paid"].includes(r.status)).reduce((s, r) => s + r.total - r.amountPaid, 0);
  const canEdit = can(me.org.permissions, "client", "update");

  return (
    <FinanceBody>
      <Link to="/finance/clients" className="inline-flex items-center gap-1 text-sm text-tertiary hover:text-primary">
        <ArrowLeft className="size-4" /> {me.settings.terms.client.many}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{cl.name}</h1>
          <p className="text-sm text-tertiary">
            {[cl.legalName, cl.gstin ? `GSTIN ${cl.gstin}` : null, cl.country !== "IN" ? `${cl.country} · ${cl.currency}` : cl.stateCode ? INDIAN_STATES[cl.stateCode] : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit ? (
            <Button onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          ) : null}
          {can(me.org.permissions, "invoice", "create") ? (
            <Button variant="primary" asChild>
              <Link to="/finance/new" search={{ kind: "invoice", clientId: id }}>
                <FilePlus2 /> New invoice
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between border-b border-secondary px-4 py-3">
              <h2 className="font-bold">Documents</h2>
              <span className="text-sm">
                Outstanding <b className="font-mono">{money(outstanding, cl.currency)}</b>
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="p-4 text-sm text-tertiary">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-border-secondary">
                {rows.map((d) => (
                  <li key={d.id}>
                    <Link to="/finance/invoices/$id" params={{ id: d.id }} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-secondary/60">
                      <span className="w-36 font-mono text-xs">{d.number ?? "Draft"}</span>
                      <span className="flex-1 text-tertiary">{formatDate(d.issueDate)}</span>
                      <StatusPill status={displayStatus(d, today)} />
                      <span className="w-32 text-right font-mono">{money(d.total, d.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4 sm:p-6">
            <h2 className="mb-3 font-bold">Notes and discussion</h2>
            <Thread type="client" id={id} placeholder={`Notes about ${cl.name}, or @mention someone`} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="font-bold">Billing details</h2>
            {cl.email ? (
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-tertiary" /> {cl.email}
              </p>
            ) : null}
            {cl.phone ? (
              <p className="flex items-center gap-2">
                <Phone className="size-4 text-tertiary" /> {cl.phone}
              </p>
            ) : null}
            {cl.billingAddress ? <p className="whitespace-pre-line text-tertiary">{cl.billingAddress}</p> : null}
            <p className="text-tertiary">Payment terms: {cl.paymentTermsDays ?? "default"} days</p>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-bold">Contacts</h2>
            {contacts.length === 0 ? <p className="text-sm text-tertiary">No contacts yet.</p> : null}
            <ul className="space-y-2 text-sm">
              {contacts.map((c) => (
                <li key={c.id}>
                  <div className="font-medium">
                    {c.name} {c.designation ? <span className="font-normal text-tertiary">· {c.designation}</span> : null}
                  </div>
                  <div className="text-xs text-tertiary">{[c.email, c.phone].filter(Boolean).join(" · ")}</div>
                </li>
              ))}
            </ul>
          </Card>
          {canEdit ? (
            <Button variant="ghost" className="w-full" onClick={() => confirm(`Archive ${cl.name}? Their invoices are kept.`) && archive.mutate(undefined)}>
              Archive client
            </Button>
          ) : null}
        </div>
      </div>
      {editing ? <ClientDialog open onOpenChange={setEditing} client={cl} contacts={contacts} /> : null}
    </FinanceBody>
  );
}
