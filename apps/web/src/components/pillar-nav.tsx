import { Badge, cn } from "@hephaestus/ui";
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

/** The sticky section bar under the header: pillar name, then Untitled UI underline tabs. */
export function PillarNav({ name, color, icon: Icon, tabs }: { name: string; color: string; icon: LucideIcon; tabs: PillarTab[] }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="sticky top-0 z-10 border-b border-secondary bg-primary print:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-5 overflow-x-auto px-4 sm:px-8">
        <div className="flex shrink-0 items-center gap-2.5 py-3">
          <span
            className="flex size-8 items-center justify-center rounded-lg bg-primary shadow-xs-skeuomorphic ring-1 ring-primary ring-inset [&_svg]:size-4"
            style={{ color }}
          >
            <Icon />
          </span>
          <span className="font-display text-md font-bold text-primary">{name}</span>
        </div>
        <span className="h-6 w-px shrink-0 bg-border-secondary" />
        <nav className="flex items-center gap-5 self-stretch" aria-label={`${name} sections`}>
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(`${t.to}/`) || Boolean(t.also?.(pathname));
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-0.5 text-sm font-semibold whitespace-nowrap outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:-outline-offset-2",
                  active ? "border-fg-brand-primary_alt text-brand-secondary" : "border-transparent text-quaternary hover:border-fg-brand-primary_alt hover:text-brand-secondary",
                )}
              >
                {t.icon ? <t.icon className={cn("size-4", active ? "text-fg-brand-secondary_hover" : "text-fg-quaternary")} /> : null}
                {t.label}
                {t.count ? (
                  <Badge tone={active ? "brand" : "neutral"} pill>
                    {t.count}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
