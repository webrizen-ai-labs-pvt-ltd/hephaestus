import { can, PILLARS, type Pillar, type TermKey } from "@hephaestus/core";
import { Badge, Button, Card, cn, Input, Label } from "@hephaestus/ui";
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

  const save = useMutation({
    mutationFn: () => api("settings", { method: "PATCH", body: JSON.stringify({ terms, enabledPillars: pillars }) }),
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
}

export function AuditPage({ me }: { me: Me }) {
  const allowed = can(me.org.permissions, "audit", "read");
  const { data, isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: () => api<{ events: AuditEvent[] }>("audit"),
    enabled: allowed,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
      <PageHeader title="Audit log" description="Who did what, and when." />
      <Card>
        {!allowed ? <p className="p-6 text-sm text-muted-foreground">You don't have access to the audit log.</p> : null}
        {isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : null}
        {data && data.events.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No events yet. Changes to settings and files will show up here.</p>
        ) : null}
        <ul className="divide-y divide-border">
          {data?.events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <code className="font-mono text-xs text-accent">{e.action}</code>
              <span className="text-muted-foreground">{e.targetType ? `${e.targetType}` : ""}</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {new Date(e.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
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
