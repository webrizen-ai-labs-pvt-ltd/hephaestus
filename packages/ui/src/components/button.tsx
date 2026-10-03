import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../cn.ts";
import { styles } from "../untitled/components/base/buttons/button.tsx";

/*
 * Untitled UI button styles (skeuomorphic inner shadow, inner highlight on solid
 * buttons) behind our small API. `asChild` lets a router <Link> wear the button.
 */

const COLORS = {
  primary: "primary",
  secondary: "secondary",
  ghost: "tertiary",
  danger: "primary-destructive",
  "danger-outline": "secondary-destructive",
  link: "link-color",
} as const;

const SIZES = { xs: "xs", sm: "xs", md: "sm", lg: "md", icon: "sm" } as const;

// Lucide icons are plain <svg> children, so style them the way Untitled UI styles `data-icon`.
const ICON = {
  primary: "[&_svg]:text-white/70",
  secondary: "[&_svg]:text-fg-quaternary hover:[&_svg]:text-fg-quaternary_hover",
  ghost: "[&_svg]:text-fg-quaternary hover:[&_svg]:text-fg-quaternary_hover",
  danger: "[&_svg]:text-white/70",
  "danger-outline": "[&_svg]:text-fg-error-secondary",
  link: "",
} as const;

export type ButtonVariant = keyof typeof COLORS;
export type ButtonSize = keyof typeof SIZES;

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant | null;
  size?: ButtonSize | null;
  asChild?: boolean;
}

export function buttonVariants({ variant, size }: { variant?: ButtonVariant | null; size?: ButtonSize | null } = {}) {
  const v = variant ?? "secondary";
  const s = size ?? "md";
  return cn(
    styles.common.root,
    styles.sizes[SIZES[s]].root,
    styles.colors[COLORS[v]].root,
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    ICON[v],
    s === "icon" && "aspect-square p-2",
  );
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-icon-only={size === "icon" ? true : undefined} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
