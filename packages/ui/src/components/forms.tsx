import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../cn.ts";

const control =
  "w-full rounded-lg border border-input bg-surface text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none disabled:opacity-60";

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        control,
        "h-9 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pl-3 pr-9",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a39a8e' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-20 px-3 py-2", className)} {...props} />;
}

/** Label + control + hint/error, laid out consistently. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-obsidian/60 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-card border border-border bg-surface shadow-[0_24px_64px_-16px_rgb(0_0_0/0.6)]",
          className,
        )}
      >
        <div className="flex items-start gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="font-display text-lg font-bold">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div> : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon ? <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-surface-2 text-muted-foreground [&_svg]:size-6">{icon}</div> : null}
      <h3 className="text-base font-bold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon ? <span className={cn("[&_svg]:size-4", tone)}>{icon}</span> : null}
        {label}
      </div>
      <div className="mt-2 font-display text-3xl font-bold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** A panel that slides in from the right (task details, filters). */
export function SheetContent({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-obsidian/40" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-border bg-surface shadow-[-24px_0_64px_-24px_rgb(0_0_0/0.5)] outline-none",
          className,
        )}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
