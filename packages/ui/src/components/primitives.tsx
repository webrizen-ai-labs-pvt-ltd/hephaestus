import { Avatar as AvatarPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card border border-border bg-surface", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

const tones = {
  neutral: "bg-surface-2 text-muted-foreground",
  ember: "bg-[color-mix(in_srgb,var(--work)_14%,transparent)] text-work",
  people: "bg-[color-mix(in_srgb,var(--people)_14%,transparent)] text-people",
  finance: "bg-[color-mix(in_srgb,var(--finance)_16%,transparent)] text-finance",
  collab: "bg-[color-mix(in_srgb,var(--collab)_16%,transparent)] text-collab",
  danger: "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger",
} as const;

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[11px] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <AvatarPrimitive.Root
      className={cn("relative inline-flex size-8 shrink-0 overflow-hidden rounded-full bg-surface-2", className)}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback className="flex size-full items-center justify-center font-display text-xs font-semibold text-muted-foreground">
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function Tooltip({ content, children, side = "right" }: { content: ReactNode; children: ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={8}
            className="z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

/** The Hephaestus mark, tinted with the current text color. */
export function Logo({ className, src = "/logo.png" }: { className?: string; src?: string }) {
  return (
    <span
      role="img"
      aria-label="Hephaestus"
      className={cn("inline-block size-7 bg-current", className)}
      style={{
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskSize: "170%",
        WebkitMaskSize: "170%",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
      }}
    />
  );
}
