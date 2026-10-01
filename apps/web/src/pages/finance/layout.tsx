import { can } from "@hephaestus/core";
import { Badge, Card, cn, EmptyState } from "@hephaestus/ui";
import { Outlet } from "@tanstack/react-router";
import { Banknote, Building2, FileSignature, FileText, LayoutGrid, Lock, Repeat, Settings2, Wallet } from "lucide-react";
import { PillarNav } from "../../components/pillar-nav.tsx";
import { useHome } from "../../lib/home.ts";
import { STATUS_META } from "../../lib/finance.ts";
import { useViewer } from "../../lib/viewer.ts";

export function FinanceLayout() {
  const me = useViewer();
  const { data: home } = useHome();
  const allowed = can(me.org.permissions, "invoice", "read") || can(me.org.permissions, "client", "read");

  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <Card>
          <EmptyState icon={<Lock />} title="Finance is limited to your accounts team" description="Ask an admin if you need access to invoices and payments." />
        </Card>
      </div>
    );
  }

  const overdue = home?.attention.find((a) => a.kind === "overdue_invoices")?.count;
  const drafts = home?.attention.find((a) => a.kind === "draft_invoices")?.count;
  return (
    <div>
      <PillarNav
        name="Finance"
        color="var(--finance)"
        icon={Banknote}
        tabs={[
          { to: "/finance", label: "Overview", icon: LayoutGrid, exact: true },
          { to: "/finance/invoices", label: "Invoices", icon: FileText, also: (p) => p.startsWith("/finance/new"), count: (overdue ?? 0) + (drafts ?? 0) || undefined },
          { to: "/finance/quotes", label: "Quotes", icon: FileSignature },
          { to: "/finance/clients", label: "Clients", icon: Building2 },
          { to: "/finance/payments", label: "Payments", icon: Wallet },
          { to: "/finance/retainers", label: "Retainers", icon: Repeat },
          { to: "/finance/settings", label: "Settings", icon: Settings2 },
        ]}
      />
      <Outlet />
    </div>
  );
}

export function FinanceBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8", className)}>{children}</div>;
}

export function StatusPill({ status }: { status: keyof typeof STATUS_META }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
