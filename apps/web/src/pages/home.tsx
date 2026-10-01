import { Avatar, Badge, Card } from "@hephaestus/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CheckCircle2, Circle } from "lucide-react";
import { PageHeader } from "../components/app-shell.tsx";
import { api, type Me } from "../lib/api.ts";
import { MAIN_NAV } from "../lib/nav.ts";

export interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  roles: string[];
  lastSeenAt: string | null;
}

export function useMembers(q = "") {
  return useQuery({
    queryKey: ["members", q],
    queryFn: () => api<{ members: MemberRow[] }>(`members${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const PHASE: Record<string, string> = { people: "Live", work: "Live", collab: "Phase 3", finance: "Phase 4" };

export function HomePage({ me }: { me: Me }) {
  const { data } = useMembers();
  const members = data?.members ?? [];
  const firstName = me.user.name.split(" ")[0];
  const pillars = MAIN_NAV.filter((n) => n.pillar && me.settings.enabledPillars.includes(n.pillar));

  const steps = [
    { done: true, label: "Sign in with your Webrizen account" },
    { done: members.length > 1, label: "Invite your team from Webrizen SSO" },
    { done: false, label: "Set up departments and teams", to: "/people/structure" },
    { done: false, label: "Create your first project", to: "/work/projects" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 sm:p-8">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          <>
            Here's what's happening at <span className="font-medium text-foreground">{me.org.name}</span>.
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {pillars.map((p) => (
          <Link key={p.to} to={p.to} className="group">
            <Card className="relative h-full overflow-hidden p-5 transition-colors group-hover:border-input">
              <div className={`absolute inset-x-0 top-0 h-[3px] bg-current ${p.tone}`} />
              <div className="flex items-start justify-between">
                <div className={`flex size-10 items-center justify-center rounded-lg bg-surface-2 ${p.tone}`}>
                  <p.icon className="size-5" />
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{p.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.hint}</p>
              <Badge className="mt-4" tone={PHASE[p.pillar!] === "Live" ? "people" : "neutral"}>{PHASE[p.pillar!]}</Badge>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <h2 className="text-lg font-bold">Get set up</h2>
          <p className="mt-1 text-sm text-muted-foreground">A few steps to get your organization running on Hephaestus.</p>
          <ul className="mt-5 space-y-1">
            {steps.map((s) => (
              <li key={s.label}>
                {s.to ? (
                  <Link to={s.to} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
                    <Circle className="size-5 text-muted-foreground" />
                    {s.label}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2 text-sm">
                    {s.done ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5 text-muted-foreground" />}
                    <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Your team</h2>
            <span className="font-display text-3xl font-bold">{members.length}</span>
          </div>
          <ul className="mt-4 space-y-3">
            {members.slice(0, 6).map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <Avatar name={m.name} src={m.image} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
                <Badge tone="people">{m.roles[0] ?? "member"}</Badge>
              </li>
            ))}
          </ul>
          <Link to="/people" className="mt-4 inline-block text-sm text-accent hover:underline">
            View directory
          </Link>
        </Card>
      </div>
    </div>
  );
}
