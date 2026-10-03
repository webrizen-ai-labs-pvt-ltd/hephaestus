import type { FC, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Badge } from "./primitives.tsx";

export interface SegmentedItem<K extends string> {
  key: K;
  label?: ReactNode;
  icon?: FC<{ className?: string }>;
  count?: number;
  /** Accessible name for icon-only items. */
  title?: string;
}

/**
 * In-page tabs in Untitled UI's styles:
 * - underline: full-width tab set (views of one thing)
 * - pills: soft gray buttons (filters)
 * - toggle: a compact track (icon toggles such as cards/list)
 */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
  variant = "pills",
  className,
  "aria-label": ariaLabel,
}: {
  items: SegmentedItem<K>[];
  value: K;
  onChange: (key: K) => void;
  variant?: "underline" | "pills" | "toggle";
  /** @deprecated kept for older call sites */
  size?: "xs" | "sm";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex max-w-full overflow-x-auto scrollbar-hide",
        variant === "underline" && "w-full gap-4 border-b border-secondary",
        variant === "pills" && "inline-flex gap-1",
        variant === "toggle" && "inline-flex gap-0.5 rounded-lg bg-secondary_alt p-0.5 ring-1 ring-secondary ring-inset",
        className,
      )}
    >
      {items.map((it) => {
        const selected = it.key === value;
        const iconOnly = it.icon && !it.label;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={iconOnly ? (it.title ?? it.key) : undefined}
            title={it.title}
            onClick={() => onChange(it.key)}
            className={cn(
              "group flex shrink-0 items-center justify-center gap-2 text-sm font-semibold whitespace-nowrap outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:-outline-offset-2",
              variant === "underline" &&
                cn(
                  "-mb-px border-b-2 px-1 pt-1 pb-3",
                  selected ? "border-fg-brand-primary_alt text-brand-secondary" : "border-transparent text-quaternary hover:border-fg-brand-primary_alt hover:text-brand-secondary",
                ),
              variant === "pills" &&
                cn("h-9 rounded-md px-3", selected ? "bg-primary_hover text-secondary" : "text-quaternary hover:bg-primary_hover hover:text-secondary"),
              variant === "toggle" &&
                cn(
                  "h-8 rounded-md px-2.5",
                  iconOnly && "w-8 px-0",
                  selected ? "bg-primary text-secondary shadow-xs ring-1 ring-primary ring-inset" : "text-quaternary hover:text-secondary",
                ),
            )}
          >
            {it.icon ? (
              <it.icon className={cn("size-4", selected ? (variant === "underline" ? "text-fg-brand-secondary_hover" : "text-fg-secondary") : "text-fg-quaternary")} />
            ) : null}
            {it.label}
            {it.count ? (
              <Badge tone={selected ? "brand" : "neutral"} pill className="px-1.5 py-0 text-[11px]">
                {it.count}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
