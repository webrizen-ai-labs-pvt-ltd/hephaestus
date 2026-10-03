import { formatMoney } from "@hephaestus/core";
import { Avatar, cn, Em, EmptyState, KpiTile, Meter, PageHero, Panel, ProgressRing, Skeleton, Sparkline } from "@hephaestus/ui";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  AtSign,
  Banknote,
  CalendarDays,
  CircleCheck,
  CircleCheckBig,
  FileText,
  Flag,
  FolderKanban,
  MessagesSquare,
  Palmtree,
  PartyPopper,
  Rocket,
  Sparkles,
  Users,
} from "lucide-react";
import { api, type Me } from "../lib/api.ts";
import { compactMoney } from "../lib/finance.ts";
import { type HomeData, useHome } from "../lib/home.ts";
import { useApiMutation } from "../lib/people.ts";
import { WORK_KEYS } from "../lib/work.ts";
import { DueChip, PriorityIcon } from "./work/task-bits.tsx";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ago(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/* ---------------- Your day ---------------- */

function YourDay({ data }: { data: HomeData }) {
  const navigate = useNavigate();
  const { buckets, tasks } = data.day;
  const complete = useApiMutation((id: string) => api(`tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }), {
    invalidate: WORK_KEYS,
    success: "Nice. Marked as done.",
  });
  const chips = [
    { label: "Overdue", n: buckets.overdue, color: "var(--color-fg-error-primary)" },
    { label: "Today", n: buckets.today, color: "var(--work)" },
    { label: "This week", n: buckets.week, color: "var(--finance)" },
    { label: "Later", n: buckets.later + buckets.noDate, color: "var(--color-text-tertiary)" },
  ];
  const finished = data.day.doneThisWeek;
  const remaining = buckets.overdue + buckets.today + buckets.week;

  return (
    <Panel
      title="Your day"
      icon={<CircleCheckBig />}
      tone="var(--work)"
      meta={data.day.openTotal ? `${data.day.openTotal} open` : undefined}
      action={
        <Link to="/work" className="inline-flex items-center gap-1 text-brand-secondary hover:underline">
          My work <ArrowRight className="size-3.5" />
        </Link>
      }
      className="lg:col-span-7"
    >
      <div className="grid grid-cols-4 gap-2">
        {chips.map((c) => (
          <div key={c.label} className="rounded-xl border border-secondary bg-secondary/60 px-3 py-2.5">
            <div className="font-display text-2xl font-bold leading-none tabular" style={{ color: c.n ? c.color : "var(--color-text-quaternary)" }}>
              {c.n}
            </div>
            <div className="mt-1 text-[11.5px] text-tertiary">{c.label}</div>
          </div>
        ))}
      </div>

      {!data.me ? (
        <p className="mt-5 text-sm text-tertiary">Your account isn't linked to an employee profile yet, so no tasks can be assigned to you.</p>
      ) : tasks.length === 0 ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-secondary px-4 py-5 text-sm text-tertiary">
          <PartyPopper className="size-5 text-work" /> Nothing on your plate. Enjoy it, or pick something up from a project.
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border-secondary">
          {tasks.map((t) => (
            <li key={t.id} className="group flex items-center gap-3 py-2.5">
              <button
                type="button"
                aria-label={`Complete "${t.title}"`}
                onClick={() => complete.mutate(t.id)}
                className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-primary transition-colors hover:border-success-500 hover:bg-success-solid/15"
              >
                <CircleCheck className="size-3 text-success-primary opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: t.projectId ? `/work/projects/${t.projectId}` : "/work", search: { task: t.id } } as never)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <PriorityIcon priority={t.priority} />
                <span className="truncate text-sm">{t.title}</span>
              </button>
              {t.projectName ? (
                <span className="hidden max-w-36 shrink-0 items-center gap-1.5 truncate rounded-md bg-secondary px-2 py-0.5 text-[11.5px] text-tertiary sm:inline-flex">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: t.projectColor ?? undefined }} />
                  <span className="truncate font-mono">{t.projectKey && t.number ? `${t.projectKey}-${t.number}` : t.projectName}</span>
                </span>
              ) : t.source === "onboarding" ? (
                <span className="hidden rounded-md bg-people/15 px-2 py-0.5 text-[11.5px] text-people sm:inline">Onboarding</span>
              ) : null}
              <span className="w-16 shrink-0 text-right">
                <DueChip date={t.dueDate} done={false} today={data.today} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center gap-3 rounded-xl bg-secondary/60 px-3.5 py-2.5 text-[13px]">
        <ProgressRing value={(finished / Math.max(1, finished + remaining)) * 100} size={34} stroke={3.5} color="var(--color-fg-success-primary)">
          <span className="text-[10px]">{finished}</span>
        </ProgressRing>
        <span className="text-tertiary">
          <Em>{plural(finished, "task")}</Em> finished this week
          {remaining ? <>, {remaining} still to do</> : null}.
        </span>
      </div>
    </Panel>
  );
}

/* ---------------- Needs attention ---------------- */

const ATTENTION_META: Record<string, { icon: typeof Users; color: string }> = {
  leave: { icon: Palmtree, color: "var(--people)" },
  overdue_invoices: { icon: Banknote, color: "var(--color-fg-error-primary)" },
  draft_invoices: { icon: FileText, color: "var(--finance)" },
  onboarding: { icon: Rocket, color: "var(--people)" },
  mentions: { icon: AtSign, color: "var(--collab)" },
};

function Attention({ data }: { data: HomeData }) {
  const router = useRouter();
  return (
    <Panel title="Needs your attention" icon={<Sparkles />} tone="var(--color-brand-600)" meta={data.attention.length ? String(data.counts.attention) : undefined} className="lg:col-span-5">
      {data.attention.length === 0 ? (
        <EmptyState icon={<CircleCheckBig />} title="You're all caught up" description="Approvals, overdue invoices and mentions land here the moment they need you." />
      ) : (
        <ul className="space-y-2">
          {data.attention.map((a) => {
            const meta = ATTENTION_META[a.kind] ?? { icon: Sparkles, color: "var(--color-brand-600)" };
            return (
              <li key={a.kind}>
                <button
                  type="button"
                  onClick={() => router.history.push(a.link)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-secondary bg-secondary/50 px-3.5 py-3 text-left transition-colors hover:border-primary hover:bg-secondary"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[18px]" style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}>
                    <meta.icon />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.title}</span>
                    {a.detail || a.amount ? (
                      <span className="block truncate text-xs text-tertiary">
                        {a.amount ? <span className="font-mono text-error-primary">{formatMoney(a.amount)}</span> : null}
                        {a.amount && a.detail ? " · " : null}
                        {a.detail}
                      </span>
                    ) : null}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-tertiary transition-transform group-hover:translate-x-0.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ---------------- Pillar pulse ---------------- */

function Pulse({ data, me }: { data: HomeData; me: Me }) {
  const navigate = useNavigate();
  const enabled = new Set(me.settings.enabledPillars);
  const f = data.finance;
  const collectedDelta = f && f.collectedLastMonth ? Math.round(((f.collectedThisMonth - f.collectedLastMonth) / f.collectedLastMonth) * 100) + 0 : null;
  const velocity = data.work.velocity.map((v) => v.done);
  const doneLast7 = velocity.slice(7).reduce((a, b) => a + b, 0);
  const donePrev7 = velocity.slice(0, 7).reduce((a, b) => a + b, 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {enabled.has("people") ? (
        <KpiTile
          label="People"
          icon={<Users />}
          tone="var(--people)"
          value={data.people.headcount}
          hint={data.people.joinersThisMonth ? `${plural(data.people.joinersThisMonth, "new joiner")} this month` : "On the team"}
          onClick={() => navigate({ to: "/people" })}
          footer={
            data.people.away.length ? (
              <div className="flex items-center gap-2">
                <span className="flex -space-x-1.5">
                  {data.people.away.slice(0, 4).map((p) => (
                    <Avatar key={p.id} name={p.name} src={p.image} className="size-6 border-2 border-bg-primary text-[9px]" />
                  ))}
                </span>
                <span className="truncate text-xs text-tertiary">
                  {data.people.away.length === 1 ? `${data.people.away[0]!.name.split(" ")[0]} is away today` : `${data.people.away.length} away today`}
                </span>
              </div>
            ) : (
              <span className="text-xs text-tertiary">Everyone's in today</span>
            )
          }
        />
      ) : null}
      {enabled.has("work") ? (
        <KpiTile
          label="Open tasks"
          icon={<FolderKanban />}
          tone="var(--work)"
          value={data.work.open}
          hint={data.work.overdue ? <span className="text-error-primary">{data.work.overdue} overdue</span> : `${data.work.inProgress} in progress`}
          trend={doneLast7 || donePrev7 ? { label: `${doneLast7} done · 7d`, good: doneLast7 >= donePrev7 ? true : null } : undefined}
          onClick={() => navigate({ to: "/work/projects" })}
          footer={
            <div>
              <Sparkline values={velocity} color="var(--work)" height={30} bars />
              <div className="mt-1 text-[11px] text-quaternary">Tasks finished, last 14 days</div>
            </div>
          }
        />
      ) : null}
      {enabled.has("collab") ? (
        <KpiTile
          label="Unread messages"
          icon={<MessagesSquare />}
          tone="var(--collab)"
          value={data.counts.chat}
          hint={data.counts.notifications ? `${plural(data.counts.notifications, "notification")} waiting` : "No notifications waiting"}
          onClick={() => navigate({ to: "/collab" })}
          footer={
            <span className="inline-flex items-center gap-1 text-xs text-brand-secondary">
              Open conversations <ArrowRight className="size-3" />
            </span>
          }
        />
      ) : null}
      {enabled.has("finance") && f ? (
        <KpiTile
          label="Outstanding"
          icon={<Banknote />}
          tone="var(--finance)"
          value={compactMoney(f.outstanding, f.currency)}
          hint={f.overdue ? <span className="text-error-primary">{compactMoney(f.overdue, f.currency)} overdue</span> : "Nothing overdue"}
          trend={collectedDelta !== null ? { label: `${collectedDelta >= 0 ? "+" : ""}${collectedDelta}% vs ${new Date(new Date().getFullYear(), new Date().getMonth() - 1).toLocaleDateString("en-IN", { month: "short" })}`, good: collectedDelta >= 0 } : undefined}
          onClick={() => navigate({ to: "/finance" })}
          footer={
            <div>
              <Sparkline values={f.monthly.map((m) => m.amount)} color="var(--chart-collected)" height={30} />
              <div className="mt-1 flex justify-between text-[11px] text-quaternary">
                <span>Collected, 6 months</span>
                <span className="font-mono">{compactMoney(f.collectedThisMonth, f.currency)} this month</span>
              </div>
            </div>
          }
        />
      ) : null}
    </div>
  );
}

/* ---------------- Projects, coming up, activity ---------------- */

function Projects({ data }: { data: HomeData }) {
  return (
    <Panel
      title="Projects in flight"
      icon={<FolderKanban />}
      tone="var(--work)"
      action={
        <Link to="/work/projects" className="inline-flex items-center gap-1 text-brand-secondary hover:underline">
          All projects <ArrowRight className="size-3.5" />
        </Link>
      }
      className="lg:col-span-7"
    >
      {data.work.projects.length === 0 ? (
        <EmptyState icon={<FolderKanban />} title="No active projects" description="Create a project to plan work on a board, with milestones and owners." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.work.projects.map((p) => {
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            return (
              <li key={p.id}>
                <Link to="/work/projects/$id" params={{ id: p.id }} className="flex items-center gap-3.5 rounded-xl border border-secondary bg-secondary/50 p-3.5 transition-colors hover:border-primary hover:bg-secondary">
                  <ProgressRing value={pct} size={48} color={p.color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded px-1.5 font-mono text-[10px] font-semibold text-white" style={{ background: p.color }}>
                        {p.key}
                      </span>
                      <span className="truncate text-sm font-medium">{p.name}</span>
                    </div>
                    <div className="mt-1 text-xs text-tertiary">
                      {p.done}/{p.total} done
                      {p.overdue ? <span className="text-error-primary"> · {p.overdue} overdue</span> : null}
                      {p.dueDate ? ` · due ${new Date(`${p.dueDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const UPCOMING_META = {
  holiday: { icon: PartyPopper, color: "var(--finance)" },
  milestone: { icon: Flag, color: "var(--work)" },
  leave: { icon: Palmtree, color: "var(--people)" },
  task: { icon: CircleCheckBig, color: "var(--collab)" },
} as const;

function ComingUp({ data }: { data: HomeData }) {
  const router = useRouter();
  const groups = new Map<string, HomeData["upcoming"]>();
  for (const u of data.upcoming) groups.set(u.date, [...(groups.get(u.date) ?? []), u]);
  return (
    <Panel title="Coming up" icon={<CalendarDays />} tone="var(--collab)" meta="next 14 days" className="lg:col-span-5">
      {groups.size === 0 ? (
        <EmptyState icon={<CalendarDays />} title="A quiet fortnight" description="Holidays, milestones, leave and your due dates appear here." />
      ) : (
        <ol className="space-y-3">
          {[...groups.entries()].map(([date, items]) => {
            const d = new Date(`${date}T00:00:00`);
            const isToday = date === data.today;
            return (
              <li key={date} className="flex gap-3">
                <div className={cn("flex w-11 shrink-0 flex-col items-center rounded-lg border py-1", isToday ? "border-brand/50 bg-brand-solid/10" : "border-secondary bg-secondary/60")}>
                  <span className="text-[10px] uppercase text-tertiary">{d.toLocaleDateString("en-IN", { weekday: "short" })}</span>
                  <span className="font-display text-lg font-bold leading-tight">{d.getDate()}</span>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                  {items.map((u, i) => {
                    const meta = UPCOMING_META[u.kind];
                    return (
                      <li key={i}>
                        <button type="button" disabled={!u.link} onClick={() => u.link && router.history.push(u.link)} className="flex w-full items-start gap-2 text-left disabled:cursor-default">
                          <meta.icon className="mt-0.5 size-3.5 shrink-0" style={{ color: u.color ?? meta.color }} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px]">{u.title}</span>
                            {u.detail ? <span className="block truncate text-[11.5px] text-tertiary">{u.detail}</span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

function describe(a: HomeData["activity"][number]) {
  const m = a.metadata;
  switch (a.action) {
    case "employee.created":
      return (
        <>
          added <Em>{String(m.name ?? "someone")}</Em> to the directory
        </>
      );
    case "project.created":
      return (
        <>
          started the project <Em>{String(m.name ?? "")}</Em>
        </>
      );
    case "milestone.completed":
      return (
        <>
          completed the milestone <Em>{String(m.milestone ?? "")}</Em>
        </>
      );
    case "onboarding.started":
      return <>started an onboarding checklist</>;
    case "leave.approved":
      return <>approved a leave request</>;
    case "channel.created":
      return (
        <>
          created the channel <Em>#{String(m.name ?? "")}</Em>
        </>
      );
    case "decision.marked":
      return <>recorded a decision</>;
    case "invoice.issued":
      return (
        <>
          issued <Em>{String(m.number ?? "an invoice")}</Em>
        </>
      );
    case "payment.recorded":
      return (
        <>
          recorded a payment of <Em>{typeof m.amount === "number" ? formatMoney(m.amount) : "an amount"}</Em>
        </>
      );
    case "client.created":
      return (
        <>
          added the client <Em>{String(m.name ?? "")}</Em>
        </>
      );
    default:
      return <>made a change</>;
  }
}

function Activity({ data, wide }: { data: HomeData; wide: boolean }) {
  return (
    <Panel title="What's been happening" icon={<Sparkles />} tone="var(--finance)" className={wide ? "lg:col-span-12" : "lg:col-span-7"}>
      {data.activity.length === 0 ? (
        <p className="text-sm text-tertiary">Activity from across the company shows up here.</p>
      ) : (
        <ol className={cn("relative grid gap-x-8 gap-y-3.5", wide && "md:grid-cols-2")}>
          {data.activity.map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <Avatar name={a.actorName ?? "Hephaestus"} src={a.actorImage} className="size-7 text-[10px]" />
              <p className="min-w-0 flex-1 pt-1 text-[13px] text-tertiary">
                <span className="font-medium text-primary">{a.actorName ?? "Hephaestus"}</span> {describe(a)}
              </p>
              <span className="shrink-0 pt-1 font-mono text-[11px] text-quaternary">{ago(a.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function setupSteps(data: HomeData) {
  return [
    { done: true, label: "Sign in with Webrizen", to: "/" },
    { done: data.people.headcount > 1, label: "Add your team to the directory", to: "/people/directory" },
    { done: data.work.projects.length > 0, label: "Start your first project", to: "/work/projects" },
    ...(data.finance ? [{ done: data.finance.monthly.some((m) => m.amount > 0) || data.finance.outstanding > 0, label: "Send your first invoice", to: "/finance" }] : []),
  ];
}

function GettingStarted({ data, me }: { data: HomeData; me: Me }) {
  const steps = setupSteps(data);
  const done = steps.filter((s) => s.done).length;
  return (
    <Panel title="Get set up" icon={<Rocket />} tone="var(--color-brand-600)" meta={`${done}/${steps.length}`} className="lg:col-span-5">
      <Meter value={done} max={steps.length} color="var(--color-brand-600)" label="Setup progress" />
      <ul className="mt-4 space-y-1">
        {steps.map((s) => (
          <li key={s.label}>
            <Link to={s.to} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-secondary">
              {s.done ? <CircleCheck className="size-[18px] text-success-primary" /> : <span className="size-[18px] rounded-full border-2 border-primary" />}
              <span className={s.done ? "text-tertiary line-through" : ""}>{s.label}</span>
              {!s.done ? <ArrowRight className="ml-auto size-3.5 text-tertiary" /> : null}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-tertiary">Welcome to {me.org.name}'s workspace.</p>
    </Panel>
  );
}

export function HomePage({ me }: { me: Me }) {
  const { data, isLoading } = useHome();
  const firstName = me.user.name.split(" ")[0];
  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  if (isLoading || !data) {
    return (
      <div className="mx-auto space-y-6 px-4 py-8 sm:px-8">
        <Skeleton className="h-20 w-2/3" />
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-80 lg:col-span-7" />
          <Skeleton className="h-80 lg:col-span-5" />
        </div>
      </div>
    );
  }

  const b = data.day.buckets;
  const dueNow = b.today + b.overdue;
  const summary = (
    <>
      {dueNow ? (
        <>
          You have <Em tone="var(--work)">{plural(dueNow, "task")}</Em> {b.overdue ? "due or overdue" : "due today"}
        </>
      ) : (
        <>Nothing is due today</>
      )}
      {data.counts.attention ? (
        <>
          , and <Em tone="var(--color-brand-600)">{plural(data.counts.attention, "thing")}</Em> waiting for you
        </>
      ) : null}
      {data.finance && data.finance.overdue ? (
        <>
          . <Em tone="var(--color-fg-error-primary)">{compactMoney(data.finance.overdue, data.finance.currency)}</Em> in invoices is overdue
        </>
      ) : null}
      .
    </>
  );
  const showSetup = setupSteps(data).some((s) => !s.done);

  return (
    <div className="mx-auto space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHero eyebrow={date} title={`${greeting()}, ${firstName}`} summary={summary} />

      <div className="rise rise-1 grid gap-4 lg:grid-cols-12">
        <YourDay data={data} />
        <Attention data={data} />
      </div>

      <div className="rise rise-2">
        <Pulse data={data} me={me} />
      </div>

      <div className="rise rise-3 grid gap-4 lg:grid-cols-12">
        <Projects data={data} />
        <ComingUp data={data} />
      </div>

      <div className="rise rise-4 grid gap-4 lg:grid-cols-12">
        <Activity data={data} wide={!showSetup} />
        {showSetup ? <GettingStarted data={data} me={me} /> : null}
      </div>
    </div>
  );
}
