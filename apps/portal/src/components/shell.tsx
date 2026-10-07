import { Avatar, Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Logo, Skeleton } from "@operant/ui";
import { Link, Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { api, useAction, useMe, useOrgPage } from "../lib/api.ts";

export const useSlug = () => (useParams({ strict: false }) as { slug: string }).slug;

/** The organization's logo, or its initials on a tinted square. */
export function OrgMark({ name, logo, className }: { name: string; logo: string | null; className?: string }) {
  return logo ? (
    <img src={logo} alt="" className={cn("size-10 rounded-xl object-cover", className)} />
  ) : (
    <span className={cn("flex size-10 items-center justify-center rounded-xl bg-brand-solid text-sm font-bold text-white", className)}>
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}

const NAV = [
  { to: "/$slug", label: "Home", exact: true },
  { to: "/$slug/services", label: "Services" },
  { to: "/$slug/documents", label: "Documents" },
  { to: "/$slug/billing", label: "Billing" },
] as const;

/** Header, navigation and footer for one organization's portal. */
export function OrgShell() {
  const slug = useSlug();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: page, error } = useOrgPage(slug);
  const { data: me } = useMe(slug);
  const signOut = useAction(() => api(`portal/orgs/${slug}/auth/sign-out`, { method: "POST" }), { onSuccess: () => navigate({ to: "/$slug", params: { slug } }) });

  if (error) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">This portal doesn't exist</h1>
        <p className="mt-2 text-sm text-tertiary">Check the link, or find the firm in the directory.</p>
        <Button className="mt-6" asChild>
          <Link to="/">Browse firms</Link>
        </Button>
      </Centered>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-secondary">
      <header className="sticky top-0 z-30 border-b border-secondary bg-primary/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/$slug" params={{ slug }} className="flex min-w-0 items-center gap-3">
            {page ? <OrgMark name={page.org.name} logo={page.org.logo} className="size-9" /> : <Skeleton className="size-9 rounded-xl" />}
            <span className="truncate font-semibold">{page?.org.name ?? ""}</span>
          </Link>
          {me ? (
            <nav className="ml-6 hidden items-center gap-1 md:flex">
              {NAV.map((n) => {
                const href = n.to.replace("$slug", slug);
                const active = "exact" in n ? path === href : path.startsWith(href);
                return (
                  <Link key={n.to} to={n.to} params={{ slug }} className={cn("rounded-lg px-3 py-2 text-sm font-semibold text-tertiary hover:bg-secondary hover:text-secondary", active && "bg-secondary text-primary")}>
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
          <div className="ml-auto">
            {me ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-secondary">
                    <Avatar name={me.user.name ?? me.user.email} className="size-8" />
                    <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{me.user.name ?? me.user.email}</span>
                    <ChevronDown className="size-4 text-quaternary" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>
                    <div className="truncate text-sm font-semibold text-primary">{me.user.name ?? "Your account"}</div>
                    <div className="truncate text-xs font-normal text-tertiary">{me.user.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {NAV.slice(1).map((n) => (
                    <DropdownMenuItem key={n.to} className="md:hidden" onSelect={() => navigate({ to: n.to, params: { slug } })}>
                      {n.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onSelect={() => navigate({ to: "/$slug/account", params: { slug } })}>
                    <UserRound /> Account and billing details
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => signOut.mutate(undefined)}>
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : me === null ? (
              <Button variant="primary" asChild>
                <Link to="/$slug/sign-in" params={{ slug }}>
                  Sign in
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-secondary bg-primary">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-5 text-xs text-tertiary sm:px-6">
          <span className="font-medium text-secondary">{page?.org.legalName ?? page?.org.name}</span>
          {page?.org.email ? <a href={`mailto:${page.org.email}`}>{page.org.email}</a> : null}
          {page?.org.phone ? <span>{page.org.phone}</span> : null}
          <Link to="/" className="ml-auto flex items-center gap-1.5 hover:text-secondary">
            <Logo className="size-3.5" /> Client portal by Operant
          </Link>
        </div>
      </footer>
    </div>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <div className="max-w-md text-center">{children}</div>
    </div>
  );
}

/** Pages that need a signed-in client: show sign-in instead, and come back afterwards. */
export function SignedIn({ children }: { children: ReactNode }) {
  const slug = useSlug();
  const { data: me, isLoading } = useMe(slug);
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (!me) {
    return (
      <Centered>
        <h1 className="text-2xl font-bold">Sign in to continue</h1>
        <p className="mt-2 text-sm text-tertiary">We'll email you a code. No password needed.</p>
        <Button variant="primary" className="mt-6" asChild>
          <Link to="/$slug/sign-in" params={{ slug }} search={{ next: path }}>
            Sign in with email
          </Link>
        </Button>
      </Centered>
    );
  }
  return <>{children}</>;
}

export function PageTitle({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6">
      {back}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-display-xs font-semibold text-primary">{title}</h1>
          {description ? <p className="mt-1 text-md text-tertiary">{description}</p> : null}
        </div>
        {actions}
      </div>
    </div>
  );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-secondary bg-primary p-5 shadow-xs sm:p-6", className)}>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="flex-1 text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
