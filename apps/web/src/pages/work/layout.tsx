import { cn } from "@hephaestus/ui";
import { Outlet, useNavigate, useSearch } from "@tanstack/react-router";
import { CircleCheckBig, FolderKanban, Gauge, Target } from "lucide-react";
import { PillarNav } from "../../components/pillar-nav.tsx";
import { useHome } from "../../lib/home.ts";
import { TaskSheet } from "./task-sheet.tsx";

/** Opens a task in the side panel from anywhere in Work. */
export function useOpenTask() {
  const navigate = useNavigate();
  return (id: string | undefined) =>
    navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, task: id }), replace: !id } as never);
}

export function WorkLayout() {
  const search = useSearch({ strict: false }) as { task?: string };
  const openTask = useOpenTask();
  const { data } = useHome();

  return (
    <div>
      <PillarNav
        name="Work"
        color="var(--work)"
        icon={FolderKanban}
        tabs={[
          { to: "/work", label: "My work", icon: CircleCheckBig, exact: true, count: data ? data.day.buckets.overdue + data.day.buckets.today : undefined },
          { to: "/work/projects", label: "Projects", icon: FolderKanban },
          { to: "/work/goals", label: "Goals", icon: Target },
          { to: "/work/workload", label: "Workload", icon: Gauge },
        ]}
      />
      <Outlet />
      <TaskSheet id={search.task} onOpenChange={openTask} />
    </div>
  );
}

export function WorkBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8", className)}>{children}</div>;
}
