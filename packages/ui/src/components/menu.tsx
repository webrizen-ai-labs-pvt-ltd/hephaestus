import { DropdownMenu as Menu, Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../cn.ts";

/* Radix behaviour, Untitled UI dropdown look. */

const panel =
  "z-50 overflow-hidden rounded-lg bg-primary text-sm text-primary shadow-lg ring-1 ring-secondary_alt outline-hidden data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content sideOffset={sideOffset} className={cn(panel, "min-w-52 py-1", className)} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        "mx-1.5 flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold text-secondary outline-hidden transition-colors",
        "data-[highlighted]:bg-primary_hover data-[highlighted]:text-secondary_hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-quaternary",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-4 pt-2 pb-1 text-xs font-semibold text-tertiary", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("my-1 h-px bg-border-secondary", className)} {...props} />;
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={sideOffset} className={cn(panel, "w-64 p-1", className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}
