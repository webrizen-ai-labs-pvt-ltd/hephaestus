import { addDays, isoWeekday } from "@hephaestus/core";
import { Card, Em, EmptyState, PageHero, Panel, ProgressRing, Skeleton, Sparkline } from "@hephaestus/ui";
import { Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Flag, FolderKanban, ListTodo, TrendingUp } from "lucide-react";
import { useHome } from "../../lib/home.ts";
import { type TaskCard, useMyWork } from "../../lib/work.ts";
import { useOpenTask, WorkBody } from "./layout.tsx";
import { QuickAdd, TaskRow } from "./task-bits.tsx";

function bucket(t: TaskCard, today: string) {
  if (t.status === "done") return "done";
  if (!t.dueDate) return "later";
  if (t.dueDate < today) return "overdue";
  if (t.dueDate === today) return "today";
  const sunday = addDays(today, 7 - isoWeekday(today));
  return t.dueDate <= sunday ? "week" : "upcoming";
}

const SECTIONS = [
  { key: "overdue", title: "Overdue", color: "var(--color-fg-error-primary)" },
  { key: "today", title: "Today", color: "var(--work)" },
  { key: "week", title: "Later this week", color: "var(--finance)" },
  { key: "upcoming", title: "Upcoming", color: "var(--collab)" },
  { key: "later", title: "No due date", color: "var(--color-text-quaternary)" },
  { key: "done", title: "Recently done", color: "var(--color-fg-success-primary)" },
] as const;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function MyWorkPage() {
  const { data, isLoading } = useMyWork();
  const { data: home } = useHome();
  const openTask = useOpenTask();
  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const tasks = data?.tasks ?? [];
  const open = tasks.filter((t) => t.status !== "done");
  const counts = Object.fromEntries(SECTIONS.map((s) => [s.key, tasks.filter((t) => bucket(t, today) === s.key).length])) as Record<(typeof SECTIONS)[number]["key"], number>;
  const doneWeek = home?.day.doneThisWeek ?? 0;
  const dueThisWeek = counts.overdue + counts.today + counts.week;

  // Open tasks grouped by project, for the sidebar.
  const byProject = new Map<string, { name: string; color: string; id: string | null; n: number }>();
  for (const t of open) {
    const key = t.projectId ?? "personal";
    const cur = byProject.get(key) ?? { name: t.projectName ?? "Personal", color: t.projectColor ?? "var(--color-text-quaternary)", id: t.projectId ?? null, n: 0 };
    cur.n++;
    byProject.set(key, cur);
  }
  const projects = [...byProject.values()].sort((a, b) => b.n - a.n);
  const maxN = Math.max(1, ...projects.map((p) => p.n));

  return (
    <WorkBody>
      <PageHero
        tone="var(--work)"
        title="What's on your plate"
        summary={
          data?.linked === false ? (
            "Your account isn't linked to an employee profile yet."
          ) : (
            <>
              <Em tone="var(--work)">{plural(open.length, "open task")}</Em> assigned to you.
              {counts.overdue ? (
                <>
                  {" "}
                  <Em tone="var(--color-fg-error-primary)">{counts.overdue} overdue</Em>, start there.
                </>
              ) : counts.today ? (
                <>
                  {" "}
                  <Em>{counts.today}</Em> due today.
                </>
              ) : (
                " Nothing urgent today."
              )}
            </>
          )
        }
      />

      <div className="rise rise-1 grid items-start gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <QuickAdd placeholder="Add a personal task and press Enter" extra={{}} onCreated={(id) => openTask(id)} />

          {isLoading ? <Skeleton className="h-64 w-full" /> : null}
          {!isLoading && tasks.length === 0 ? (
            <Card>
              <EmptyState icon={<ListTodo />} title="Nothing on your plate" description="Tasks assigned to you across every project show up here." />
            </Card>
          ) : null}

          {SECTIONS.map((s) => {
            const list = tasks.filter((t) => bucket(t, today) === s.key);
            if (!list.length) return null;
            return (
              <section key={s.key}>
                <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold">
                  {s.key === "done" ? <CheckCircle2 className="size-4" style={{ color: s.color }} /> : <span className="size-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 0 3px color-mix(in srgb, ${s.color} 20%, transparent)` }} />}
                  <span style={s.key === "overdue" ? { color: s.color } : undefined}>{s.title}</span>
                  <span className="rounded-full bg-secondary px-1.5 font-mono text-[10px] font-normal leading-4 text-tertiary">{list.length}</span>
                </h2>
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-border-secondary">
                    {list.map((t) => (
                      <TaskRow key={t.id} task={t} today={today} onOpen={openTask} />
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:col-span-4">
          <Panel title="This week" icon={<TrendingUp />} tone="var(--work)">
            <div className="flex items-center gap-4">
              <ProgressRing value={(doneWeek / Math.max(1, doneWeek + dueThisWeek)) * 100} size={72} stroke={6} color="var(--color-fg-success-primary)">
                <span className="text-base">{doneWeek}</span>
              </ProgressRing>
              <div className="text-sm">
                <div>
                  <Em>{plural(doneWeek, "task")}</Em> done
                </div>
                <div className="text-tertiary">{dueThisWeek ? `${dueThisWeek} still due this week` : "Nothing else due this week"}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(["overdue", "today", "week"] as const).map((k) => {
                const s = SECTIONS.find((x) => x.key === k)!;
                return (
                  <div key={k} className="rounded-lg border border-secondary bg-secondary/60 px-2.5 py-2">
                    <div className="font-display text-xl font-bold leading-none tabular" style={{ color: counts[k] ? s.color : "var(--color-text-quaternary)" }}>
                      {counts[k]}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-tertiary">{s.title}</div>
                  </div>
                );
              })}
            </div>
            {home ? (
              <div className="mt-4">
                <Sparkline values={home.work.velocity.map((v) => v.done)} color="var(--work)" height={32} bars />
                <div className="mt-1 text-[11px] text-quaternary">Team tasks finished, last 14 days</div>
              </div>
            ) : null}
          </Panel>

          {projects.length ? (
            <Panel title="Where your work is" icon={<FolderKanban />} tone="var(--work)">
              <ul className="space-y-2.5">
                {projects.map((p) => {
                  const row = (
                    <>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="font-mono text-xs text-tertiary">{p.n}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full" style={{ width: `${(p.n / maxN) * 100}%`, background: p.color }} />
                      </div>
                    </>
                  );
                  return (
                    <li key={p.id ?? "personal"}>
                      {p.id ? (
                        <Link to="/work/projects/$id" params={{ id: p.id }} className="block rounded-md hover:opacity-80">
                          {row}
                        </Link>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}

          {home?.upcoming.some((u) => u.kind === "milestone") ? (
            <Panel title="Milestones ahead" icon={<Flag />} tone="var(--work)" meta="14 days">
              <ul className="space-y-2.5">
                {home.upcoming
                  .filter((u) => u.kind === "milestone")
                  .map((u, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <CalendarDays className="size-3.5 shrink-0 text-tertiary" />
                      <span className="min-w-0 flex-1 truncate">
                        {u.title} {u.detail ? <span className="text-tertiary">· {u.detail}</span> : null}
                      </span>
                      <span className="font-mono text-[11px] text-tertiary">
                        {new Date(`${u.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </li>
                  ))}
              </ul>
            </Panel>
          ) : null}
        </aside>
      </div>
    </WorkBody>
  );
}
