import { getLocalTimeZone, parseDate } from "@internationalized/date";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  Children,
  type ChangeEvent,
  type ComponentProps,
  type FC,
  type ReactElement,
  type ReactNode,
  isValidElement,
  useId,
  useMemo,
  useState,
} from "react";
import {
  Button as AriaButton,
  DatePicker as AriaDatePicker,
  Dialog as AriaDialog,
  Group as AriaGroup,
  ListBox as AriaListBox,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
} from "react-aria-components";
import { UNSAFE_PortalProvider, useDateFormatter } from "react-aria";
import { ChevronDown } from "@untitledui/icons";
import { cn } from "../cn.ts";
import { Calendar } from "../untitled/components/application/date-picker/calendar.tsx";
import { Popover as SelectPopover } from "../untitled/components/base/select/popover.tsx";
import { SelectItem } from "../untitled/components/base/select/select-item.tsx";
import { SelectContext } from "../untitled/components/base/select/select-shared.tsx";
import { FeaturedIcon } from "../untitled/components/foundations/featured-icon/featured-icon.tsx";
import { BackgroundPattern } from "../untitled/components/shared-assets/background-patterns/index.tsx";
import { KpiTile } from "./data.tsx";

/* ---------------- Text fields ---------------- */

/** Untitled UI field surface: soft shadow, inset ring, brand ring on focus. */
export const fieldClass =
  "w-full rounded-lg bg-primary text-sm text-primary shadow-xs ring-1 ring-primary ring-inset outline-hidden transition-shadow duration-100 ease-linear placeholder:text-placeholder focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-error_subtle aria-invalid:focus-visible:ring-error";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldClass, "min-h-20 px-3 py-2", className)} {...props} />;
}

/* ---------------- Select ---------------- */

type OptionLike = { value: string; label: ReactNode; textValue: string; disabled?: boolean };
const EMPTY = "__empty__";

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

/** Read <option> children (also inside fragments and arrays) into items. */
function readOptions(children: ReactNode): OptionLike[] {
  const out: OptionLike[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    if (el.type === "option") {
      const value = el.props.value === undefined ? textOf(el.props.children) : String(el.props.value);
      out.push({ value, label: el.props.children, textValue: textOf(el.props.children), disabled: el.props.disabled });
    } else if (el.props.children) {
      out.push(...readOptions(el.props.children));
    }
  });
  return out;
}

export interface SelectProps {
  value?: string | number;
  defaultValue?: string;
  /** Native-style handler, so existing `e.target.value` code keeps working. */
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  size?: "xs" | "sm" | "md";
  /** ghost: no ring until hover (inline properties); dashed: an "add…" picker. */
  variant?: "default" | "ghost" | "dashed";
  icon?: FC<{ className?: string }>;
  title?: string;
  "aria-label"?: string;
}

/**
 * Untitled UI select (React Aria listbox in a popover) that accepts plain
 * <option> children, so forms read like native selects.
 */
export function Select({
  value,
  defaultValue,
  onChange,
  onValueChange,
  children,
  className,
  placeholder = "Select",
  disabled,
  required,
  name,
  id,
  size = "sm",
  icon: Icon,
  variant = "default",
  title,
  "aria-label": ariaLabel,
}: SelectProps) {
  const options = useMemo(() => readOptions(children), [children]);
  const keyOf = (v: string | number) => (String(v) === "" ? EMPTY : String(v));
  const selectedKey = value === undefined ? undefined : keyOf(value);

  return (
    <SelectContext.Provider value={{ size: size === "md" ? "md" : "sm" }}>
      <AriaSelect
        id={id}
        name={name}
        aria-label={ariaLabel ?? placeholder}
        isDisabled={disabled}
        isRequired={required}
        placeholder={placeholder}
        {...(selectedKey === undefined ? {} : { selectedKey })}
        defaultSelectedKey={defaultValue === undefined ? undefined : keyOf(defaultValue)}
        onSelectionChange={(key) => {
          const next = key == null || key === EMPTY ? "" : String(key);
          onValueChange?.(next);
          onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } } as unknown as ChangeEvent<HTMLSelectElement>);
        }}
        className={cn("flex min-w-0 flex-col", className)}
        {...(title ? { "data-title": title } : {})}
      >
        {(state) => (
          <>
            <AriaButton
              {...(title ? { "aria-description": title } : {})}
              className={cn(
                "relative flex w-full cursor-pointer items-center gap-2 rounded-lg text-left outline-hidden transition duration-100 ease-linear ring-inset",
                variant === "default" && "bg-primary shadow-xs ring-1 ring-primary",
                variant === "ghost" && "bg-transparent hover:bg-primary_hover",
                variant === "dashed" && "border border-dashed border-primary bg-transparent text-tertiary hover:bg-primary_hover",
                size === "xs" ? "h-8 px-2.5 text-sm" : size === "sm" ? "h-9 px-3 text-sm" : "h-10 px-3.5 text-md",
                (state.isFocusVisible || state.isOpen) && "ring-2 ring-brand",
                state.isDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              {Icon ? <Icon className="size-4 shrink-0 text-fg-quaternary" /> : null}
              <AriaSelectValue className="min-w-0 flex-1 truncate">
                {({ selectedText, isPlaceholder }) =>
                  isPlaceholder ? (
                    <span className="text-placeholder">{placeholder}</span>
                  ) : (
                    <span className="font-medium text-primary">{options.find((o) => keyOf(o.value) === selectedKey)?.label ?? selectedText}</span>
                  )
                }
              </AriaSelectValue>
              <ChevronDown aria-hidden className={cn("size-4 shrink-0 stroke-[2.25px] text-fg-quaternary transition-transform", state.isOpen && "rotate-180")} />
            </AriaButton>
            <SelectPopover size={size === "md" ? "lg" : "md"} className="min-w-48">
              <AriaListBox className="size-full outline-hidden">
                {options.map((o) => (
                  <SelectItem key={keyOf(o.value)} id={keyOf(o.value)} label={o.textValue || " "} isDisabled={o.disabled} textValue={o.textValue}>
                    {o.label}
                  </SelectItem>
                ))}
              </AriaListBox>
            </SelectPopover>
          </>
        )}
      </AriaSelect>
    </SelectContext.Provider>
  );
}

/* ---------------- Date ---------------- */

export interface DateInputProps {
  /** ISO date (YYYY-MM-DD) or "" for none. */
  value: string | null | undefined;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Show a clear button when a date is set. */
  clearable?: boolean;
  size?: "xs" | "sm";
  /** ghost: no ring until hover (inline properties). */
  variant?: "default" | "ghost";
  /** Show the date in the error colour (e.g. overdue). */
  danger?: boolean;
  className?: string;
  "aria-label"?: string;
}

const safeParse = (v: string | null | undefined) => {
  if (!v) return null;
  try {
    return parseDate(v.slice(0, 10));
  } catch {
    return null;
  }
};

/** Untitled UI calendar in a popover, behind a field-style trigger. Values are plain ISO date strings. */
export function DateInput({
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
  disabled,
  clearable = true,
  size = "sm",
  variant = "default",
  danger,
  className,
  "aria-label": ariaLabel,
}: DateInputProps) {
  const formatter = useDateFormatter({ day: "numeric", month: "short", year: "numeric" });
  const parsed = safeParse(value);
  return (
    <AriaDatePicker
      aria-label={ariaLabel ?? placeholder}
      value={parsed}
      minValue={safeParse(min) ?? undefined}
      maxValue={safeParse(max) ?? undefined}
      isDisabled={disabled}
      onChange={(d) => onChange(d ? d.toString() : "")}
      className={cn("relative min-w-0", className)}
    >
      <AriaGroup className="flex">
        <AriaButton
          className={cn(
            fieldClass,
            "flex cursor-pointer items-center gap-2 text-left data-[pressed]:ring-2 data-[pressed]:ring-brand data-[focus-visible]:ring-2 data-[focus-visible]:ring-brand",
            size === "xs" ? "h-8 px-2.5" : "h-9 px-3",
            variant === "ghost" && "bg-transparent shadow-none ring-0 hover:bg-primary_hover",
            danger && "text-error-primary",
            clearable && parsed && "pr-8",
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-fg-quaternary" />
          {parsed ? (
            <span className="truncate font-medium">{formatter.format(parsed.toDate(getLocalTimeZone()))}</span>
          ) : (
            <span className="truncate text-placeholder">{placeholder}</span>
          )}
        </AriaButton>
      </AriaGroup>
      {clearable && parsed && !disabled ? (
        <button
          type="button"
          aria-label="Clear date"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-quaternary hover:bg-primary_hover hover:text-fg-quaternary_hover"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
      <AriaPopover
        offset={6}
        placement="bottom start"
        className={({ isEntering, isExiting }) =>
          cn("will-change-transform", isEntering && "duration-150 ease-out animate-in fade-in", isExiting && "duration-100 ease-in animate-out fade-out")
        }
      >
        <AriaDialog aria-label={ariaLabel ?? "Choose a date"} className="rounded-2xl bg-primary px-5 py-4 shadow-xl ring ring-secondary_alt outline-hidden">
          <Calendar />
        </AriaDialog>
      </AriaPopover>
    </AriaDatePicker>
  );
}

/* ---------------- Field ---------------- */

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
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-secondary">{label}</span>
      {children}
      {error ? <span className="text-sm text-error-primary">{error}</span> : hint ? <span className="text-sm text-tertiary">{hint}</span> : null}
    </label>
  );
}

/* ---------------- Dialog ---------------- */

/**
 * Render React Aria overlays (select lists, calendars) inside a Radix dialog or sheet,
 * so the dialog doesn't treat them as outside clicks and its focus trap keeps working.
 */
function OverlayHost({ host, children }: { host: HTMLElement | null; children: ReactNode }) {
  return <UNSAFE_PortalProvider getContainer={() => host ?? document.body}>{children}</UNSAFE_PortalProvider>;
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type IconColor = "brand" | "gray" | "success" | "warning" | "error";

/** Untitled UI modal: blurred overlay, rounded card, optional featured icon, footer actions. */
export function DialogContent({
  title,
  description,
  children,
  className,
  footer,
  icon,
  iconColor = "brand",
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  icon?: FC<{ className?: string }>;
  iconColor?: IconColor;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay/70 backdrop-blur-[6px] data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
      <DialogPrimitive.Content
        ref={setHost}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-primary shadow-xl outline-hidden",
          "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95",
          className,
        )}
      >
        <div className="relative flex items-start gap-4 px-6 pt-6 pb-1">
          {icon ? (
            <div className="relative shrink-0">
              <BackgroundPattern pattern="circle" size="sm" className="absolute top-1/2 left-1/2 -z-0 hidden -translate-x-1/2 -translate-y-1/2 text-border-secondary sm:block" />
              <FeaturedIcon color={iconColor} theme="light" size="lg" icon={icon} className="relative" />
            </div>
          ) : null}
          <div className="relative min-w-0 flex-1 pt-0.5">
            <DialogPrimitive.Title className="text-lg font-semibold text-primary">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-tertiary">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="relative -mt-1 -mr-2 flex size-9 items-center justify-center rounded-lg text-fg-quaternary transition hover:bg-primary_hover hover:text-fg-quaternary_hover"
            aria-label="Close"
          >
            <X className="size-5" />
          </DialogPrimitive.Close>
        </div>
        <OverlayHost host={host}>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer ? <div className="flex flex-col-reverse gap-3 border-t border-secondary px-6 py-4 sm:flex-row sm:justify-end">{footer}</div> : null}
        </OverlayHost>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ---------------- Empty state ---------------- */

/** Untitled UI empty state: featured icon on a soft circle pattern, title, text, actions. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  color = "gray",
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  color?: IconColor;
}) {
  const id = useId();
  return (
    <div className="relative flex flex-col items-center overflow-hidden px-6 py-12 text-center" aria-labelledby={id}>
      {icon ? (
        <div className="relative mb-5">
          <BackgroundPattern pattern="circle" size="md" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-border-secondary" />
          <FeaturedIcon color={color} theme="modern" size="lg" icon={<span className="flex [&_svg]:size-6">{icon}</span>} className="relative" />
        </div>
      ) : null}
      <h3 id={id} className="relative text-md font-semibold text-primary">
        {title}
      </h3>
      {description ? <p className="relative mt-1 max-w-sm text-sm text-tertiary">{description}</p> : null}
      {action ? <div className="relative mt-6 flex gap-3">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string; icon?: ReactNode }) {
  // Tone arrives as a text-* class (e.g. "text-people"); map it to the matching colour.
  const colour = tone?.startsWith("text-") ? `var(--${tone.slice(5)})` : (tone ?? "var(--color-text-tertiary)");
  return <KpiTile label={label} value={value} hint={hint} icon={icon} tone={colour} />;
}

/* ---------------- Sheet ---------------- */

/** Untitled UI slideout: a panel from the right (task details, filters). */
export function SheetContent({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay/70 backdrop-blur-[6px] data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
      <DialogPrimitive.Content
        ref={setHost}
        aria-describedby={undefined}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col bg-primary shadow-xl ring-1 ring-secondary_alt outline-hidden sm:inset-y-2 sm:right-2 sm:rounded-xl",
          "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
          className,
        )}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <OverlayHost host={host}>{children}</OverlayHost>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
