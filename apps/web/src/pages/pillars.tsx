import { Avatar, Badge, Card, Input } from "@hephaestus/ui";
import { type LucideIcon, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { PageHeader } from "../components/app-shell.tsx";
import type { Me } from "../lib/api.ts";
import { MAIN_NAV } from "../lib/nav.ts";
import { useMembers } from "./home.tsx";

const ROADMAP: Record<string, { phase: string; items: string[] }> = {
  "/people": {
    phase: "Phase 1",
    items: ["Employee profiles", "Departments and org chart", "Teams", "Onboarding checklists", "Leave and holidays"],
  },
  "/work": {
    phase: "Phase 2",
    items: ["Goals and projects", "Custom stages", "Kanban, list and calendar", "Milestones", "Workload view"],
  },
  "/collab": {
    phase: "Phase 3",
    items: ["Threads on any record", "Mentions and reactions", "Decisions", "Channels and DMs", "Live updates"],
  },
  "/finance": {
    phase: "Phase 4",
    items: ["Clients and quotes", "GST invoices", "Milestone billing", "Retainers", "Razorpay payments"],
  },
};

function Roadmap({ path, tone, icon: Icon }: { path: string; tone: string; icon: LucideIcon }) {
  const r = ROADMAP[path]!;
  return (
    <Card className="relative overflow-hidden p-6">
      <div className={`absolute inset-x-0 top-0 h-[3px] bg-current ${tone}`} />
      <div className="flex items-center gap-3">
        <Icon className={`size-5 ${tone}`} />
        <h2 className="text-lg font-bold">Coming next</h2>
        <Badge className="ml-auto">{r.phase}</Badge>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {r.items.map((i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={`size-1.5 rounded-full bg-current ${tone}`} />
            {i}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function PillarPage({ me, path }: { me: Me; path: "/people" | "/work" | "/collab" | "/finance" }) {
  const nav = MAIN_NAV.find((n) => n.to === path)!;
  const terms = me.settings.terms;
  const description =
    path === "/work"
      ? `${terms.project.many}, ${terms.task.many.toLowerCase()} and milestones`
      : path === "/finance"
        ? `${terms.client.many}, invoices and payments`
        : nav.hint;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
      <PageHeader title={nav.label} description={description} />
      {path === "/people" ? <Directory /> : null}
      <Roadmap path={path} tone={nav.tone!} icon={nav.icon} />
    </div>
  );
}

function Directory() {
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const { data, isLoading } = useMembers(deferred);
  const members = data?.members ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <h2 className="text-lg font-bold">Directory</h2>
        <Badge tone="people">{members.length}</Badge>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="pl-9" />
        </div>
      </div>
      <ul className="divide-y divide-border">
        {isLoading ? <li className="p-4 text-sm text-muted-foreground">Loading…</li> : null}
        {!isLoading && members.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No one matches "{deferred}".</li>
        ) : null}
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={m.name} src={m.image} className="size-9" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{m.name}</div>
              <div className="truncate text-xs text-muted-foreground">{m.email}</div>
            </div>
            <div className="hidden gap-1 sm:flex">
              {m.roles.map((r) => (
                <Badge key={r} tone="people">
                  {r}
                </Badge>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
