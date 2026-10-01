import { cn } from "@hephaestus/ui";
import { Outlet } from "@tanstack/react-router";
import { CalendarDays, LayoutGrid, Network, Rocket, Shapes, Users } from "lucide-react";
import { PillarNav } from "../../components/pillar-nav.tsx";
import { useHome } from "../../lib/home.ts";

export function PeopleLayout() {
  const { data } = useHome();
  const approvals = data?.attention.find((a) => a.kind === "leave")?.count;
  const steps = data?.attention.find((a) => a.kind === "onboarding")?.count;
  return (
    <div>
      <PillarNav
        name="People"
        color="var(--people)"
        icon={Users}
        tabs={[
          { to: "/people", label: "Overview", icon: LayoutGrid, exact: true },
          // Profiles (/people/<uuid>) belong to the directory tab.
          { to: "/people/directory", label: "Directory", icon: Users, also: (p) => /^\/people\/[0-9a-f-]{36}$/.test(p) },
          { to: "/people/org-chart", label: "Org chart", icon: Network },
          { to: "/people/structure", label: "Departments and teams", icon: Shapes },
          { to: "/people/leave", label: "Leave", icon: CalendarDays, count: approvals },
          { to: "/people/onboarding", label: "Onboarding", icon: Rocket, count: steps },
        ]}
      />
      <Outlet />
    </div>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8", className)}>{children}</div>;
}
