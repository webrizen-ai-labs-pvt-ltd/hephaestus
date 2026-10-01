import { can, PILLARS, type Pillar, type TermKey } from "@hephaestus/core";
import { Avatar, Badge, Button, Card, cn, Input, Label } from "@hephaestus/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "../components/app-shell.tsx";
import { api, type Me } from "../lib/api.ts";
import { MAIN_NAV } from "../lib/nav.ts";
import { useTheme } from "../lib/theme.ts";

export function OrgSettingsPage({ me }: { me: Me }) {
  const canManage = can(me.org.permissions, "settings", "manage");
  const qc = useQueryClient();
  const [terms, setTerms] = useState(me.settings.terms);
  const [pillars, setPillars] = useState<Pillar[]>(me.settings.enabledPillars);
  const [workWeek, setWorkWeek] = useState<number[]>(me.settings.workWeek);

  const save = useMutation({
    mutationFn: () => api("settings", { method: "PATCH", body: JSON.stringify({ terms, enabledPillars: pillars, workWeek }) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const togglePillar = (p: Pillar) =>
    setPillars((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 sm:p-8">
      <PageHeader
        title="Organization"
        description="Name, members and roles are managed in your Webrizen account. Everything else lives here."
      />

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-xl bg-primary font-display text-2xl font-bold text-primary-foreground">
            {me.org.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-display text-xl font-bold">{me.org.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{me.org.slug}</div>
          </div>
          <Badge className="ml-auto">{me.settings.currency}</Badge>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-bold">Pillars</h2>
        <p className="mt-1 text-sm text-muted-foreground">Turn off the parts of Hephaestus your team doesn't use.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {PILLARS.map((p) => {
            const nav = MAIN_NAV.find((n) => n.pillar === p)!;
            const on = pillars.includes(p);
            return (
              <button
                key={p}
                type="button"
                disabled={!canManage}
                onClick={() => togglePillar(p)}
                aria-pressed={on}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                  on ? "border-input bg-surface-2" : "border-border opacity-60",
                )}
              >
                <nav.icon className={cn("size-4", nav.tone)} />
                <span className="flex-1 font-medium">{nav.label}</span>
                <span className={cn("h-5 w-9 rounded-full p-0.5 transition-colors", on ? "bg-primary" : "bg-input")}>
                  <span className={cn("block size-4 rounded-full bg-white transition-transform", on && "translate-x-4")} />
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-bold">Working days</h2>
        <p className="mt-1 text-sm text-muted-foreground">Leave only counts these days. Holidays are set in People → Leave.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => {
            const day = i + 1;
            const on = workWeek.includes(day);
            return (
              <button
                key={label}
                type="button"
                disabled={!canManage}
                aria-pressed={on}
                onClick={() => setWorkWeek((w) => (on ? (w.length > 1 ? w.filter((d) => d !== day) : w) : [...w, day].sort()))}
                className={cn(
                  "h-10 w-14 rounded-lg border text-sm font-medium transition-colors",
                  on ? "border-people bg-[color-mix(in_srgb,var(--people)_14%,transparent)] text-people" : "border-border text-muted-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-bold">Your words</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rename things to match your industry, for example "Project" to "Case" or "Job".
        </p>
        <div className="mt-4 space-y-3">
          {(Object.keys(terms) as TermKey[]).map((k) => (
            <div key={k} className="grid grid-cols-[100px_1fr_1fr] items-center gap-3">
              <Label className="capitalize text-muted-foreground">{k}</Label>
              <Input
                aria-label={`${k} singular`}
                value={terms[k].one}
                disabled={!canManage}
                maxLength={40}
                onChange={(e) => setTerms({ ...terms, [k]: { ...terms[k], one: e.target.value } })}
              />
              <Input
                aria-label={`${k} plural`}
                value={terms[k].many}
                disabled={!canManage}
                maxLength={40}
                onChange={(e) => setTerms({ ...terms, [k]: { ...terms[k], many: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </Card>

      {canManage ? (
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You need the settings permission to change these.</p>
      )}
    </div>
  );
}

interface AuditEvent {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
  actorName: string | null;
  actorImage: string | null;
}

export function AuditPage({ me }: { me: Me }) {
  const allowed = can(me.org.permissions, "audit", "read");
  const [older, setOlder] = useState<AuditEvent[]>([]);
  const [area, setArea] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: () => api<{ events: AuditEvent[] }>("audit"),
    enabled: allowed,
  });
  const all = [...(data?.events ?? []), ...older];
  const events = area ? all.filter((e) => areaOf(e) === area) : all;
  const days = new Map<string, AuditEvent[]>();
  for (const e of events) {
    const key = new Date(e.createdAt).toDateString();
    days.set(key, [...(days.get(key) ?? []), e]);
  }

  const loadMore = async () => {
    const last = all.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const r = await api<{ events: AuditEvent[] }>(`audit?before=${encodeURIComponent(new Date(last.createdAt).toISOString())}`);
      setOlder((o) => [...o, ...r.events]);
      if (r.events.length < 50) setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
      <PageHeader title="Audit log" description="Who did what, and when. Only admins can see this." />
      {allowed ? (
        <div className="flex flex-wrap gap-1.5">
          {AUDIT_AREAS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setArea(a.key)}
              className={cn(
                "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors",
                area === a.key ? "border-border-strong bg-surface-3 text-foreground" : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <span className="size-2 rounded-full" style={{ background: a.color }} />
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {!allowed ? (
        <Card>
          <p className="p-6 text-sm text-muted-foreground">You don't have access to the audit log.</p>
        </Card>
      ) : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {data && events.length === 0 ? (
        <Card>
          <p className="p-6 text-sm text-muted-foreground">Nothing here yet. Changes across Hephaestus show up as they happen.</p>
        </Card>
      ) : null}
      {[...days].map(([day, list]) => (
        <section key={day} className="rise">
          <h2 className="eyebrow mb-2">{dayLabel(day)}</h2>
          <Card>
            <ol className="divide-y divide-border">
              {list.map((e) => {
                const color = AUDIT_AREAS.find((a) => a.key === areaOf(e))?.color ?? "var(--muted-foreground)";
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="relative">
                      <Avatar name={e.actorName ?? "Hephaestus"} src={e.actorImage} className="size-8 text-[10px]" />
                      <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface" style={{ background: color }} />
                    </span>
                    <p className="min-w-0 flex-1 text-muted-foreground">
                      <span className="font-medium text-foreground">{e.actorName ?? (e.actorId ? "Someone" : "Hephaestus")}</span> {sentence(e)}
                    </p>
                    <code className="hidden rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-subtle-foreground md:inline">{e.action}</code>
                    <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                      {new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
        </section>
      ))}
      {allowed && data && data.events.length >= 50 && !exhausted ? (
        <div className="flex justify-center">
          <Button variant="secondary" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? "Loading…" : "Load older"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const AUDIT_AREAS = [
  { key: "", label: "Everything", color: "var(--ember)" },
  { key: "people", label: "People", color: "var(--people)" },
  { key: "work", label: "Work", color: "var(--work)" },
  { key: "collab", label: "Collaboration", color: "var(--collab)" },
  { key: "finance", label: "Finance", color: "var(--finance)" },
  { key: "settings", label: "Settings", color: "var(--muted-foreground)" },
];

const AREA_BY_ENTITY: Record<string, string> = {
  employee: "people", department: "people", team: "people", leave: "people", holiday: "people", onboarding: "people", document: "people",
  project: "work", task: "work", milestone: "work", goal: "work", stage: "work",
  channel: "collab", message: "collab", decision: "collab", comment: "collab",
  invoice: "finance", quote: "finance", credit_note: "finance", payment: "finance", client: "finance", retainer: "finance", item: "finance", tax_rate: "finance",
};

function areaOf(e: AuditEvent) {
  const entity = e.action.split(".")[0] ?? "";
  return AREA_BY_ENTITY[entity] ?? AREA_BY_ENTITY[e.targetType ?? ""] ?? "settings";
}

const VERBS: Record<string, string> = {
  created: "created", updated: "updated", deleted: "deleted", archived: "archived", issued: "issued", recorded: "recorded",
  completed: "completed", approved: "approved", rejected: "declined", cancelled: "cancelled", voided: "voided", sent: "sent",
  started: "started", marked: "recorded", uploaded: "uploaded", offboarded: "offboarded", imported: "imported", accepted: "accepted", declined: "declined",
};

/** "invoice.issued" + metadata → "issued invoice INV/26-27/0004" */
function sentence(e: AuditEvent) {
  const [entity = "", verb = ""] = e.action.split(".");
  const m = e.metadata ?? {};
  const label = (m.number ?? m.name ?? m.title ?? m.milestone ?? m.fileName) as string | undefined;
  const thing = entity.replace(/_/g, " ");
  const v = VERBS[verb] ?? verb.replace(/_/g, " ");
  return (
    <>
      {v} {label ? <>{thing} <span className="text-foreground">{String(label)}</span></> : `${/^[aeiou]/.test(thing) ? "an" : "a"} ${thing}`}
    </>
  );
}

function dayLabel(day: string) {
  const d = new Date(day);
  const today = new Date();
  const yest = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

export function PreferencesPage() {
  const [pref, setPref] = useTheme();
  const options = [
    { key: "dark", label: "Dark", icon: Moon, preview: "bg-obsidian" },
    { key: "light", label: "Light", icon: Sun, preview: "bg-ash" },
    { key: "system", label: "Match system", icon: SunMoon, preview: "bg-[linear-gradient(135deg,var(--ash)_50%,var(--obsidian)_50%)]" },
  ] as const;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 sm:p-8">
      <PageHeader title="Preferences" description="These apply to this device only." />
      <Card className="p-6">
        <h2 className="text-lg font-bold">Theme</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setPref(o.key)}
              aria-pressed={pref === o.key}
              className={cn(
                "overflow-hidden rounded-lg border text-left transition-colors",
                pref === o.key ? "border-primary" : "border-border hover:border-input",
              )}
            >
              <div className={cn("h-20 border-b border-border", o.preview)} />
              <div className="flex items-center gap-2 px-3 py-2 text-sm">
                <o.icon className="size-4 text-muted-foreground" />
                {o.label}
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
