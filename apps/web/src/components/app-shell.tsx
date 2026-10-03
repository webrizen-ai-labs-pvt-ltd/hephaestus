import { can } from "@hephaestus/core";
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
  PageHero,
} from "@hephaestus/ui";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CalendarPlus,
  FilePlus2,
  Hash,
  ListPlus,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Sun,
  SunMoon,
  UserPlus,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { type Me, signIn, signOut } from "../lib/api.ts";
import { useChannels } from "../lib/collab.ts";
import { useHome } from "../lib/home.ts";
import { ADMIN_NAV, MAIN_NAV, type NavItem } from "../lib/nav.ts";
import { useLiveEvents } from "../lib/realtime.ts";
import { useTheme } from "../lib/theme.ts";
import { CommandPalette, useCommandPalette } from "./command-palette.tsx";
import { NotificationBell } from "./notification-bell.tsx";

function isActive(pathname: string, to: string) {
  // "/settings" is its own page; its sub-pages have their own nav items.
  return to === "/" || to === "/settings" ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

function NavLink({ item, onNavigate, badge, badgeTone }: { item: NavItem; onNavigate?: () => void; badge?: number; badgeTone?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = isActive(pathname, item.to);
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-xl px-2.5 text-[13.5px] transition-colors",
        active ? "bg-secondary font-medium text-primary shadow-xs" : "text-tertiary hover:bg-secondary/60 hover:text-primary",
      )}
    >
      <span
        className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors [&_svg]:size-4", !active && "group-hover:opacity-100")}
        style={{
          color: active ? item.color : undefined,
          background: active ? `color-mix(in srgb, ${item.color} 16%, transparent)` : "transparent",
        }}
      >
        <item.icon />
      </span>
      <span className="truncate">{item.label}</span>
      {badge ? (
        <span
          className="ml-auto min-w-5 rounded-full px-1.5 text-center font-mono text-[10.5px] leading-5"
          style={{ background: `color-mix(in srgb, ${badgeTone ?? item.color} 18%, transparent)`, color: badgeTone ?? item.color }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function ThemeSwitch() {
  const [pref, setPref] = useTheme();
  const options = [
    { key: "light", icon: Sun, label: "Light" },
    { key: "dark", icon: Moon, label: "Dark" },
    { key: "system", icon: SunMoon, label: "Match system" },
  ] as const;
  return (
    <div className="flex rounded-lg border border-secondary bg-primary p-0.5" role="radiogroup" aria-label="Theme">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={pref === o.key}
          aria-label={o.label}
          title={o.label}
          onClick={() => setPref(o.key)}
          className={cn("flex size-7 items-center justify-center rounded-md transition-colors", pref === o.key ? "bg-tertiary text-primary" : "text-tertiary hover:text-primary")}
        >
          <o.icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

function Sidebar({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const enabled = new Set(me.settings.enabledPillars);
  const { data: home } = useHome();
  const { data: chats } = useChannels();
  const unreadChats = (chats?.channels ?? []).reduce((n, c) => n + c.unread, 0);
  const badges: Record<string, { n?: number; tone?: string }> = {
    "/": { n: home?.counts.attention, tone: "var(--color-brand-600)" },
    "/work": { n: home?.counts.myOpenTasks },
    "/collab": { n: unreadChats },
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary-solid text-primary_on-brand shadow-xs">
          <Logo className="size-6" />
        </span>
        <div className="leading-tight">
          <div className="font-display text-[16px] font-bold tracking-tight">Hephaestus</div>
          <div className="text-[10.5px] text-tertiary">by Webrizen</div>
        </div>
      </div>

      <div className="px-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-secondary bg-primary px-2.5 py-2 shadow-xs">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--color-brand-600),var(--molten))] font-display text-sm font-bold text-white">
            {me.org.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{me.org.name}</div>
            <div className="truncate text-[11px] capitalize text-tertiary">{me.org.roles.join(", ") || "member"}</div>
          </div>
          {me.edition === "cloud" ? (
            <button
              type="button"
              title="Switch organization"
              aria-label="Switch organization"
              onClick={() => signIn("/")}
              className="rounded-md p-1 text-tertiary hover:bg-secondary hover:text-primary"
            >
              <ArrowLeftRight className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3 pt-4">
        <div className="eyebrow px-2.5 pb-1.5">Workspace</div>
        {MAIN_NAV.filter((n) => !n.pillar || enabled.has(n.pillar)).map((n) => (
          <NavLink key={n.to} item={n} onNavigate={onNavigate} badge={badges[n.to]?.n} badgeTone={badges[n.to]?.tone} />
        ))}
        <div className="eyebrow px-2.5 pb-1.5 pt-6">Admin</div>
        {ADMIN_NAV.map((n) => (
          <NavLink key={n.to} item={n} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="border-t border-secondary p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-1">
          <Avatar name={me.user.name} src={me.user.image} className="size-8" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-medium">{me.user.name}</div>
            <div className="truncate text-[11px] text-tertiary">{me.edition === "cloud" ? "Cloud" : "Offline edition"}</div>
          </div>
          <ThemeSwitch />
        </div>
      </div>
    </div>
  );
}

/** "New …" menu in the header: the most common things to create, wherever you are. */
function CreateMenu({ me }: { me: Me }) {
  const navigate = useNavigate();
  const p = me.org.permissions;
  const items = [
    { show: can(p, "task", "create"), icon: ListPlus, label: "Task", hint: "Add to My work", go: () => navigate({ to: "/work" }) },
    { show: can(p, "invoice", "create"), icon: FilePlus2, label: "Invoice", hint: "GST invoice", go: () => navigate({ to: "/finance/new", search: { kind: "invoice" } }) },
    { show: can(p, "leave", "request"), icon: CalendarPlus, label: "Leave request", hint: "Time off", go: () => navigate({ to: "/people/leave" }) },
    { show: can(p, "employee", "create"), icon: UserPlus, label: "Employee", hint: "Add to directory", go: () => navigate({ to: "/people/directory", search: { add: true } }) },
    { show: can(p, "channel", "create"), icon: Hash, label: "Channel", hint: "Start a conversation", go: () => navigate({ to: "/collab" }) },
  ].filter((i) => i.show);
  if (!items.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="primary" size="sm" className="h-9 gap-1.5 rounded-lg px-3">
          <Plus /> <span className="hidden sm:inline">New</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        {items.map((i) => (
          <DropdownMenuItem key={i.label} onSelect={i.go}>
            <i.icon />
            <span className="flex-1">{i.label}</span>
            <span className="text-xs text-tertiary">{i.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ me }: { me: Me }) {
  useLiveEvents();
  const [paletteOpen, setPaletteOpen] = useCommandPalette();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-[248px] shrink-0 border-r border-secondary bg-sidebar/80 backdrop-blur lg:block">
        <Sidebar me={me} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-overlay/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 max-w-[85vw] border-r border-secondary bg-sidebar shadow-lg">
            <Sidebar me={me} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-secondary bg-secondary/70 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            {mobileOpen ? <X /> : <Menu />}
          </Button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 w-full min-w-0 max-w-md items-center gap-2.5 rounded-lg border border-secondary bg-primary px-3 text-sm text-tertiary shadow-xs transition-colors hover:border-primary"
          >
            <Search className="size-4" />
            <span className="flex-1 truncate text-left">Search people, projects, invoices…</span>
            <span className="hidden gap-1 sm:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <CreateMenu me={me} />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="ml-1 rounded-full ring-2 ring-transparent transition hover:ring-primary" aria-label="Account menu">
                  <Avatar name={me.user.name} src={me.user.image} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <div className="truncate text-sm font-medium text-primary">{me.user.name}</div>
                  <div className="truncate">{me.user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings/preferences">Preferences</Link>
                </DropdownMenuItem>
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

/** Kept for pages not yet moved to PageHero. */
/** Page title block. The eyebrow and accent colour come from the section you're in. */
export function PageHeader({ title, description, actions, eyebrow, children }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; children?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = [...MAIN_NAV.slice(1), ...ADMIN_NAV].find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  const isAdmin = section ? ADMIN_NAV.includes(section) : false;
  return (
    <PageHero eyebrow={eyebrow ?? (isAdmin ? "Admin" : section?.label)} tone={isAdmin ? "var(--color-brand-600)" : section?.color} title={title} summary={description} actions={actions}>
      {children}
    </PageHero>
  );
}
