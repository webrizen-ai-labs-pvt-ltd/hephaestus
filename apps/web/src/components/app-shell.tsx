import { can } from "@hephaestus/core";
import {
  Avatar,
  Badge,
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

function NavLink({ item, onNavigate, badge, badgeTone }: { item: NavItem; onNavigate?: () => void; badge?: number; badgeTone?: "brand" }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = isActive(pathname, item.to);
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-md px-3 outline-focus-ring transition duration-100 ease-linear select-none focus-visible:outline-2 focus-visible:outline-offset-2",
        active ? "bg-secondary hover:bg-secondary_hover" : "hover:bg-primary_hover",
      )}
    >
      <item.icon
        aria-hidden
        className={cn("size-5 shrink-0 transition-colors", active ? "" : "text-fg-quaternary group-hover:text-fg-quaternary_hover")}
        style={active ? { color: item.color } : undefined}
      />
      <span className={cn("flex-1 truncate text-sm font-semibold", active ? "text-secondary_hover" : "text-secondary group-hover:text-secondary_hover")}>{item.label}</span>
      {badge ? (
        <Badge tone={badgeTone ? "brand" : "neutral"} pill>
          {badge > 99 ? "99+" : badge}
        </Badge>
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
    <div className="flex rounded-lg bg-secondary p-0.5 ring-1 ring-secondary ring-inset" role="radiogroup" aria-label="Theme">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={pref === o.key}
          aria-label={o.label}
          title={o.label}
          onClick={() => setPref(o.key)}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition",
            pref === o.key ? "bg-primary text-fg-secondary shadow-xs ring-1 ring-primary ring-inset" : "text-fg-quaternary hover:text-fg-quaternary_hover",
          )}
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
  const badges: Record<string, { n?: number; tone?: "brand" }> = {
    "/": { n: home?.counts.attention, tone: "brand" as const },
    "/work": { n: home?.counts.myOpenTasks },
    "/collab": { n: unreadChats },
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-solid text-white shadow-xs-skeuomorphic ring-1 ring-transparent ring-inset">
          <Logo className="size-6" />
        </span>
        <div className="leading-tight">
          <div className="font-display text-md font-bold tracking-tight text-primary">Hephaestus</div>
          <div className="text-xs text-quaternary">by Webrizen</div>
        </div>
      </div>

      <div className="px-3">
        <div className="flex items-center gap-3 rounded-xl bg-primary p-2.5 shadow-xs ring-1 ring-secondary ring-inset">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--color-brand-500),var(--color-brand-700))] font-display text-sm font-bold text-white shadow-xs-skeuomorphic">
            {me.org.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-primary">{me.org.name}</div>
            <div className="truncate text-xs capitalize text-tertiary">{me.org.roles.join(", ") || "member"}</div>
          </div>
          {me.edition === "cloud" ? (
            <button
              type="button"
              title="Switch organization"
              aria-label="Switch organization"
              onClick={() => signIn("/")}
              className="flex size-8 items-center justify-center rounded-md text-fg-quaternary transition hover:bg-primary_hover hover:text-fg-quaternary_hover"
            >
              <ArrowLeftRight className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3 pt-4">
        <div className="px-3 pb-2 text-xs font-semibold text-quaternary">Workspace</div>
        {MAIN_NAV.filter((n) => !n.pillar || enabled.has(n.pillar)).map((n) => (
          <NavLink key={n.to} item={n} onNavigate={onNavigate} badge={badges[n.to]?.n} badgeTone={badges[n.to]?.tone} />
        ))}
        <div className="px-3 pb-2 pt-6 text-xs font-semibold text-quaternary">Admin</div>
        {ADMIN_NAV.map((n) => (
          <NavLink key={n.to} item={n} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="p-3">
        <div className="flex items-center gap-3 rounded-xl bg-primary p-2.5 shadow-xs ring-1 ring-secondary ring-inset">
          <Avatar name={me.user.name} src={me.user.image} className="size-9" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold text-primary">{me.user.name}</div>
            <div className="truncate text-xs text-tertiary">{me.edition === "cloud" ? "Cloud" : "Offline edition"}</div>
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
      <aside className="hidden w-[272px] shrink-0 border-r border-secondary bg-primary lg:block">
        <Sidebar me={me} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-overlay/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 max-w-[85vw] border-r border-secondary bg-primary shadow-xl">
            <Sidebar me={me} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-secondary bg-primary px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            {mobileOpen ? <X /> : <Menu />}
          </Button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-10 w-full min-w-0 max-w-md items-center gap-2 rounded-lg bg-primary px-3.5 text-md text-placeholder shadow-xs ring-1 ring-primary ring-inset transition hover:ring-border-primary focus-visible:ring-2 focus-visible:ring-brand outline-hidden"
          >
            <Search className="size-5 text-fg-quaternary" />
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
