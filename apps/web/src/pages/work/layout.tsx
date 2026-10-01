import { cn } from "@hephaestus/ui";
import { Link, Outlet, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { TaskSheet } from "./task-sheet.tsx";

const TABS = [
  { to: "/work", label: "My work", exact: true },
  { to: "/work/projects", label: "Projects" },
  { to: "/work/goals", label: "Goals" },
  { to: "/work/workload", label: "Workload" },
] as const;

/** Opens a task in the side panel from anywhere in Work. */
export function useOpenTask() {
  const navigate = useNavigate();
  return (id: string | undefined) =>
    navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, task: id }), replace: !id } as never);
}

export function WorkLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useSearch({ strict: false }) as { task?: string };
  const openTask = useOpenTask();

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-end gap-6 overflow-x-auto px-6 sm:px-8">
          <div className="flex items-center gap-2 py-3 pr-2">
            <span className="size-2 rounded-full bg-work" />
            <span className="font-display text-sm font-bold">Work</span>
          </div>
          {TABS.map((t) => {
            const active = "exact" in t ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "shrink-0 border-b-2 py-3 text-sm transition-colors",
                  active ? "border-work font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <Outlet />
      <TaskSheet id={search.task} onOpenChange={openTask} />
    </div>
  );
}

export function WorkBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-7xl space-y-6 p-6 sm:p-8", className)}>{children}</div>;
}
