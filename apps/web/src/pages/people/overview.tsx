import { Avatar, Button, Em, EmptyState, KpiTile, PageHero, Panel, ProgressRing } from "@operant/ui";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, CalendarOff, CheckSquare, ClipboardCheck, PieChart, Plus, Sparkles, UserPlus, Users } from "lucide-react";
import { formatDate, plural, useBalances, useMyOnboardingItems, usePeopleSummary } from "../../lib/people.ts";
import { PageBody } from "./layout.tsx";

const short = (d: string | null) => formatDate(d, { day: "numeric", month: "short" });

export function PeopleOverviewPage() {
  const navigate = useNavigate();
  const { data: s } = usePeopleSummary();
  const { data: balances } = useBalances();
  const { data: myItems } = useMyOnboardingItems();

  const depts = s?.byDepartment ?? [];
  const placed = depts.reduce((a, d) => a + d.count, 0);
  const unplaced = Math.max(0, (s?.headcount ?? 0) - placed);
  const out = s?.onLeaveToday ?? [];

  return (
    <PageBody>
      <PageHero
        tone="var(--people)"
        title="Your team"
        summary={
          s ? (
            <>
              <Em tone="var(--people)">{plural(s.headcount, "person", "people")}</Em>
              {depts.length ? <> across {plural(depts.length, "department")}</> : null}.{" "}
              {out.length ? (
                <>
                  <Em>{out.length}</Em> out today
                </>
              ) : (
                <>Everyone's in today</>
              )}
              {s.pendingLeave ? (
                <>
                  , and <Em tone="var(--color-brand-600)">{plural(s.pendingLeave, "leave request")}</Em> waiting for approval
                </>
              ) : null}
              .
            </>
          ) : (
            " "
          )
        }
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to="/people/leave">
                <CalendarDays /> Request leave
              </Link>
            </Button>
            <Button variant="primary" asChild>
              <Link to="/people/directory" search={{ add: true }}>
                <Plus /> Add employee
              </Link>
            </Button>
          </>
        }
      />

      <div className="rise rise-1 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Headcount"
          icon={<Users />}
          tone="var(--people)"
          value={s?.headcount ?? "—"}
          hint={s?.joinersThisMonth.length ? `${plural(s.joinersThisMonth.length, "new joiner")} this month` : "No new joiners this month"}
          onClick={() => navigate({ to: "/people/directory" })}
        />
        <KpiTile
          label="Out today"
          icon={<CalendarOff />}
          tone="var(--collab)"
          value={out.length}
          hint={out.length ? out.map((p) => p.fullName.split(" ")[0]).join(", ") : "Everyone's in"}
          onClick={() => navigate({ to: "/people/leave", search: { tab: "calendar" } } as never)}
        />
        <KpiTile
          label="Leave to approve"
          icon={<ClipboardCheck />}
          tone="var(--work)"
          value={s?.pendingLeave ?? "—"}
          hint={s?.pendingLeave ? "Waiting on you" : "All caught up"}
          trend={s?.pendingLeave ? { label: "Review", good: null } : undefined}
          onClick={() => navigate({ to: "/people/leave", search: { tab: "approvals" } } as never)}
        />
        <KpiTile
          label="Onboarding"
          icon={<Sparkles />}
          tone="var(--finance)"
          value={s?.activeOnboarding ?? "—"}
          hint={s?.activeOnboarding ? "Joiners settling in" : "No one onboarding"}
          onClick={() => navigate({ to: "/people/onboarding" })}
        />
      </div>

      <div className="rise rise-2 grid gap-4 lg:grid-cols-12">
        <Panel
          title="Team makeup"
          icon={<PieChart />}
          tone="var(--people)"
          meta={depts.length ? plural(depts.length, "department") : undefined}
          action={
            <Link to="/people/structure" className="inline-flex items-center gap-1 text-brand-secondary hover:underline">
              Manage <ArrowRight className="size-3.5" />
            </Link>
          }
          className="lg:col-span-7"
        >
          {s && depts.length === 0 ? (
            <EmptyState
              icon={<PieChart />}
              title="No departments yet"
              description="Group people into departments to see how your team is shaped."
              action={
                <Button size="sm" asChild>
                  <Link to="/people/structure">Create a department</Link>
                </Button>
              }
            />
          ) : (
            <>
              {/* One stacked bar: the whole company, split by department. */}
              <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Share of people by department">
                {depts.map((d) => (
                  <span key={d.id} className="h-full first:rounded-l-full" style={{ flex: d.count, background: d.color ?? "var(--people)" }} title={`${d.name}: ${d.count}`} />
                ))}
                {unplaced ? <span className="h-full bg-tertiary" style={{ flex: unplaced }} title={`No department: ${unplaced}`} /> : null}
              </div>
              <ul className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {depts.map((d) => {
                  const pct = s?.headcount ? Math.round((d.count / s.headcount) * 100) : 0;
                  return (
                    <li key={d.id} className="flex items-center gap-3 rounded-lg border border-secondary bg-secondary/50 px-3 py-2.5">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color ?? "var(--people)" }} />
                      <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
                      <span className="font-display text-lg font-bold tabular">{d.count}</span>
                      <span className="w-9 text-right font-mono text-[11px] text-quaternary">{pct}%</span>
                    </li>
                  );
                })}
                {unplaced ? (
                  <li className="flex items-center gap-3 rounded-lg border border-dashed border-secondary px-3 py-2.5 text-tertiary">
                    <span className="size-2.5 shrink-0 rounded-full bg-tertiary" />
                    <span className="flex-1 text-sm">No department</span>
                    <span className="font-display text-lg font-bold tabular">{unplaced}</span>
                  </li>
                ) : null}
              </ul>
            </>
          )}
        </Panel>

        <Panel
          title="My leave"
          icon={<CalendarDays />}
          tone="var(--collab)"
          meta={balances?.year}
          action={
            <Link to="/people/leave" className="inline-flex items-center gap-1 text-brand-secondary hover:underline">
              Request <ArrowRight className="size-3.5" />
            </Link>
          }
          className="lg:col-span-5"
        >
          {balances && balances.balances.length === 0 ? (
            <p className="text-sm text-tertiary">Your account isn't linked to an employee profile yet.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {balances?.balances.map((b) => (
                <li key={b.leaveTypeId} className="flex items-center gap-3 rounded-xl border border-secondary bg-secondary/50 p-3">
                  <ProgressRing value={b.quota ? ((b.remaining ?? 0) / b.quota) * 100 : 100} size={44} color={b.color}>
                    <span className="text-[11px]">{b.remaining ?? "∞"}</span>
                  </ProgressRing>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{b.name}</div>
                    <div className="text-[11.5px] text-tertiary">
                      {b.quota === null ? `${b.approved} used` : `of ${b.quota} left`}
                      {b.pending ? <span className="text-work"> · {b.pending} pending</span> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="rise rise-3 grid gap-4 lg:grid-cols-3">
        <Panel title="Who's out" icon={<CalendarOff />} tone="var(--collab)" meta="today">
          {out.length === 0 ? (
            <p className="text-sm text-tertiary">Everyone's in today.</p>
          ) : (
            <ul className="space-y-2.5">
              {out.map((p) => (
                <li key={p.id}>
                  <Link to="/people/$id" params={{ id: p.id }} className="flex items-center gap-3 rounded-lg p-1 hover:bg-secondary">
                    <Avatar name={p.fullName} src={p.image} />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.fullName}</span>
                    <span className="font-mono text-[11px] text-tertiary">until {short(p.endDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Joining this month" icon={<UserPlus />} tone="var(--people)" meta={s?.joinersThisMonth.length || undefined}>
          {s?.joinersThisMonth.length === 0 ? <p className="text-sm text-tertiary">No new joiners this month.</p> : null}
          <ul className="space-y-2.5">
            {s?.joinersThisMonth.map((j) => (
              <li key={j.id}>
                <Link to="/people/$id" params={{ id: j.id }} className="flex items-center gap-3 rounded-lg p-1 hover:bg-secondary">
                  <Avatar name={j.fullName} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{j.fullName}</div>
                    <div className="truncate text-xs text-tertiary">{j.jobTitle ?? "—"}</div>
                  </div>
                  <span className="font-mono text-[11px] text-tertiary">{short(j.joinDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="My onboarding steps"
          icon={<CheckSquare />}
          tone="var(--finance)"
          meta={myItems?.items.length || undefined}
          action={
            myItems?.items.length ? (
              <Link to="/people/onboarding" className="inline-flex items-center gap-1 text-brand-secondary hover:underline">
                All <ArrowRight className="size-3.5" />
              </Link>
            ) : undefined
          }
        >
          {myItems?.items.length === 0 ? <p className="text-sm text-tertiary">Nothing assigned to you.</p> : null}
          <ul className="space-y-2">
            {myItems?.items.slice(0, 6).map((i) => (
              <li key={i.id} className="flex items-center gap-3 text-sm">
                <span className="size-4 shrink-0 rounded-md border-2 border-primary" />
                <span className="min-w-0 flex-1 truncate">
                  {i.title} <span className="text-tertiary">· {i.employeeName}</span>
                </span>
                <span className="font-mono text-[11px] text-tertiary">{short(i.dueDate)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </PageBody>
  );
}
