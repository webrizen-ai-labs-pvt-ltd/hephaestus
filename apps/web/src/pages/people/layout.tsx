import { cn } from "@hephaestus/ui";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";

const TABS = [
  { to: "/people", label: "Overview", exact: true },
  { to: "/people/directory", label: "Directory" },
  { to: "/people/org-chart", label: "Org chart" },
  { to: "/people/structure", label: "Departments and teams" },
  { to: "/people/leave", label: "Leave" },
  { to: "/people/onboarding", label: "Onboarding" },
] as const;

export function PeopleLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Profiles (/people/<uuid>) belong to the directory tab.
  const isProfile = /^\/people\/[0-9a-f-]{36}$/.test(pathname);

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-end gap-6 overflow-x-auto px-6 sm:px-8">
          <div className="flex items-center gap-2 py-3 pr-2">
            <span className="size-2 rounded-full bg-people" />
            <span className="font-display text-sm font-bold">People</span>
          </div>
          {TABS.map((t) => {
            const active =
              "exact" in t ? pathname === t.to : pathname.startsWith(t.to) || (t.to === "/people/directory" && isProfile);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "shrink-0 border-b-2 py-3 text-sm transition-colors",
                  active ? "border-people font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <Outlet />
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-6xl space-y-6 p-6 sm:p-8", className)}>{children}</div>;
}
