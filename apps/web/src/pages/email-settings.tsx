import { can } from "@operant/core";
import { Badge, Button, Card, cn, Field, Input, Select, Skeleton } from "@operant/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy, Globe, Mail, RefreshCw, Send, Server, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "../components/app-shell.tsx";
import { api, type Me } from "../lib/api.ts";
import { formatDate, useApiMutation } from "../lib/people.ts";

type Mode = "platform" | "domain" | "smtp";

interface EmailView {
  mode: Mode;
  chosenMode: Mode;
  fromName: string | null;
  replyTo: string | null;
  defaults: { name: string; replyTo: string | null };
  from: string;
  platform: { from: string; enabled: boolean };
  domainsAvailable: boolean;
  smtpAvailable: boolean;
  domain: { name: string; fromEmail: string | null; status: "pending" | "verified" | "failed" | null; records: { purpose: string; type: string; name: string; value: string; priority?: number; status?: string }[]; verifiedAt: string | null } | null;
  smtp: { host: string; port: number; security: "ssl" | "starttls"; username: string; fromEmail: string; verifiedAt: string | null } | null;
  lastError: { message: string; at: string } | null;
}

const KEYS = ["email-settings", "finance-settings"];
const useEmail = () => useQuery({ queryKey: ["email-settings"], queryFn: () => api<EmailView>("email-settings") });

/** Writes that return the new view: update the cache with it straight away. */
function useEmailAction<V>(fn: (v: V) => Promise<EmailView>, success?: string) {
  const qc = useQueryClient();
  return useApiMutation(fn, {
    invalidate: KEYS,
    success,
    onSuccess: (view) => qc.setQueryData(["email-settings"], view),
  });
}

const copy = (text: string) => (void navigator.clipboard?.writeText(text), toast.success("Copied"));

function Option({ active, current, icon: Icon, title, description, children }: { active: boolean; current: boolean; icon: typeof Mail; title: string; description: string; children?: ReactNode }) {
  return (
    <Card className={cn("p-5 sm:p-6", current && "ring-2 ring-brand")}>
      <div className="flex items-start gap-4">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", current ? "bg-brand-solid text-white" : "bg-secondary text-tertiary")}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{title}</h2>
            {current ? (
              <Badge tone="brand" dot pill>
                In use
              </Badge>
            ) : active ? (
              <Badge tone="people" pill>
                Ready
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-tertiary">{description}</p>
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
      </div>
    </Card>
  );
}

function DomainSetup({ v, canManage }: { v: EmailView; canManage: boolean }) {
  const [domain, setDomain] = useState("");
  const [local, setLocal] = useState("accounts");
  const add = useEmailAction(() => api<EmailView>("email-settings/domain", { method: "POST", body: JSON.stringify({ domain: domain.trim().toLowerCase(), fromEmail: `${local.trim()}@${domain.trim().toLowerCase()}` }) }), "Domain added. Now add the DNS records.");
  const check = useEmailAction(() => api<EmailView>("email-settings/domain/verify", { method: "POST" }));
  const remove = useEmailAction(() => api<EmailView>("email-settings/domain", { method: "DELETE" }), "Domain removed");
  const use = useEmailAction(() => api<EmailView>("email-settings", { method: "PATCH", body: JSON.stringify({ mode: "domain" }) }), "Now sending from your domain");

  if (!v.domainsAvailable) return <p className="text-sm text-tertiary">Not available on this installation. Connect your mail server instead.</p>;
  if (!v.domain) {
    if (!canManage) return null;
    return (
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate(undefined);
        }}
      >
        <Field label="Your domain">
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="sharmaco.in" required />
        </Field>
        <Field label="Send from">
          <div className="flex items-center gap-1.5">
            <Input value={local} onChange={(e) => setLocal(e.target.value.replace(/[^a-zA-Z0-9._+-]/g, ""))} className="min-w-0" required />
            <span className="shrink-0 text-sm text-tertiary">@{domain || "yourdomain"}</span>
          </div>
        </Field>
        <Button type="submit" variant="primary" disabled={!domain || !local || add.isPending}>
          Add domain
        </Button>
      </form>
    );
  }

  const d = v.domain;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-primary">{d.fromEmail}</span>
        <Badge tone={d.status === "verified" ? "people" : d.status === "failed" ? "danger" : "warning"} dot pill>
          {d.status === "verified" ? `Verified${d.verifiedAt ? ` ${formatDate(d.verifiedAt.slice(0, 10))}` : ""}` : d.status === "failed" ? "Not found" : "Waiting for DNS records"}
        </Badge>
      </div>
      {d.status !== "verified" ? (
        <>
          <p className="text-sm text-secondary">
            Add these records at your domain provider (GoDaddy, Hostinger, Cloudflare, Google Domains and so on), in the DNS settings for <span className="font-medium">{d.name}</span>. They can take from a few minutes to a few hours to be found.
          </p>
          <div className="overflow-x-auto rounded-lg border border-secondary">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-secondary text-xs text-tertiary">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Found</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-secondary">
                {d.records.map((r, i) => (
                  <tr key={i} className="align-top">
                    <td className="px-3 py-2 font-mono text-xs">{r.type}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => copy(r.name)} className="group flex items-center gap-1 text-left font-mono text-xs break-all hover:text-primary" title="Copy">
                        {r.name} <Copy className="size-3 shrink-0 opacity-0 group-hover:opacity-100" />
                      </button>
                    </td>
                    <td className="max-w-80 px-3 py-2">
                      <button type="button" onClick={() => copy(r.value)} className="group flex items-start gap-1 text-left font-mono text-xs break-all hover:text-primary" title="Copy">
                        <span className="line-clamp-3">{r.value}</span> <Copy className="mt-0.5 size-3 shrink-0 opacity-0 group-hover:opacity-100" />
                      </button>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.priority ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{r.status === "verified" ? <CheckCircle2 className="size-4 text-fg-success-primary" /> : <span className="text-tertiary">Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-tertiary">Click a name or value to copy it. Some providers add your domain to the name automatically: if so, enter only the part before {d.name}.</p>
        </>
      ) : null}
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {d.status !== "verified" ? (
            <Button variant="primary" onClick={() => check.mutate(undefined)} disabled={check.isPending}>
              <RefreshCw /> {check.isPending ? "Checking…" : "Check now"}
            </Button>
          ) : v.mode !== "domain" ? (
            <Button variant="primary" onClick={() => use.mutate(undefined)}>
              Send from {d.fromEmail}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => confirm(`Stop sending from ${d.name}?`) && remove.mutate(undefined)}>
            <Trash2 /> Remove
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const PRESETS = [
  { key: "gmail", label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 587, security: "starttls", hint: "Use an app password: Google Account → Security → 2-Step Verification → App passwords." },
  { key: "outlook", label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: 587, security: "starttls", hint: "Your admin may need to turn on 'Authenticated SMTP' for this mailbox." },
  { key: "zoho", label: "Zoho Mail (India)", host: "smtp.zoho.in", port: 465, security: "ssl", hint: "Use an app-specific password if you have two-factor sign-in on." },
  { key: "other", label: "Other (cPanel, Hostinger, …)", host: "", port: 587, security: "starttls", hint: "Your host's help pages list the SMTP server and port." },
] as const;

function SmtpSetup({ v, canManage }: { v: EmailView; canManage: boolean }) {
  const s = v.smtp;
  const [editing, setEditing] = useState(!s);
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["key"]>("gmail");
  const p = PRESETS.find((x) => x.key === preset)!;
  const [host, setHost] = useState(s?.host ?? p.host);
  const [port, setPort] = useState(String(s?.port ?? p.port));
  const [security, setSecurity] = useState<"ssl" | "starttls">(s?.security ?? p.security);
  const [username, setUsername] = useState(s?.username ?? "");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState(s?.fromEmail ?? "");

  const connect = useEmailAction(
    () => api<EmailView>("email-settings/smtp", { method: "PUT", body: JSON.stringify({ host, port: Number(port), security, username, ...(password ? { password } : {}), fromEmail: fromEmail || username }) }),
    "Connected. We sent you a test email through it.",
  );
  const disconnect = useEmailAction(() => api<EmailView>("email-settings/smtp", { method: "DELETE" }), "Mail server disconnected");
  const use = useEmailAction(() => api<EmailView>("email-settings", { method: "PATCH", body: JSON.stringify({ mode: "smtp" }) }), "Now sending through your mail server");

  if (!v.smtpAvailable) return <p className="text-sm text-tertiary">Not available on this installation.</p>;
  if (s && !editing) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-secondary">
          <span className="font-medium text-primary">{s.fromEmail}</span> through {s.host}:{s.port}
          {s.verifiedAt ? <span className="text-tertiary"> · tested {formatDate(s.verifiedAt.slice(0, 10))}</span> : null}
        </p>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {v.mode !== "smtp" ? (
              <Button variant="primary" onClick={() => use.mutate(undefined)}>
                Send through it
              </Button>
            ) : null}
            <Button onClick={() => setEditing(true)}>Change</Button>
            <Button variant="ghost" onClick={() => confirm("Disconnect your mail server?") && disconnect.mutate(undefined)}>
              <Trash2 /> Disconnect
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
  if (!canManage) return null;

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        connect.mutate(undefined);
      }}
    >
      <Field label="Your email provider" className="sm:col-span-2" hint={p.hint}>
        <Select
          value={preset}
          onChange={(e) => {
            const next = PRESETS.find((x) => x.key === e.target.value)!;
            setPreset(next.key);
            setHost(next.host);
            setPort(String(next.port));
            setSecurity(next.security);
          }}
        >
          {PRESETS.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="SMTP server">
        <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.yourhost.com" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Port">
          <Select value={port} onChange={(e) => setPort(e.target.value)}>
            {["587", "465", "25", "2525"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Security">
          <Select value={security} onChange={(e) => setSecurity(e.target.value as "ssl" | "starttls")}>
            <option value="starttls">STARTTLS</option>
            <option value="ssl">SSL/TLS</option>
          </Select>
        </Field>
      </div>
      <Field label="Username" hint="Usually your full email address">
        <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" required />
      </Field>
      <Field label="Password" hint={s ? "Leave blank to keep the saved one" : "An app password if your provider offers them"}>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required={!s} />
      </Field>
      <Field label="Send from" hint="Must be an address this login is allowed to send as" className="sm:col-span-2">
        <Input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder={username || "accounts@yourfirm.in"} />
      </Field>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={connect.isPending || !host || !username || (!s && !password)}>
          <Send /> {connect.isPending ? "Testing…" : "Connect and send a test"}
        </Button>
        {s ? (
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
        <span className="text-xs text-tertiary">We send you a test through it first; nothing changes unless it arrives. The password is stored encrypted.</span>
      </div>
    </form>
  );
}

export function EmailSettingsPage({ me }: { me: Me }) {
  const canManage = can(me.org.permissions, "settings", "manage");
  const { data: v } = useEmail();
  const [fromName, setFromName] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const save = useEmailAction(() => api<EmailView>("email-settings", { method: "PATCH", body: JSON.stringify({ fromName: fromName ?? undefined, replyTo: replyTo ?? undefined }) }), "Saved");
  const usePlatform = useEmailAction(() => api<EmailView>("email-settings", { method: "PATCH", body: JSON.stringify({ mode: "platform" }) }), "Now sending from Operant's address");
  const test = useApiMutation(() => api<{ to: string; sent: boolean; message: string | null }>("email-settings/test", { method: "POST" }), {
    invalidate: KEYS,
    onSuccess: (r) => (r.sent ? toast.success(`Test email sent to ${r.to}`) : toast.error("Test email not sent", { description: r.message ?? undefined })),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 sm:p-8">
      <PageHeader title="Email" description="How emails reach your clients: invoices, quotes, reminders, and messages and sign-in codes from your client portal." />
      {!v ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <Card className="p-5 sm:p-6">
            <div className="text-sm text-tertiary">Clients see emails from</div>
            <div className="mt-1 font-mono text-sm font-medium break-all text-primary">{v.from}</div>
            <div className="mt-1 text-sm text-tertiary">Replies go to {v.defaults.replyTo ?? "the sender"}</div>
            {v.lastError ? (
              <div className="mt-4 flex gap-2 rounded-lg bg-warning-primary px-3 py-2 text-sm text-warning-primary ring-1 ring-warning-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  On {formatDate(v.lastError.at.slice(0, 10))}, sending your way failed, so Operant's address was used instead. {v.lastError.message}
                </span>
              </div>
            ) : null}
            {canManage ? (
              <Button className="mt-4" onClick={() => test.mutate(undefined)} disabled={test.isPending}>
                <Send /> {test.isPending ? "Sending…" : "Send me a test email"}
              </Button>
            ) : null}
          </Card>

          <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="font-semibold">Sender name and replies</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name clients see" hint="Usually your business name">
                <Input value={fromName ?? v.fromName ?? ""} onChange={(e) => setFromName(e.target.value)} placeholder={v.defaults.name} maxLength={80} disabled={!canManage} />
              </Field>
              <Field label="Replies go to" hint="Defaults to the billing email in Finance settings">
                <Input type="email" value={replyTo ?? v.replyTo ?? ""} onChange={(e) => setReplyTo(e.target.value)} placeholder={v.defaults.replyTo ?? "accounts@yourfirm.in"} disabled={!canManage} />
              </Field>
            </div>
            {canManage && (fromName !== null || replyTo !== null) ? (
              <Button variant="primary" onClick={() => save.mutate(undefined, { onSuccess: () => (setFromName(null), setReplyTo(null)) })} disabled={save.isPending}>
                Save
              </Button>
            ) : null}
          </Card>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Send from</h2>
            <Option
              active
              current={v.mode === "platform"}
              icon={Mail}
              title="Operant's address"
              description={`Works straight away: emails come from ${v.platform.from}, with your name, and replies come to you.`}
            >
              {canManage && v.mode !== "platform" ? (
                <Button size="sm" onClick={() => usePlatform.mutate(undefined)}>
                  Use this instead
                </Button>
              ) : null}
            </Option>
            <Option
              active={v.domain?.status === "verified"}
              current={v.mode === "domain"}
              icon={Globe}
              title="Your own domain (recommended)"
              description="Emails come from your address, like accounts@yourfirm.in, through Operant's email service. You add a few DNS records once, at your domain provider. Best for getting into inboxes."
            >
              <DomainSetup v={v} canManage={canManage} />
            </Option>
            <Option
              active={Boolean(v.smtp?.verifiedAt)}
              current={v.mode === "smtp"}
              icon={Server}
              title="Your mail server"
              description="Send through your own mailbox (Gmail, Microsoft 365, Zoho or your host) with its SMTP login. No DNS changes needed, but your provider's daily sending limits apply, and you'll need to update it here if the password changes."
            >
              <SmtpSetup v={v} canManage={canManage} />
            </Option>
          </div>
        </>
      )}
    </div>
  );
}
