import { can } from "@operant/core";
import { Badge, Card, cn, EmptyState } from "@operant/ui";
import { Outlet } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { STATUS_META } from "../../lib/finance.ts";
import { useViewer } from "../../lib/viewer.ts";

export function FinanceLayout() {
  const me = useViewer();
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

  return (
    <div>
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
