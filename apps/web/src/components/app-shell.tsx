import {
  Avatar,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Logo,
} from "@hephaestus/ui";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowLeftRight, Bell, LogOut, Menu, Moon, Search, Sun, SunMoon, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { type Me, signIn, signOut } from "../lib/api.ts";
import { ADMIN_NAV, MAIN_NAV, type NavItem } from "../lib/nav.ts";
import { useTheme } from "../lib/theme.ts";
import { CommandPalette, useCommandPalette } from "./command-palette.tsx";

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = item.to === "/" ? pathname === "/" : pathname === item.to || pathname.startsWith(`${item.to}/`);
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
        active ? "bg-surface-2 font-medium text-foreground" : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground",
      )}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" /> : null}
      <item.icon className={cn("size-4 shrink-0", item.tone ?? (active ? "text-foreground" : ""))} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Sidebar({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const enabled = new Set(me.settings.enabledPillars);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <Logo className="size-7 text-foreground" />
        <span className="font-display text-[17px] font-bold tracking-tight">Hephaestus</span>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary font-display text-xs font-bold text-primary-foreground">
            {me.org.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{me.org.name}</div>
            <div className="truncate text-xs text-muted-foreground">{me.org.roles.join(", ") || "member"}</div>
          </div>
          {me.edition === "cloud" ? (
            <button
              type="button"
              title="Switch organization"
              onClick={() => signIn("/", "select_account")}
              className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <ArrowLeftRight className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {MAIN_NAV.filter((n) => !n.pillar || enabled.has(n.pillar)).map((n) => (
          <NavLink key={n.to} item={n} onNavigate={onNavigate} />
        ))}
        <div className="px-3 pb-1 pt-5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Admin</div>
        {ADMIN_NAV.map((n) => (
          <NavLink key={n.to} item={n} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
        {me.edition === "cloud" ? "Cloud" : "Offline edition"} · Webrizen AI Labs
      </div>
    </div>
  );
}

function ThemeMenuItems() {
  const [pref, setPref] = useTheme();
  const options = [
    { key: "dark", label: "Dark", icon: Moon },
    { key: "light", label: "Light", icon: Sun },
    { key: "system", label: "Match system", icon: SunMoon },
  ] as const;
  return options.map((o) => (
    <DropdownMenuItem key={o.key} onSelect={() => setPref(o.key)}>
      <o.icon />
      {o.label}
      {pref === o.key ? <span className="ml-auto size-1.5 rounded-full bg-primary" /> : null}
    </DropdownMenuItem>
  ));
}

export function AppShell({ me }: { me: Me }) {
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar lg:block">
        <Sidebar me={me} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-obsidian/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 max-w-[85vw] border-r border-border bg-sidebar">
            <Sidebar me={me} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            {mobileOpen ? <X /> : <Menu />}
          </Button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted-foreground hover:border-input"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Search or jump to…</span>
            <span className="hidden gap-1 sm:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="rounded-full" aria-label="Account menu">
                  <Avatar name={me.user.name} src={me.user.image} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <div className="truncate text-sm font-medium text-foreground">{me.user.name}</div>
                  <div className="truncate">{me.user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ThemeMenuItems />
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
