import { can } from "@hephaestus/core";
import { Avatar, Button, cn, Em, EmptyState, KpiTile, Meter, PageHero, Panel, Sparkline } from "@hephaestus/ui";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, BarChart3, FilePlus2, FileText, Hourglass, Landmark, Receipt, Table2, TrendingUp, Users, Wallet } from "lucide-react";
import { useState } from "react";
import type { Me } from "../../lib/api.ts";
import { compactMoney, money, PAYMENT_METHOD_LABEL, useFinanceSummary } from "../../lib/finance.ts";
import { formatDate } from "../../lib/people.ts";
import { FinanceBody } from "./layout.tsx";

type Month = { month: string; billed: number; collected: number };

const SERIES = [
  { key: "billed", label: "Billed", color: "var(--chart-billed)" },
  { key: "collected", label: "Collected", color: "var(--chart-collected)" },
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

/** Grouped bars: billed vs collected per month. One y-axis, legend above, hover per month. */
function RevenueChart({ months }: { months: Month[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const W = 720;
  const H = 240;
  const pad = { l: 56, r: 8, t: 12, b: 28 };
  const max = Math.max(...months.flatMap((m) => [m.billed, m.collected]), 0);
  const t = ticks(max);
  const top = t[t.length - 1]!;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const band = (W - pad.l - pad.r) / months.length;
  const barW = Math.min(18, (band - 10) / 2);
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
            </tr>
          </thead>
          <tbody className="divide-y divide-border-secondary">
            {months.map((m) => (
              <tr key={m.month}>
                <td className="py-1.5">{monthLabel(m.month, true)}</td>
                <td className="py-1.5 text-right font-mono">{money(m.billed)}</td>
                <td className="py-1.5 text-right font-mono">{money(m.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Billed and collected by month, last 12 months" onMouseLeave={() => setHover(null)}>
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
                    const x = cx - barW - 1 + j * (barW + 2);
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
                  <rect x={pad.l + band * i} y={0} width={band} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${monthLabel(m.month, true)}: billed ${money(m.billed)}, collected ${money(m.collected)}`} />
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
  ["current", "Not yet due"],
  ["1-30", "1–30 days late"],
  ["31-60", "31–60 days late"],
  ["61-90", "61–90 days late"],
  ["90+", "90+ days late"],
] as const;

export function FinanceOverviewPage({ me }: { me: Me }) {
  const navigate = useNavigate();
  const { data } = useFinanceSummary();
  const fy = data ? `FY ${data.financialYearStart.slice(2, 4)}-${String(Number(data.financialYearStart.slice(2, 4)) + 1).padStart(2, "0")}` : "this year";
  const agingMax = Math.max(1, ...Object.values(data?.aging ?? { x: 0 }));
  const collectionRate = data && data.billedThisYear ? Math.round((data.collectedThisYear / data.billedThisYear) * 100) : null;
  const thisMonth = data?.months.at(-1);
  const lastMonth = data?.months.at(-2);
  const delta = thisMonth && lastMonth && lastMonth.collected ? Math.round(((thisMonth.collected - lastMonth.collected) / lastMonth.collected) * 100) + 0 : null;
  const canCreate = can(me.org.permissions, "invoice", "create");

  return (
    <FinanceBody>
      <PageHero
        eyebrow={`Finance · ${fy}`}
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

      <Panel title="Billed vs collected" icon={<BarChart3 />} tone="var(--finance)" meta="last 12 months" className="rise rise-2">
        {data ? <RevenueChart months={data.months} /> : <div className="h-60" />}
      </Panel>

      <div className="rise rise-3 grid gap-4 lg:grid-cols-3">
        <Panel title="Receivables by age" icon={<Hourglass />} tone="var(--chart-billed)" meta={data ? compactMoney(data.outstanding) : undefined}>
          <ul className="space-y-3.5">
            {AGING.map(([k, label]) => {
              const v = data?.aging[k] ?? 0;
              return (
                <li key={k} className="text-sm">
                  <div className="flex justify-between">
                    <span className={cn(k !== "current" && v ? "text-primary" : "text-tertiary")}>{label}</span>
                    <span className="font-mono text-[13px]">{money(v)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full" style={{ width: `${(v / agingMax) * 100}%`, background: k === "current" ? "var(--chart-collected)" : "var(--chart-billed)" }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>

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
          <FileText className="size-4" /> Tip: set your GSTIN and bank details in Settings first, so every invoice is ready to send.
        </p>
      ) : null}
    </FinanceBody>
  );
}
