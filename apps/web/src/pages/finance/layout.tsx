import { can } from "@hephaestus/core";
import { Badge, Card, cn, EmptyState } from "@hephaestus/ui";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { STATUS_META } from "../../lib/finance.ts";
import { useViewer } from "../../lib/viewer.ts";

const TABS = [
  { to: "/finance", label: "Overview", exact: true },
  { to: "/finance/invoices", label: "Invoices" },
  { to: "/finance/quotes", label: "Quotes" },
  { to: "/finance/clients", label: "Clients" },
  { to: "/finance/payments", label: "Payments" },
  { to: "/finance/retainers", label: "Retainers" },
  { to: "/finance/settings", label: "Settings" },
] as const;

export function FinanceLayout() {
  const me = useViewer();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
      <div className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl items-end gap-6 overflow-x-auto px-6 sm:px-8">
          <div className="flex items-center gap-2 py-3 pr-2">
            <span className="size-2 rounded-full bg-finance" />
            <span className="font-display text-sm font-bold">Finance</span>
          </div>
          {TABS.map((t) => {
            const active = "exact" in t ? pathname === t.to : pathname.startsWith(t.to) || (t.to === "/finance/invoices" && pathname.startsWith("/finance/new"));
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "shrink-0 border-b-2 py-3 text-sm transition-colors",
                  active ? "border-finance font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
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

export function FinanceBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-7xl space-y-6 p-6 sm:p-8", className)}>{children}</div>;
}

export function StatusPill({ status }: { status: keyof typeof STATUS_META }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
