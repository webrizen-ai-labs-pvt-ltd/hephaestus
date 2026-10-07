import { cn } from "@operant/ui";
import { Outlet } from "@tanstack/react-router";

export function PeopleLayout() {
  return (
    <div>
      <Outlet />
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8", className)}>{children}</div>;
}
