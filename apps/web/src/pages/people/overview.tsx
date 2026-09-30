import { Avatar, Button, Card, Stat } from "@hephaestus/ui";
import { Link } from "@tanstack/react-router";
import { CalendarOff, CheckSquare, ClipboardCheck, Sparkles, Users } from "lucide-react";
import { PageHeader } from "../../components/app-shell.tsx";
import { formatDate, plural, useBalances, useMyOnboardingItems, usePeopleSummary } from "../../lib/people.ts";
import { PageBody } from "./layout.tsx";

export function PeopleOverviewPage() {
  const { data: s } = usePeopleSummary();
  const { data: balances } = useBalances();
  const { data: myItems } = useMyOnboardingItems();
  const maxDept = Math.max(1, ...(s?.byDepartment.map((d) => d.count) ?? [1]));

  return (
    <PageBody>
      <PageHeader
        title="People"
        description="Your team at a glance."
        actions={
          <Button variant="primary" asChild>
            <Link to="/people/directory" search={{ add: true }}>
              Add employee
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Headcount" value={s?.headcount ?? "—"} icon={<Users />} tone="text-people" />
        <Stat
          label="On leave today"
          value={s?.onLeaveToday.length ?? "—"}
          icon={<CalendarOff />}
          tone="text-collab"
          hint={s?.onLeaveToday.map((p) => p.fullName.split(" ")[0]).join(", ") || "Everyone's in"}
        />
        <Stat
          label="Leave to approve"
          value={s?.pendingLeave ?? "—"}
          icon={<ClipboardCheck />}
          tone="text-work"
          hint={
            s?.pendingLeave ? (
              <Link to="/people/leave" search={{ tab: "approvals" }} className="text-accent hover:underline">
                Review requests
              </Link>
            ) : (
              "All caught up"
            )
          }
        />
        <Stat label="Onboarding" value={s?.activeOnboarding ?? "—"} icon={<Sparkles />} tone="text-finance" hint="Joiners in progress" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">By department</h2>
            <Link to="/people/structure" className="text-sm text-accent hover:underline">
              Manage
            </Link>
          </div>
          {s && s.byDepartment.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No departments yet.{" "}
              <Link to="/people/structure" className="text-accent hover:underline">
                Create your first one
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-5 space-y-3">
              {s?.byDepartment.map((d) => (
                <li key={d.id} className="grid grid-cols-[140px_1fr_32px] items-center gap-3 text-sm">
                  <span className="truncate">{d.name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(d.count / maxDept) * 100}%`, background: d.color ?? "var(--people)" }}
                    />
                  </span>
                  <span className="text-right font-mono text-xs text-muted-foreground">{d.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">My leave</h2>
            <Link to="/people/leave" className="text-sm text-accent hover:underline">
              Request leave
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {balances?.balances.map((b) => (
              <li key={b.leaveTypeId} className="flex items-center gap-3 text-sm">
                <span className="size-2.5 rounded-full" style={{ background: b.color }} />
                <span className="flex-1">{b.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {b.remaining === null ? `${b.approved} used` : `${b.remaining} of ${b.quota} left`}
                </span>
              </li>
            ))}
            {balances && balances.balances.length === 0 ? (
              <li className="text-sm text-muted-foreground">Your account isn't linked to an employee profile yet.</li>
            ) : null}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-bold">Joining this month</h2>
          <ul className="mt-4 space-y-3">
            {s?.joinersThisMonth.length === 0 ? <li className="text-sm text-muted-foreground">No new joiners this month.</li> : null}
            {s?.joinersThisMonth.map((j) => (
              <li key={j.id}>
                <Link to="/people/$id" params={{ id: j.id }} className="flex items-center gap-3 rounded-lg hover:bg-surface-2">
                  <Avatar name={j.fullName} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{j.fullName}</div>
                    <div className="truncate text-xs text-muted-foreground">{j.jobTitle ?? "—"}</div>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{formatDate(j.joinDate, { day: "numeric", month: "short" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <CheckSquare className="size-4 text-people" />
            <h2 className="text-lg font-bold">My onboarding steps</h2>
          </div>
          <ul className="mt-4 space-y-2">
            {myItems?.items.length === 0 ? <li className="text-sm text-muted-foreground">Nothing assigned to you.</li> : null}
            {myItems?.items.slice(0, 6).map((i) => (
              <li key={i.id} className="flex items-center gap-3 text-sm">
                <span className="size-1.5 rounded-full bg-people" />
                <span className="flex-1 truncate">
                  {i.title} <span className="text-muted-foreground">· {i.employeeName}</span>
                </span>
                <span className="font-mono text-xs text-muted-foreground">{formatDate(i.dueDate, { day: "numeric", month: "short" })}</span>
              </li>
            ))}
          </ul>
          {myItems && myItems.items.length > 0 ? (
            <Link to="/people/onboarding" className="mt-4 inline-block text-sm text-accent hover:underline">
              {plural(myItems.items.length, "open step")}
            </Link>
          ) : null}
        </Card>
      </div>
    </PageBody>
  );
}
