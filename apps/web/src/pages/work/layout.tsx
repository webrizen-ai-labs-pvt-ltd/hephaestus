import { cn } from "@operant/ui";
import { Outlet, useNavigate, useSearch } from "@tanstack/react-router";
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

  return (
    <div>
      <Outlet />
      <TaskSheet id={search.task} onOpenChange={openTask} />
    </div>
  );
}

export function WorkBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8", className)}>{children}</div>;
}
