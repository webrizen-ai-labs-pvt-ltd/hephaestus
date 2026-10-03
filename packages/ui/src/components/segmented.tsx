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
 * Untitled UI "button border" tabs: a tinted track with the selected item raised.
 * For in-page views and filters (not routes; those use PillarNav).
 */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
  size = "sm",
  className,
  "aria-label": ariaLabel,
}: {
  items: SegmentedItem<K>[];
  value: K;
  onChange: (key: K) => void;
  size?: "xs" | "sm";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-secondary_alt p-1 ring-1 ring-secondary ring-inset scrollbar-hide", className)}
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
              "flex shrink-0 items-center justify-center gap-1.5 rounded-md font-semibold whitespace-nowrap outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:-outline-offset-2",
              size === "xs" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
              iconOnly && (size === "xs" ? "w-7 px-0" : "w-8 px-0"),
              selected ? "bg-primary_alt text-secondary shadow-sm ring-1 ring-secondary ring-inset" : "text-quaternary hover:text-secondary",
            )}
          >
            {it.icon ? <it.icon className={cn("size-4", selected ? "text-fg-secondary" : "text-fg-quaternary")} /> : null}
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
