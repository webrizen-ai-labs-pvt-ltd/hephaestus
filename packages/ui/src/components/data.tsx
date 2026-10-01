import type { ReactNode } from "react";
import { cn } from "../cn.ts";

/*
 * Data display building blocks: page hero, KPI tiles, sparklines, meters,
 * rings. Colours come in as CSS values (e.g. "var(--people)") so each pillar
 * keeps its identity.
 */

/** The top of a page: eyebrow, title, a sentence that says what matters, actions, and optional content below. */
export function PageHero({
  eyebrow,
  tone = "var(--ember)",
  title,
  summary,
  actions,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  tone?: string;
  title: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative rise", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? (
            <div className="eyebrow mb-2 flex items-center gap-2">
              <span className="size-1.5 rounded-full" style={{ background: tone, boxShadow: `0 0 0 3px color-mix(in srgb, ${tone} 22%, transparent)` }} />
              {eyebrow}
            </div>
          ) : null}
          <h1 className="text-[28px] font-bold leading-[1.1] sm:text-[34px]">{title}</h1>
          {summary ? <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{summary}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}

/** A highlighted value inside summary sentences ("3 tasks due today"). */
export function Em({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span className="font-medium text-foreground" style={tone ? { color: tone } : undefined}>
      {children}
    </span>
  );
}

/** A KPI tile: label, big value, context line, and an optional visual (sparkline, meter) at the bottom. */
export function KpiTile({
  label,
  value,
  hint,
  icon,
  tone = "var(--muted-foreground)",
  trend,
  footer,
  className,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: string;
  trend?: { label: string; good: boolean | null };
  footer?: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface p-4 text-left shadow-card transition-colors sm:p-5",
        onClick && "hover:border-border-strong",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full opacity-60 blur-2xl"
        style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)` }}
      />
      <div className="relative flex items-center gap-2">
        {icon ? (
          <span
            className="flex size-7 items-center justify-center rounded-lg [&_svg]:size-4"
            style={{ color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)` }}
          >
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-[13px] text-muted-foreground">{label}</span>
        {trend ? (
          <span
            className={cn(
              "ml-auto shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[11px]",
              trend.good === null ? "bg-surface-2 text-muted-foreground" : trend.good ? "bg-success/12 text-success" : "bg-danger/12 text-danger",
            )}
          >
            {trend.label}
          </span>
        ) : null}
      </div>
      <div className="relative mt-3 font-display text-[30px] font-bold leading-none tracking-tight tabular">{value}</div>
      {hint ? <div className="relative mt-1.5 text-xs text-muted-foreground">{hint}</div> : null}
      {footer ? <div className="relative mt-auto pt-4">{footer}</div> : null}
    </Comp>
  );
}

/** A tiny trend line with a soft area fill. Values are plotted on their own scale. */
export function Sparkline({ values, color = "var(--ember)", height = 36, className, bars = false }: { values: number[]; color?: string; height?: number; className?: string; bars?: boolean }) {
  const w = 120;
  const max = Math.max(1, ...values);
  if (!values.length) return null;
  if (bars) {
    const bw = w / values.length;
    return (
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn("block w-full", className)} style={{ height }} aria-hidden>
        {values.map((v, i) => {
          const h = Math.max(v > 0 ? 2 : 1, (v / max) * (height - 2));
          return <rect key={i} x={i * bw + 1} y={height - h} width={Math.max(1, bw - 2)} height={h} rx={1.5} fill={color} opacity={v > 0 ? (i === values.length - 1 ? 1 : 0.55) : 0.18} />;
        })}
      </svg>
    );
  }
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const id = `spark-${Math.abs(values.reduce((a, b) => a * 31 + b, 7)) % 1e9}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn("block w-full overflow-visible", className)} style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={2.5} fill={color} />
    </svg>
  );
}

/** Horizontal progress bar. */
export function Meter({ value, max = 100, color = "var(--ember)", className, label }: { value: number; max?: number; color?: string; className?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** Circular progress with the percentage (or custom content) in the middle. */
export function ProgressRing({ value, size = 44, stroke = 4, color = "var(--ember)", children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="absolute font-mono text-[11px] font-medium">{children ?? `${Math.round(pct)}%`}</span>
    </div>
  );
}

/** A titled panel: header row with title, optional meta and action, then content. */
export function Panel({
  title,
  icon,
  tone,
  meta,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  icon?: ReactNode;
  tone?: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-card border border-border bg-surface shadow-card", className)}>
      <header className="flex items-center gap-2.5 px-5 pb-1 pt-4">
        {icon ? (
          <span className="[&_svg]:size-4" style={{ color: tone ?? "var(--muted-foreground)" }}>
            {icon}
          </span>
        ) : null}
        <h2 className="text-[15px] font-bold">{title}</h2>
        {meta ? <span className="font-mono text-xs text-muted-foreground">{meta}</span> : null}
        {action ? <div className="ml-auto text-sm">{action}</div> : null}
      </header>
      <div className={cn("flex-1 px-5 pb-5 pt-3", bodyClassName)}>{children}</div>
    </section>
  );
}
