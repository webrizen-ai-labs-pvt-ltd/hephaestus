import { can } from "@hephaestus/core";
import { Button, Card, cn, Stat } from "@hephaestus/ui";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, FilePlus2, FileText, Landmark, Table2, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/app-shell.tsx";
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
          <span key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
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
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Month</th>
              <th className="py-2 text-right font-medium">Billed</th>
              <th className="py-2 text-right font-medium">Collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
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
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
                <text x={pad.l - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground font-mono text-[10px]">
                  {compactMoney(v)}
                </text>
              </g>
            ))}
            {months.map((m, i) => {
              const cx = pad.l + band * i + band / 2;
              return (
                <g key={m.month}>
                  {hover === i ? <rect x={pad.l + band * i + 2} y={pad.t} width={band - 4} height={H - pad.t - pad.b} rx={6} fill="var(--surface-2)" /> : null}
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
                  <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                    {monthLabel(m.month)}
                  </text>
                  {/* Hit target: the whole month column. */}
                  <rect x={pad.l + band * i} y={0} width={band} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${monthLabel(m.month, true)}: billed ${money(m.billed)}, collected ${money(m.collected)}`} />
                </g>
              );
            })}
            <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--input)" strokeWidth={1} />
          </svg>
          {hover !== null && months[hover] ? (
            <div
              className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]"
              style={{ left: `clamp(0px, calc(${((pad.l + band * hover + band / 2) / W) * 100}% - 88px), calc(100% - 176px))` }}
            >
              <div className="mb-1 font-medium text-foreground">{monthLabel(months[hover].month, true)}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="size-2 rounded-sm" style={{ background: s.color }} />
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="ml-auto font-mono text-foreground">{money(months[hover]![s.key])}</span>
                </div>
              ))}
            </div>
          ) : null}
          {empty ? <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No invoices or payments in the last 12 months.</p> : null}
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
  const { data } = useFinanceSummary();
  const fy = data ? `FY ${data.financialYearStart.slice(2, 4)}-${String(Number(data.financialYearStart.slice(2, 4)) + 1).padStart(2, "0")}` : "this year";
  const agingMax = Math.max(1, ...Object.values(data?.aging ?? { x: 0 }));
  const collectionRate = data && data.billedThisYear ? Math.round((data.collectedThisYear / data.billedThisYear) * 100) : null;

  return (
    <FinanceBody>
      <PageHeader
        title="Finance"
        description="What you've billed, what's come in, and what's still owed."
        actions={
          can(me.org.permissions, "invoice", "create") ? (
            <Button variant="primary" asChild>
              <Link to="/finance/new" search={{ kind: "invoice" }}>
                <FilePlus2 /> New invoice
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Outstanding" value={data ? compactMoney(data.outstanding) : "—"} icon={<Wallet />} tone="text-finance" hint={data ? [money(data.outstanding), ...data.foreignOutstanding.map((f) => `+ ${money(f.amount, f.currency)}`)].join(" ") : undefined} />
        <Stat
          label="Overdue"
          value={data ? compactMoney(data.overdue) : "—"}
          icon={<AlertTriangle />}
          tone="text-danger"
          hint={
            data?.overdue ? (
              <Link to="/finance/invoices" className="text-accent hover:underline">
                Follow up
              </Link>
            ) : (
              "Nothing late"
            )
          }
        />
        <Stat label={`Billed, ${fy}`} value={data ? compactMoney(data.billedThisYear) : "—"} icon={<TrendingUp />} tone="text-finance" hint={data?.drafts ? `${data.drafts} draft${data.drafts === 1 ? "" : "s"} waiting` : undefined} />
        <Stat label={`Collected, ${fy}`} value={data ? compactMoney(data.collectedThisYear) : "—"} icon={<Landmark />} tone="text-collab" hint={collectionRate !== null ? `${collectionRate}% of billed` : undefined} />
      </div>

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-bold">Last 12 months</h2>
        {data ? <RevenueChart months={data.months} /> : <div className="h-60" />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="text-lg font-bold">Receivables by age</h2>
          <ul className="mt-4 space-y-3">
            {AGING.map(([k, label]) => {
              const v = data?.aging[k] ?? 0;
              return (
                <li key={k} className="text-sm">
                  <div className="flex justify-between">
                    <span className={cn(k !== "current" && v ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                    <span className="font-mono">{money(v)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${(v / agingMax) * 100}%`, background: k === "current" ? "var(--chart-collected)" : "var(--chart-billed)" }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-bold">Who owes the most</h2>
          {data?.topClients.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Everyone's paid up.</p> : null}
          <ul className="mt-4 space-y-3">
            {data?.topClients.map((c) => (
              <li key={c.clientId}>
                <Link to="/finance/clients/$id" params={{ id: c.clientId }} className="flex items-center justify-between gap-3 text-sm hover:underline">
                  <span className="truncate">{c.name}</span>
                  <span className="text-right">
                    <span className="block font-mono">{money(c.outstanding)}</span>
                    {c.overdue ? <span className="block font-mono text-xs text-danger">{money(c.overdue)} late</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-bold">Recent payments</h2>
          {data?.recentPayments.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No payments recorded yet.</p> : null}
          <ul className="mt-4 space-y-3">
            {data?.recentPayments.map((p) => (
              <li key={p.id}>
                <Link to="/finance/invoices/$id" params={{ id: p.invoiceId }} className="flex items-center justify-between gap-3 text-sm hover:underline">
                  <span className="min-w-0">
                    <span className="block truncate">{p.clientName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(p.paidOn, { day: "numeric", month: "short" })} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                    </span>
                  </span>
                  <span className="font-mono">{money(p.amount, p.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {data && !data.billedThisYear && !data.outstanding ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="size-4" /> Tip: set your GSTIN and bank details in Settings first, so every invoice is ready to send.
        </p>
      ) : null}
    </FinanceBody>
  );
}
