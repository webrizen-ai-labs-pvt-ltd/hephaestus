import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { LogOut, Moon, Sun, SunMoon } from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "../lib/api.ts";
import { ADMIN_NAV, HELP_NAV, MAIN_NAV } from "../lib/nav.ts";
import { setTheme } from "../lib/theme.ts";

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [open, setOpen] as const;
}

const item = "flex cursor-default items-center gap-3 rounded-md px-2 py-2 text-sm [&_svg]:size-4 [&_svg]:text-tertiary";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-overlay/60 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[18vh] z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-secondary bg-primary shadow-[0_24px_64px_-16px_rgb(0_0_0/0.6)]"
    >
      <Command.Input
        placeholder="Search or jump to…"
        className="h-12 w-full border-b border-secondary bg-transparent px-4 text-sm outline-none placeholder:text-tertiary"
      />
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="px-2 py-6 text-center text-sm text-tertiary">Nothing found.</Command.Empty>
        <Command.Group heading="Go to">
          {[...MAIN_NAV, ...ADMIN_NAV, HELP_NAV].map((n) => (
            <Command.Item key={n.to} value={`${n.label} ${n.hint ?? ""}`} className={item} onSelect={() => run(() => navigate({ to: n.to }))}>
              <n.icon className={n.tone} />
              {n.label}
              {n.hint ? <span className="ml-auto text-xs text-tertiary">{n.hint}</span> : null}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Theme">
          <Command.Item className={item} onSelect={() => run(() => setTheme("dark"))}>
            <Moon /> Dark
          </Command.Item>
          <Command.Item className={item} onSelect={() => run(() => setTheme("light"))}>
            <Sun /> Light
          </Command.Item>
          <Command.Item className={item} onSelect={() => run(() => setTheme("system"))}>
            <SunMoon /> Match system
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Account">
          <Command.Item className={item} onSelect={() => run(() => void signOut())}>
            <LogOut /> Sign out
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
