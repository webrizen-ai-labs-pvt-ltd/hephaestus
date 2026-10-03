import { can, formatMoney } from "@hephaestus/core";
import { Avatar, Badge, Button, CheckboxBase, cn, Em, FeaturedIcon, Segmented, Skeleton } from "@hephaestus/ui";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  AtSign,
  Banknote,
  CalendarDays,
  ChevronRight,
  FileText,
  Flag,
  ListPlus,
  Palmtree,
  PartyPopper,
  Plus,
  Rocket,
  Sparkles,
  CircleCheckBig,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { api, type Me } from "../lib/api.ts";
import { compactMoney, money, useFinanceSummary } from "../lib/finance.ts";
import { type HomeData, useHome } from "../lib/home.ts";
import { useApiMutation } from "../lib/people.ts";
import { WORK_KEYS } from "../lib/work.ts";
import { DueChip, PriorityIcon } from "./work/task-bits.tsx";

/* ---------------- helpers ---------------- */

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ago(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const pct = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) + 0 : null);

/** Untitled UI card: white surface, hairline ring, header with title, supporting text and actions. */
function Card({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset", className)}>
      <header className="flex flex-wrap items-start gap-4 border-b border-secondary px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-normal text-primary">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-tertiary">{description}</p> : null}
        </div>
        {action}
      </header>
      <div className={cn("flex-1 px-5 py-4 sm:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}

function ViewAll({ to, children = "View all" }: { to: string; children?: ReactNode }) {
  return (
    <Button size="sm" variant="secondary" asChild>
      <Link to={to}>{children}</Link>
    </Button>
  );
}

/* ---------------- metric cards ---------------- */

function Trend({ value, suffix = "vs last month", goodWhenUp = true }: { value: number | null; suffix?: string; goodWhenUp?: boolean }) {
  if (value === null) return <span className="text-sm font-medium whitespace-nowrap text-tertiary">New this period</span>;
  const up = value >= 0;
  const good = up === goodWhenUp || value === 0;
  return (
    <span className="flex items-center gap-2 text-sm">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full py-0.5 pr-2 pl-1.5 text-xs font-medium ring-1 ring-inset",
          value === 0
            ? "bg-utility-neutral-50 text-utility-neutral-700 ring-utility-neutral-200"
            : good
              ? "bg-utility-green-50 text-utility-green-700 ring-utility-green-200"
              : "bg-utility-red-50 text-utility-red-700 ring-utility-red-200",
        )}
      >
        {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
        {Math.abs(value)}%
      </span>
      <span className="truncate font-medium text-tertiary">{suffix}</span>
    </span>
  );
}

/** A small trend line for a metric card: one series, no axes, the latest point marked. */
function MiniChart({ values, color }: { values: number[]; color: string }) {
  const w = 120;
  const h = 56;
  if (values.length < 2) return <div className="h-12 w-24" />;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 4 - (v / max) * (h - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = `mini-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-24 shrink-0 overflow-visible" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Metric({
  label,
  value,
  trend,
  chart,
  footer,
  to,
}: {
  label: string;
  value: ReactNode;
  trend: ReactNode;
  chart?: ReactNode;
  footer?: string;
  to: string;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset">
      <div className="flex flex-1 flex-col gap-4 px-5 pt-5 pb-5">
        <h3 className="text-md font-semibold tracking-normal text-primary">{label}</h3>
        <div className="flex items-center justify-between gap-4">
          <p className="min-w-0 truncate text-display-sm font-semibold tracking-tight text-primary tabular-nums">{value}</p>
          {chart}
        </div>
        <div className="-mt-1 min-w-0">{trend}</div>
      </div>
      <div className="flex justify-end border-t border-secondary px-5 py-3">
        <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-secondary hover:text-brand-secondary_hover">
          {footer ?? "View details"}
        </Link>
      </div>
    </section>
  );
}

function Metrics({ data, me }: { data: HomeData; me: Me }) {
  const enabled = new Set(me.settings.enabledPillars);
  const v = data.work.velocity.map((x) => x.done);
  const doneThisWeek = v.slice(7).reduce((a, b) => a + b, 0);
  const donePrevWeek = v.slice(0, 7).reduce((a, b) => a + b, 0);
  const f = data.finance;
  const cards: ReactNode[] = [];

  if (enabled.has("work")) {
    cards.push(
      <Metric
        key="tasks"
        label="Tasks completed"
        value={doneThisWeek}
        trend={<Trend value={pct(doneThisWeek, donePrevWeek)} suffix="vs last week" />}
        chart={<MiniChart values={v} color="var(--color-brand-600)" />}
        footer="Open My work"
        to="/work"
      />,
      <Metric
        key="open"
        label="Open tasks"
        value={data.work.open}
        trend={
          <span className="text-sm font-medium text-tertiary">
            {data.work.overdue ? <span className="text-error-primary">{data.work.overdue} overdue</span> : "Nothing overdue"} · {data.work.inProgress} in progress
          </span>
        }
        footer="View projects"
        to="/work/projects"
      />,
    );
  }
  if (enabled.has("finance") && f) {
    cards.push(
      <Metric
        key="collected"
        label="Collected this month"
        value={compactMoney(f.collectedThisMonth, f.currency)}
        trend={<Trend value={pct(f.collectedThisMonth, f.collectedLastMonth)} />}
        chart={<MiniChart values={f.monthly.map((m) => m.amount)} color="var(--chart-collected)" />}
        footer="View payments"
        to="/finance/payments"
      />,
      <Metric
        key="outstanding"
        label="Outstanding"
        value={compactMoney(f.outstanding, f.currency)}
        trend={
          <span className="text-sm font-medium text-tertiary">
            {f.overdue ? <span className="text-error-primary">{compactMoney(f.overdue, f.currency)} overdue</span> : "Nothing overdue"}
          </span>
        }
        footer="View invoices"
        to="/finance/invoices"
      />,
    );
  }
  if (enabled.has("people") && cards.length < 4) {
    cards.push(
      <Metric
        key="people"
        label="Team"
        value={data.people.headcount}
        trend={
          <span className="flex items-center gap-2 text-sm font-medium text-tertiary">
            {data.people.away.length ? (
              <>
                <span className="flex -space-x-1.5">
                  {data.people.away.slice(0, 3).map((p) => (
                    <Avatar key={p.id} name={p.name} src={p.image} className="size-6 ring-2 ring-bg-primary text-[9px]" />
                  ))}
                </span>
                {data.people.away.length} away today
              </>
            ) : (
              "Everyone's in today"
            )}
          </span>
        }
        footer="Open directory"
        to="/people/directory"
      />,
    );
  }
  return <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{cards.slice(0, 4)}</div>;
}

/* ---------------- main chart ---------------- */

type Series = { key: string; label: string; color: string; values: number[]; format: (v: number) => string };

function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((n) => n * pow).find((s) => s >= raw)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** Area/line chart with one y-axis, a legend, and a crosshair tooltip on hover. */
function TrendChart({ labels, series, axis }: { labels: string[]; series: Series[]; axis: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const H = 260;
  const pad = { l: 52, r: 12, t: 12, b: 30 };
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, labels.length - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const empty = max === 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-sm text-tertiary">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={series.map((s) => `${s.label}: ${s.values.map((v, i) => `${labels[i]} ${s.format(v)}`).join(", ")}`).join(". ")}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`area-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-border-secondary)" strokeWidth={1} />
              <text x={pad.l - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--color-text-tertiary)] text-[12px]">
                {axis(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => (
            <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-[var(--color-text-tertiary)] text-[12px]">
              {l}
            </text>
          ))}
          {series.map((s) => (
            <g key={s.key}>
              <path d={`${path(s.values)} L${x(s.values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#area-${s.key})`} />
              <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
          {hover !== null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--color-border-primary)" strokeDasharray="3 3" />
              {series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color} stroke="var(--color-bg-primary)" strokeWidth={2} />
              ))}
            </g>
          ) : null}
          {labels.map((l, i) => {
            const w = (W - pad.l - pad.r) / Math.max(1, labels.length - 1);
            return <rect key={`hit-${l}-${i}`} x={x(i) - w / 2} y={0} width={w} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />;
          })}
        </svg>
        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg bg-primary px-3 py-2.5 shadow-lg ring-1 ring-secondary_alt"
            style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% + 12px), calc(100% - 184px))` }}
          >
            <div className="mb-1.5 text-xs font-semibold text-primary">{labels[hover]}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-xs">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                <span className="text-tertiary">{s.label}</span>
                <span className="ml-auto font-semibold text-primary tabular-nums">{s.format(s.values[hover] ?? 0)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {empty ? <p className="absolute inset-0 flex items-center justify-center text-sm text-tertiary">Nothing to chart yet.</p> : null}
      </div>
    </div>
  );
}

function MainChart({ data, me }: { data: HomeData; me: Me }) {
  const canFinance = me.settings.enabledPillars.includes("finance") && can(me.org.permissions, "invoice", "read");
  const { data: fin } = useFinanceSummary();
  const [range, setRange] = useState<"6" | "12">("12");

  if (canFinance && fin) {
    const months = fin.months.slice(-Number(range));
    const labels = months.map((m) => new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" }));
    const billed = fin.months.reduce((a, m) => a + m.billed, 0);
    const collected = fin.months.reduce((a, m) => a + m.collected, 0);
    return (
      <Card
        className="lg:col-span-8"
        title="Billed vs collected"
        description={
          <>
            {money(collected)} collected of {money(billed)} billed in the last 12 months.
          </>
        }
        action={
          <Segmented
            aria-label="Range"
            value={range}
            onChange={setRange}
            items={[
              { key: "6", label: "6 months" },
              { key: "12", label: "12 months" },
            ]}
          />
        }
      >
        <TrendChart
          labels={labels}
          axis={(v) => compactMoney(v)}
          series={[
            { key: "billed", label: "Billed", color: "var(--chart-billed)", values: months.map((m) => m.billed), format: (v) => money(v) },
            { key: "collected", label: "Collected", color: "var(--chart-collected)", values: months.map((m) => m.collected), format: (v) => money(v) },
          ]}
        />
      </Card>
    );
  }

  const v = data.work.velocity;
  return (
    <Card className="lg:col-span-8" title="Tasks completed" description="Across the team, last 14 days.">
      <TrendChart
        labels={v.map((d) => new Date(`${d.day}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }))}
        axis={(n) => String(Math.round(n))}
        series={[{ key: "done", label: "Completed", color: "var(--color-brand-600)", values: v.map((d) => d.done), format: (n) => plural(n, "task") }]}
      />
    </Card>
  );
}

/* ---------------- attention ---------------- */

const ATTENTION_META: Record<string, { icon: typeof Sparkles; color: "brand" | "gray" | "success" | "warning" | "error" }> = {
  leave: { icon: Palmtree, color: "success" },
  overdue_invoices: { icon: Banknote, color: "error" },
  draft_invoices: { icon: FileText, color: "warning" },
  onboarding: { icon: Rocket, color: "brand" },
  mentions: { icon: AtSign, color: "brand" },
};

function Attention({ data }: { data: HomeData }) {
  const router = useRouter();
  return (
    <Card className="lg:col-span-4" title="Needs your attention" description={data.attention.length ? plural(data.counts.attention, "item") + " waiting on you" : "You're all caught up."} bodyClassName="p-0 sm:p-0">
      {data.attention.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <FeaturedIcon color="success" theme="light" size="lg" icon={CircleCheckBig} />
          <p className="mt-4 text-sm font-semibold text-primary">Nothing needs you right now</p>
          <p className="mt-1 text-sm text-tertiary">Approvals, overdue invoices and mentions show up here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-secondary">
          {data.attention.map((a) => {
            const meta = ATTENTION_META[a.kind] ?? { icon: Sparkles, color: "gray" as const };
            return (
              <li key={a.kind}>
                <button
                  type="button"
                  onClick={() => router.history.push(a.link)}
                  className="group flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-primary_hover sm:px-6"
                >
                  <FeaturedIcon color={meta.color} theme="light" size="md" icon={meta.icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-primary">{a.title}</span>
                    <span className="block truncate text-sm text-tertiary">
                      {a.amount ? <span className="font-medium text-error-primary">{formatMoney(a.amount)}</span> : null}
                      {a.amount && a.detail ? " · " : null}
                      {a.detail}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-fg-quaternary transition group-hover:translate-x-0.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- tasks ---------------- */

function MyTasks({ data }: { data: HomeData }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"soon" | "overdue" | "all">("soon");
  const complete = useApiMutation((id: string) => api(`tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }), {
    invalidate: WORK_KEYS,
    success: "Nice. Marked as done.",
  });
  const today = data.today;
  const weekEnd = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10);
  const tasks = data.day.tasks.filter((t) =>
    filter === "overdue" ? Boolean(t.dueDate && t.dueDate < today) : filter === "soon" ? Boolean(t.dueDate && t.dueDate <= weekEnd) : true,
  );
  const b = data.day.buckets;

  return (
    <Card
      className="lg:col-span-8"
      title="My tasks"
      description={`${plural(data.day.openTotal, "open task")} · ${data.day.doneThisWeek} finished this week`}
      action={<ViewAll to="/work">Open My work</ViewAll>}
      bodyClassName="p-0 sm:p-0"
    >
      <div className="border-b border-secondary px-5 py-3 sm:px-6">
        <Segmented
          aria-label="Filter tasks"
          value={filter}
          onChange={setFilter}
          items={[
            { key: "soon", label: "Due this week", count: b.overdue + b.today + b.week },
            { key: "overdue", label: "Overdue", count: b.overdue },
            { key: "all", label: "All" },
          ]}
        />
      </div>
      {!data.me ? (
        <p className="px-6 py-10 text-center text-sm text-tertiary">Your account isn't linked to an employee profile yet, so no tasks can be assigned to you.</p>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <FeaturedIcon color="gray" theme="light" size="lg" icon={PartyPopper} />
          <p className="mt-4 text-sm font-semibold text-primary">{filter === "overdue" ? "Nothing overdue" : "Nothing due here"}</p>
          <p className="mt-1 text-sm text-tertiary">Enjoy it, or pick something up from a project.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-secondary">
          {tasks.map((t) => (
            <li key={t.id} className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-primary_hover sm:px-6">
              <button type="button" aria-label={`Complete "${t.title}"`} onClick={() => complete.mutate(t.id)} className="rounded outline-focus-ring focus-visible:outline-2">
                <CheckboxBase size="md" isSelected={false} className="group-hover:ring-brand" />
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: t.projectId ? `/work/projects/${t.projectId}` : "/work", search: { task: t.id } } as never)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <PriorityIcon priority={t.priority} />
                <span className="truncate text-sm font-medium text-primary">{t.title}</span>
              </button>
              {t.projectName ? (
                <span className="hidden max-w-40 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium text-secondary ring-1 ring-primary ring-inset sm:inline-flex">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: t.projectColor ?? "var(--color-fg-quaternary)" }} />
                  <span className="truncate">{t.projectKey && t.number ? `${t.projectKey}-${t.number}` : t.projectName}</span>
                </span>
              ) : t.source === "onboarding" ? (
                <Badge tone="people" className="hidden sm:inline-flex">
                  Onboarding
                </Badge>
              ) : null}
              <span className="w-20 shrink-0 text-right">
                <DueChip date={t.dueDate} done={false} today={today} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- upcoming ---------------- */

const UPCOMING_META = {
  holiday: { icon: PartyPopper, color: "var(--finance)" },
  milestone: { icon: Flag, color: "var(--work)" },
  leave: { icon: Palmtree, color: "var(--people)" },
  task: { icon: CircleCheckBig, color: "var(--collab)" },
} as const;

function Upcoming({ data }: { data: HomeData }) {
  const router = useRouter();
  const groups = new Map<string, HomeData["upcoming"]>();
  for (const u of data.upcoming) groups.set(u.date, [...(groups.get(u.date) ?? []), u]);
  return (
    <Card className="lg:col-span-4" title="Upcoming" description="Holidays, milestones, leave and due dates · next 14 days">
      {groups.size === 0 ? (
        <p className="py-8 text-center text-sm text-tertiary">A quiet fortnight.</p>
      ) : (
        <ol className="space-y-4">
          {[...groups.entries()].map(([date, items]) => {
            const d = new Date(`${date}T00:00:00`);
            const isToday = date === data.today;
            return (
              <li key={date} className="flex gap-4">
                <div
                  className={cn(
                    "flex w-12 shrink-0 flex-col items-center overflow-hidden rounded-lg text-center shadow-xs ring-1 ring-inset",
                    isToday ? "ring-brand" : "ring-secondary",
                  )}
                >
                  <span className={cn("w-full py-0.5 text-[10px] font-semibold uppercase", isToday ? "bg-brand-solid text-white" : "bg-secondary text-tertiary")}>
                    {d.toLocaleDateString("en-IN", { month: "short" })}
                  </span>
                  <span className="py-1 text-lg leading-none font-semibold text-primary">{d.getDate()}</span>
                </div>
                <ul className="min-w-0 flex-1 space-y-2 pt-0.5">
                  {items.map((u, i) => {
                    const meta = UPCOMING_META[u.kind];
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          disabled={!u.link}
                          onClick={() => u.link && router.history.push(u.link)}
                          className="flex w-full items-start gap-2 text-left enabled:hover:opacity-80 disabled:cursor-default"
                        >
                          <meta.icon className="mt-0.5 size-4 shrink-0" style={{ color: u.color ?? meta.color }} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-primary">{u.title}</span>
                            <span className="block truncate text-xs text-tertiary">
                              {d.toLocaleDateString("en-IN", { weekday: "long" })}
                              {u.detail ? ` · ${u.detail}` : ""}
                            </span>
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
    </Card>
  );
}

/* ---------------- projects ---------------- */

function Projects({ data }: { data: HomeData }) {
  return (
    <Card className="lg:col-span-6" title="Projects" description="Progress on what's in flight." action={<ViewAll to="/work/projects" />}>
      {data.work.projects.length === 0 ? (
        <p className="py-8 text-center text-sm text-tertiary">No active projects yet.</p>
      ) : (
        <ul className="space-y-5">
          {data.work.projects.map((p) => {
            const done = p.total ? Math.round((p.done / p.total) * 100) : 0;
            return (
              <li key={p.id}>
                <Link to="/work/projects/$id" params={{ id: p.id }} className="group flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-xs-skeuomorphic" style={{ background: p.color }}>
                    {p.key.slice(0, 3)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold text-primary group-hover:underline">{p.name}</span>
                      <span className="shrink-0 text-sm font-medium text-tertiary tabular-nums">{done}%</span>
                    </span>
                    <span className="mt-2 block h-2 overflow-hidden rounded-full bg-quaternary">
                      <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${done}%`, background: p.color }} />
                    </span>
                    <span className="mt-1.5 block text-xs text-tertiary">
                      {p.done} of {p.total} tasks
                      {p.overdue ? <span className="text-error-primary"> · {p.overdue} overdue</span> : null}
                      {p.dueDate ? ` · due ${new Date(`${p.dueDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- activity ---------------- */

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

function Activity({ data }: { data: HomeData }) {
  const items = data.activity.slice(0, 6);
  return (
    <Card className="lg:col-span-6" title="Recent activity" description="What's been happening across the company." action={<ViewAll to="/settings/audit" />}>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-tertiary">Activity from across the company shows up here.</p>
      ) : (
        <ol>
          {items.map((a, i) => (
            <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
              {i < items.length - 1 ? <span className="absolute top-11 bottom-1 left-5 w-px bg-border-secondary" aria-hidden /> : null}
              <Avatar name={a.actorName ?? "Hephaestus"} src={a.actorImage} className="size-10" />
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold text-primary">{a.actorName ?? "Hephaestus"}</span>
                  <span className="shrink-0 text-xs text-tertiary">{ago(a.createdAt)}</span>
                </div>
                <p className="text-sm text-tertiary">{describe(a)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ---------------- setup ---------------- */

function setupSteps(data: HomeData) {
  return [
    { done: true, label: "Sign in with Webrizen", to: "/" },
    { done: data.people.headcount > 1, label: "Add your team", to: "/people/directory" },
    { done: data.work.projects.length > 0, label: "Start a project", to: "/work/projects" },
    ...(data.finance ? [{ done: data.finance.monthly.some((m) => m.amount > 0) || data.finance.outstanding > 0, label: "Send an invoice", to: "/finance" }] : []),
  ];
}

/** A slim Untitled UI progress banner while the workspace is being set up. */
function SetupBanner({ data }: { data: HomeData }) {
  const steps = setupSteps(data);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset sm:flex-row sm:items-center sm:p-5">
      <FeaturedIcon color="brand" theme="light" size="md" icon={Rocket} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary">Finish setting up your workspace</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="h-2 max-w-60 flex-1 overflow-hidden rounded-full bg-quaternary">
            <span className="block h-full rounded-full bg-brand-solid" style={{ width: `${(done / steps.length) * 100}%` }} />
          </span>
          <span className="text-sm font-medium text-tertiary">
            {done} of {steps.length} done
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {steps
          .filter((s) => !s.done)
          .map((s) => (
            <Button key={s.label} size="sm" variant="secondary" asChild>
              <Link to={s.to}>
                {s.label}
                <ArrowRight />
              </Link>
            </Button>
          ))}
      </div>
    </section>
  );
}

/* ---------------- page ---------------- */

export function HomePage({ me }: { me: Me }) {
  const { data, isLoading } = useHome();
  const firstName = me.user.name.split(" ")[0];
  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const p = me.org.permissions;

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-8">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const b = data.day.buckets;
  const dueNow = b.today + b.overdue;
  const summary = (
    <>
      {dueNow ? (
        <>
          You have <Em tone="var(--color-text-brand-secondary)">{plural(dueNow, "task")}</Em> {b.overdue ? "due or overdue" : "due today"}
        </>
      ) : (
        <>Nothing is due today</>
      )}
      {data.counts.attention ? (
        <>
          {" "}
          and <Em>{plural(data.counts.attention, "thing")}</Em> waiting for you
        </>
      ) : null}
      .
    </>
  );

  return (
    <div className="mx-auto space-y-8 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-tertiary">{date}</p>
          <h1 className="mt-1 text-display-xs font-semibold text-primary sm:text-display-sm">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-md text-tertiary">{summary}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {can(p, "task", "create") ? (
            <Button variant="secondary" asChild>
              <Link to="/work">
                <ListPlus /> New task
              </Link>
            </Button>
          ) : null}
          {me.settings.enabledPillars.includes("finance") && can(p, "invoice", "create") ? (
            <Button variant="primary" asChild>
              <Link to="/finance/new" search={{ kind: "invoice" }}>
                <Plus /> New invoice
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <SetupBanner data={data} />

      <Metrics data={data} me={me} />

      <div className="grid gap-5 lg:grid-cols-12">
        <MainChart data={data} me={me} />
        <Attention data={data} />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <MyTasks data={data} />
        <Upcoming data={data} />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Projects data={data} />
        <Activity data={data} />
      </div>

      <p className="flex items-center justify-center gap-2 pb-2 text-xs text-quaternary">
        <CalendarDays className="size-3.5" /> Updated live as your team works.
      </p>
    </div>
  );
}
