import { can } from "@operant/core";
import { Avatar, Button, cn, Em, EmptyState, KpiTile, Meter, PageHero, Panel, Sparkline } from "@operant/ui";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, BarChart3, FilePlus2, FileText, Hourglass, Landmark, PieChart, Receipt, Table2, TrendingUp, Users, Wallet } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { Me } from "../../lib/api.ts";
import { compactMoney, money, PAYMENT_METHOD_LABEL, useFinanceSummary } from "../../lib/finance.ts";
import { formatDate } from "../../lib/people.ts";
import { FinanceBody } from "./layout.tsx";

type Month = { month: string; billed: number; collected: number; due: number };

const SERIES = [
  { key: "billed", label: "Billed", color: "var(--chart-billed)" },
  { key: "collected", label: "Collected", color: "var(--chart-collected)" },
  { key: "due", label: "Due", color: "var(--chart-due)" },
] as const;

const monthLabel = (m: string, long = false) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: long ? "long" : "short", ...(long ? { year: "numeric" } : {}) });

/** "Nice" axis maximum and ticks for money in paise. */
function ticks(max: number) {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((n) => n * pow).find((s) => s >= raw)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** Grouped bars: billed, collected and still due per month. One y-axis, legend above, hover per month. */
function RevenueChart({ months }: { months: Month[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const W = 720;
  const H = 240;
  const pad = { l: 56, r: 8, t: 12, b: 28 };
  const max = Math.max(...months.flatMap((m) => [m.billed, m.collected, m.due]), 0);
  const t = ticks(max);
  const top = t[t.length - 1]!;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const band = (W - pad.l - pad.r) / months.length;
  const barW = Math.min(14, (band - 12) / SERIES.length);
  const empty = max === 0;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-sm">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-tertiary">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          <Table2 /> {asTable ? "Show chart" : "Show table"}
        </Button>
      </div>

      {asTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-secondary text-left text-xs text-tertiary">
              <th className="py-2 font-medium">Month</th>
              <th className="py-2 text-right font-medium">Billed</th>
              <th className="py-2 text-right font-medium">Collected</th>
              <th className="py-2 text-right font-medium">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-secondary">
            {months.map((m) => (
              <tr key={m.month}>
                <td className="py-1.5">{monthLabel(m.month, true)}</td>
                <td className="py-1.5 text-right font-mono">{money(m.billed)}</td>
                <td className="py-1.5 text-right font-mono">{money(m.collected)}</td>
                <td className="py-1.5 text-right font-mono">{money(m.due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Billed, collected and due by month, last 12 months" onMouseLeave={() => setHover(null)}>
            {t.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-border-secondary)" strokeWidth={1} />
                <text x={pad.l - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-fg-quaternary font-mono text-[10px]">
                  {compactMoney(v)}
                </text>
              </g>
            ))}
            {months.map((m, i) => {
              const cx = pad.l + band * i + band / 2;
              return (
                <g key={m.month}>
                  {hover === i ? <rect x={pad.l + band * i + 2} y={pad.t} width={band - 4} height={H - pad.t - pad.b} rx={6} fill="var(--color-bg-secondary)" /> : null}
                  {SERIES.map((s, j) => {
                    const v = m[s.key];
                    const h = Math.max(v > 0 ? 2 : 0, y(0) - y(v));
                    const x = cx - (SERIES.length * barW + (SERIES.length - 1) * 2) / 2 + j * (barW + 2);
                    // Rounded data end, square at the baseline.
                    const r = Math.min(4, h / 2, barW / 2);
                    const top = y(0) - h;
                    return h > 0 ? (
                      <path
                        key={s.key}
                        d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${y(0)} Z`}
                        fill={s.color}
                      />
                    ) : null;
                  })}
                  <text x={cx} y={H - 8} textAnchor="middle" className="fill-fg-quaternary text-[10px]">
                    {monthLabel(m.month)}
                  </text>
                  {/* Hit target: the whole month column. */}
                  <rect x={pad.l + band * i} y={0} width={band} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${monthLabel(m.month, true)}: billed ${money(m.billed)}, collected ${money(m.collected)}, due ${money(m.due)}`} />
                </g>
              );
            })}
            <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--color-border-primary)" strokeWidth={1} />
          </svg>
          {hover !== null && months[hover] ? (
            <div
              className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-secondary bg-primary px-3 py-2 text-xs shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]"
              style={{ left: `clamp(0px, calc(${((pad.l + band * hover + band / 2) / W) * 100}% - 88px), calc(100% - 176px))` }}
            >
              <div className="mb-1 font-medium text-primary">{monthLabel(months[hover].month, true)}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="size-2 rounded-sm" style={{ background: s.color }} />
                  <span className="text-tertiary">{s.label}</span>
                  <span className="ml-auto font-mono text-primary">{money(months[hover]![s.key])}</span>
                </div>
              ))}
            </div>
          ) : null}
          {empty ? <p className="absolute inset-0 flex items-center justify-center text-sm text-tertiary">No invoices or payments in the last 12 months.</p> : null}
        </div>
      )}
    </div>
  );
}

const AGING = [
  ["current", "Not yet due", "var(--chart-age-1)"],
  ["1-30", "1–30 days late", "var(--chart-age-2)"],
  ["31-60", "31–60 days late", "var(--chart-age-3)"],
  ["61-90", "61–90 days late", "var(--chart-age-4)"],
  ["90+", "90+ days late", "var(--chart-age-5)"],
] as const;

const CLIENT_COLORS = ["var(--chart-c1)", "var(--chart-c2)", "var(--chart-c3)", "var(--chart-c4)", "var(--chart-c5)"];

type Slice = { key: string; label: ReactNode; value: number; color: string };

/** One arc of a ring, from angle a0 to a1 (radians, 0 = 12 o'clock). */
function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)} A${r1},${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

/**
 * A donut with its legend as the value table. Slices are separated by a 2px surface
 * gap; hovering a slice (or its legend row) puts its amount in the centre.
 */
function Donut({ slices, total, caption, empty }: { slices: Slice[]; total: number; caption: string; empty: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const shown = slices.filter((s) => s.value > 0);
  const sum = shown.reduce((a, s) => a + s.value, 0);
  const active = shown.find((s) => s.key === hover);
  const S = 160;
  const c = S / 2;
  let angle = 0;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative shrink-0" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${S} ${S}`} className="size-40" role="img" aria-label={`${caption}: ${shown.map((s) => `${typeof s.label === "string" ? s.label : s.key} ${money(s.value)}`).join(", ") || empty}`}>
          {sum === 0 ? <circle cx={c} cy={c} r={60} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth={22} /> : null}
          {shown.map((s) => {
            const a0 = angle;
            const a1 = (angle += (s.value / sum) * Math.PI * 2);
            const dim = hover !== null && hover !== s.key;
            // A lone slice is a full ring: draw it as a circle so the arc doesn't collapse.
            return shown.length === 1 ? (
              <circle key={s.key} cx={c} cy={c} r={60} fill="none" stroke={s.color} strokeWidth={22} onMouseEnter={() => setHover(s.key)} />
            ) : (
              <path
                key={s.key}
                d={arc(c, c, hover === s.key ? 47 : 49, hover === s.key ? 74 : 71, a0, a1)}
                fill={s.color}
                stroke="var(--color-bg-primary)"
                strokeWidth={2}
                strokeLinejoin="round"
                opacity={dim ? 0.35 : 1}
                className="transition-opacity"
                onMouseEnter={() => setHover(s.key)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="max-w-24 truncate text-[11px] text-tertiary">{active ? active.label : caption}</span>
          <span className="font-mono text-md font-semibold text-primary">{compactMoney(active ? active.value : total)}</span>
          {active && sum ? <span className="text-[11px] text-tertiary">{Math.round((active.value / sum) * 100)}%</span> : null}
        </div>
      </div>
      {sum === 0 ? (
        <p className="text-sm text-tertiary">{empty}</p>
      ) : (
        <ul className="w-full min-w-0 space-y-1 text-sm">
          {shown.map((s) => (
            <li
              key={s.key}
              className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors", hover === s.key && "bg-secondary")}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate text-secondary">{s.label}</span>
              <span className="font-mono text-[12.5px] text-primary">{compactMoney(s.value)}</span>
              <span className="w-9 text-right text-[11.5px] text-tertiary">{Math.round((s.value / sum) * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FinanceOverviewPage({ me }: { me: Me }) {
  const navigate = useNavigate();
  const { data } = useFinanceSummary();
  const fy = data ? `FY ${data.financialYearStart.slice(2, 4)}-${String(Number(data.financialYearStart.slice(2, 4)) + 1).padStart(2, "0")}` : "this year";
  const collectionRate = data && data.billedThisYear ? Math.round((data.collectedThisYear / data.billedThisYear) * 100) : null;
  const thisMonth = data?.months.at(-1);
  const lastMonth = data?.months.at(-2);
  const delta = thisMonth && lastMonth && lastMonth.collected ? Math.round(((thisMonth.collected - lastMonth.collected) / lastMonth.collected) * 100) + 0 : null;
  const canCreate = can(me.org.permissions, "invoice", "create");

  return (
    <FinanceBody>
      <PageHero
        eyebrow={fy}
        tone="var(--finance)"
        title="Money in, money owed"
        summary={
          data ? (
            <>
              Clients owe you <Em tone="var(--finance)">{money(data.outstanding)}</Em>
              {data.overdue ? (
                <>
                  , of which <Em tone="var(--color-fg-error-primary)">{money(data.overdue)}</Em> is overdue
                </>
              ) : (
                <>, and nothing is overdue</>
              )}
              .{collectionRate !== null ? <> You've collected <Em>{collectionRate}%</Em> of what you billed this year.</> : null}
            </>
          ) : (
            " "
          )
        }
        actions={
          canCreate ? (
            <>
              <Button variant="secondary" asChild>
                <Link to="/finance/new" search={{ kind: "quote" }}>
                  <FileText /> New quote
                </Link>
              </Button>
              <Button variant="primary" asChild>
                <Link to="/finance/new" search={{ kind: "invoice" }}>
                  <FilePlus2 /> New invoice
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <div className="rise rise-1 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Outstanding"
          icon={<Wallet />}
          tone="var(--finance)"
          value={data ? compactMoney(data.outstanding) : "—"}
          hint={data ? [money(data.outstanding), ...data.foreignOutstanding.map((f) => `+ ${money(f.amount, f.currency)}`)].join(" ") : undefined}
          onClick={() => navigate({ to: "/finance/invoices" })}
          footer={
            data ? (
              <div>
                <Meter value={data.aging.current} max={Math.max(1, data.outstanding)} color="var(--chart-collected)" label="Share not yet due" />
                <div className="mt-1.5 text-[11px] text-quaternary">{data.outstanding ? Math.round((data.aging.current / data.outstanding) * 100) : 100}% not yet due</div>
              </div>
            ) : null
          }
        />
        <KpiTile
          label="Overdue"
          icon={<AlertTriangle />}
          tone="var(--color-fg-error-primary)"
          value={data ? compactMoney(data.overdue) : "—"}
          hint={data?.overdue ? "Send a reminder or record a payment" : "Nothing late"}
          trend={data?.overdue ? { label: "Follow up", good: false } : undefined}
          onClick={() => navigate({ to: "/finance/invoices" })}
        />
        <KpiTile
          label={`Billed, ${fy}`}
          icon={<TrendingUp />}
          tone="var(--chart-billed)"
          value={data ? compactMoney(data.billedThisYear) : "—"}
          hint={data?.drafts ? `${data.drafts} draft${data.drafts === 1 ? "" : "s"} waiting` : "No drafts waiting"}
          footer={data ? <Sparkline values={data.months.map((m) => m.billed)} color="var(--chart-billed)" height={28} bars /> : null}
        />
        <KpiTile
          label={`Collected, ${fy}`}
          icon={<Landmark />}
          tone="var(--chart-collected)"
          value={data ? compactMoney(data.collectedThisYear) : "—"}
          hint={collectionRate !== null ? `${collectionRate}% of billed` : "Nothing billed yet"}
          trend={delta !== null ? { label: `${delta >= 0 ? "+" : ""}${delta}% MoM`, good: delta >= 0 } : undefined}
          footer={data ? <Sparkline values={data.months.map((m) => m.collected)} color="var(--chart-collected)" height={28} /> : null}
        />
      </div>

      <Panel title="Billed, collected and due" icon={<BarChart3 />} tone="var(--finance)" meta="last 12 months" className="rise rise-2">
        {data ? <RevenueChart months={data.months} /> : <div className="h-60" />}
      </Panel>

      <div className="rise rise-3 grid gap-4 lg:grid-cols-3">
        <Panel title="Money" icon={<PieChart />} tone="var(--chart-collected)" meta={fy}>
          {data ? (
            <Donut
              caption="Total"
              total={data.collectedThisYear + data.outstanding}
              empty="Nothing billed or collected yet."
              slices={[
                { key: "collected", label: "Collected", value: data.collectedThisYear, color: "var(--chart-collected)" },
                { key: "due", label: "Due, not late", value: data.aging.current, color: "var(--chart-due)" },
                {
                  key: "late",
                  label: (
                    <span className="inline-flex items-center gap-1">
                      Overdue <AlertTriangle className="size-3.5 text-fg-error-secondary" />
                    </span>
                  ),
                  value: data.overdue,
                  color: "var(--chart-late)",
                },
              ]}
            />
          ) : (
            <div className="h-40" />
          )}
        </Panel>

        <Panel title="Owed by client" icon={<Users />} tone="var(--finance)" meta={data ? compactMoney(data.outstanding) : undefined}>
          {data ? (
            <Donut
              caption="Owed"
              total={data.outstanding}
              empty="Everyone's paid up."
              slices={[
                ...data.topClients.slice(0, 5).map((c, i) => ({ key: c.clientId, label: c.name, value: c.outstanding, color: CLIENT_COLORS[i]! })),
                { key: "other", label: "Everyone else", value: Math.max(0, data.outstanding - data.topClients.slice(0, 5).reduce((a, c) => a + c.outstanding, 0)), color: "var(--chart-other)" },
              ]}
            />
          ) : (
            <div className="h-40" />
          )}
        </Panel>

        <Panel title="Owed by age" icon={<Hourglass />} tone="var(--chart-billed)" meta={data ? compactMoney(data.outstanding) : undefined}>
          {data ? (
            <Donut caption="Owed" total={data.outstanding} empty="Nothing outstanding." slices={AGING.map(([k, label, color]) => ({ key: k, label, value: data.aging[k], color }))} />
          ) : (
            <div className="h-40" />
          )}
        </Panel>
      </div>

      <div className="rise rise-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Who owes the most"
          icon={<Users />}
          tone="var(--finance)"
          action={
            <Link to="/finance/clients" className="inline-flex items-center gap-1 text-brand-secondary hover:underline">
              Clients <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {data?.topClients.length === 0 ? <EmptyState icon={<Users />} title="Everyone's paid up" /> : null}
          <ul className="space-y-1">
            {data?.topClients.map((c) => (
              <li key={c.clientId}>
                <Link to="/finance/clients/$id" params={{ id: c.clientId }} className="flex items-center gap-3 rounded-lg p-1.5 text-sm hover:bg-secondary">
                  <Avatar name={c.name} className="size-8 rounded-lg text-[11px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    {c.overdue ? <span className="block font-mono text-[11px] text-error-primary">{money(c.overdue)} late</span> : <span className="block text-[11px] text-tertiary">On time</span>}
                  </span>
                  <span className="font-mono text-[13px]">{compactMoney(c.outstanding)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Recent payments"
          icon={<Receipt />}
          tone="var(--chart-collected)"
          action={
            <Link to="/finance/payments" className="inline-flex items-center gap-1 text-brand-secondary hover:underline">
              All <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {data?.recentPayments.length === 0 ? <EmptyState icon={<Receipt />} title="No payments yet" description="Payments you record or receive online show up here." /> : null}
          <ol className="space-y-3 border-l border-secondary pl-4">
            {data?.recentPayments.map((p) => (
              <li key={p.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-bg-primary bg-[var(--chart-collected)]" />
                <Link to="/finance/invoices/$id" params={{ id: p.invoiceId }} className="flex items-center justify-between gap-3 text-sm hover:underline">
                  <span className="min-w-0">
                    <span className="block truncate">{p.clientName}</span>
                    <span className="block text-[11.5px] text-tertiary">
                      {formatDate(p.paidOn, { day: "numeric", month: "short" })} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                    </span>
                  </span>
                  <span className="font-mono text-[13px] text-success-primary">+{compactMoney(p.amount, p.currency)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
      {data && !data.billedThisYear && !data.outstanding ? (
        <p className="flex items-center gap-2 text-sm text-tertiary">
          <FileText className="size-4" /> Tip: add your business details and bank account in Finance settings (and your GSTIN, if you're registered) so every invoice is ready to send.
        </p>
      ) : null}
    </FinanceBody>
  );
}
