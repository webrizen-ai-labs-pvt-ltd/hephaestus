import { cn } from "@hephaestus/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

export interface PillarTab {
  to: string;
  label: string;
  icon?: LucideIcon;
  /** Only this exact path is active (overview pages). */
  exact?: boolean;
  /** Extra paths that also highlight this tab. */
  also?: (pathname: string) => boolean;
  count?: number;
}

/** The sticky section bar under the header: pillar name, then pill tabs. */
export function PillarNav({ name, color, icon: Icon, tabs }: { name: string; color: string; icon: LucideIcon; tabs: PillarTab[] }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="sticky top-0 z-10 border-b border-secondary bg-secondary/75 backdrop-blur-md print:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto px-4 py-2.5 sm:px-8">
        <div className="flex shrink-0 items-center gap-2 pr-2">
          <span className="flex size-7 items-center justify-center rounded-lg [&_svg]:size-4" style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
            <Icon />
          </span>
          <span className="font-display text-[15px] font-bold">{name}</span>
        </div>
        <span className="h-5 w-px shrink-0 bg-border-secondary" />
        <nav className="flex items-center gap-1">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(`${t.to}/`) || Boolean(t.also?.(pathname));
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors",
                  active ? "bg-tertiary font-medium text-primary shadow-xs" : "text-tertiary hover:bg-secondary hover:text-primary",
                )}
              >
                {t.icon ? <t.icon className="size-3.5" style={active ? { color } : undefined} /> : null}
                {t.label}
                {t.count ? (
                  <span className="rounded-full px-1.5 font-mono text-[10px] leading-4" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, color }}>
                    {t.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
