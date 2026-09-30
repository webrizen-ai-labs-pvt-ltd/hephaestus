import { can, countLeaveDays } from "@hephaestus/core";
import { Avatar, Badge, Button, Card, cn, Dialog, DialogContent, EmptyState, Field, Input, Select, Textarea } from "@hephaestus/ui";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarCheck, CalendarPlus, ChevronLeft, ChevronRight, Palmtree, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "../../components/app-shell.tsx";
import { api, type Me } from "../../lib/api.ts";
import {
  formatDate,
  formatRange,
  LEAVE_KEYS,
  type LeaveRequest,
  plural,
  useApiMutation,
  useBalances,
  useHolidays,
  useLeaveCalendar,
  useLeaveRequests,
  useLeaveTypes,
  useMyEmployee,
} from "../../lib/people.ts";
import { PageBody } from "./layout.tsx";

const STATUS_TONE = { pending: "finance", approved: "people", rejected: "danger", cancelled: "neutral" } as const;

function RequestLeaveDialog({ open, onOpenChange, workWeek }: { open: boolean; onOpenChange: (o: boolean) => void; workWeek: number[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: types } = useLeaveTypes();
  const { data: balances } = useBalances();
  const { data: hols } = useHolidays();
  const [leaveTypeId, setType] = useState("");
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(today);
  const [halfDay, setHalfDay] = useState<"none" | "first_half" | "second_half">("none");
  const [reason, setReason] = useState("");

  const typeId = leaveTypeId || types?.types[0]?.id || "";
  const balance = balances?.balances.find((b) => b.leaveTypeId === typeId);
  const days = useMemo(
    () =>
      countLeaveDays({
        start: startDate,
        end: endDate < startDate ? startDate : endDate,
        workWeek,
        holidays: new Set((hols?.holidays ?? []).filter((h) => !h.optional).map((h) => h.date)),
        halfDay: startDate === endDate ? halfDay : "none",
      }),
    [startDate, endDate, halfDay, workWeek, hols],
  );

  const submit = useApiMutation(
    () =>
      api("leave/requests", {
        method: "POST",
        body: JSON.stringify({ leaveTypeId: typeId, startDate, endDate, halfDay: startDate === endDate ? halfDay : "none", reason: reason || null }),
      }),
    { invalidate: LEAVE_KEYS, success: "Leave requested. Your manager has been notified.", onSuccess: () => onOpenChange(false) },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Request leave"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={submit.isPending || days <= 0 || !typeId} onClick={() => submit.mutate(undefined)}>
              Request {days > 0 ? plural(days, "day") : ""}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field
            label="Type"
            hint={balance ? (balance.remaining === null ? "No yearly limit" : `${balance.remaining} of ${balance.quota} days left this year`) : undefined}
          >
            <Select value={typeId} onChange={(e) => setType(e.target.value)}>
              {types?.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="From">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (e.target.value > endDate) setEnd(e.target.value);
                }}
              />
            </Field>
            <Field label="To">
              <Input type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          {startDate === endDate ? (
            <Field label="Duration">
              <Select value={halfDay} onChange={(e) => setHalfDay(e.target.value as typeof halfDay)}>
                <option value="none">Full day</option>
                <option value="first_half">First half</option>
                <option value="second_half">Second half</option>
              </Select>
            </Field>
          ) : null}
          <Field label="Reason" hint="Visible to you and your approvers only">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="Optional" />
          </Field>
          <div className="rounded-lg bg-surface-2 px-4 py-3 text-sm">
            {days > 0 ? (
              <>
                <span className="font-display text-lg font-bold">{days}</span> working {days === 1 ? "day" : "days"}
                <span className="text-muted-foreground"> (weekends and holidays excluded)</span>
              </>
            ) : (
              <span className="text-muted-foreground">These dates don't include any working days.</span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RequestRow({ r, actions, showName }: { r: LeaveRequest; actions?: React.ReactNode; showName?: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      {showName ? <Avatar name={r.employeeName} src={r.image} /> : <span className="size-2.5 rounded-full" style={{ background: r.leaveTypeColor }} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {showName ? `${r.employeeName} · ` : ""}
          {r.leaveTypeName}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {formatRange(r.startDate, r.endDate)} · {plural(Number(r.days), "day")}
          {r.halfDay !== "none" ? ` (${r.halfDay === "first_half" ? "first" : "second"} half)` : ""}
          {r.reason ? ` · ${r.reason}` : ""}
        </div>
        {r.decisionNote ? <div className="mt-0.5 text-xs italic text-muted-foreground">"{r.decisionNote}"</div> : null}
      </div>
      <Badge tone={STATUS_TONE[r.status]} className="capitalize">
        {r.status}
      </Badge>
      {actions}
    </li>
  );
}

function MyLeave({ workWeek }: { workWeek: number[] }) {
  const [requesting, setRequesting] = useState(false);
  const { data: me } = useMyEmployee();
  const { data: balances } = useBalances();
  const { data: mine } = useLeaveRequests("mine");
  const cancel = useApiMutation((id: string) => api(`leave/requests/${id}/cancel`, { method: "POST" }), {
    invalidate: LEAVE_KEYS,
    success: "Request cancelled",
  });
  const today = new Date().toISOString().slice(0, 10);

  if (me && !me.employee) {
    return (
      <Card>
        <EmptyState
          icon={<Palmtree />}
          title="Your profile isn't set up yet"
          description="Ask HR to add you to the directory with your work email. Then you can request leave here."
        />
      </Card>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setRequesting(true)}>
          <CalendarPlus /> Request leave
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {balances?.balances.map((b) => (
          <Card key={b.leaveTypeId} className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-2.5 rounded-full" style={{ background: b.color }} />
              {b.name}
            </div>
            <div className="mt-2 font-display text-3xl font-bold">
              {b.remaining ?? b.approved}
              <span className="ml-1 text-sm font-normal text-muted-foreground">{b.remaining === null ? "used" : `/ ${b.quota} left`}</span>
            </div>
            {b.pending ? <div className="mt-1 text-xs text-muted-foreground">{b.pending} pending</div> : null}
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="border-b border-border px-4 py-3 font-bold">My requests</h2>
        {mine?.requests.length === 0 ? (
          <EmptyState icon={<Palmtree />} title="No leave requested yet" description="Take a break. You've earned it." />
        ) : (
          <ul className="divide-y divide-border">
            {mine?.requests.map((r) => (
              <RequestRow
                key={r.id}
                r={r}
                actions={
                  r.status === "pending" || (r.status === "approved" && r.startDate > today) ? (
                    <Button size="sm" variant="ghost" onClick={() => confirm("Cancel this request?") && cancel.mutate(r.id)}>
                      Cancel
                    </Button>
                  ) : null
                }
              />
            ))}
          </ul>
        )}
      </Card>
      <RequestLeaveDialog open={requesting} onOpenChange={setRequesting} workWeek={workWeek} />
    </>
  );
}

function Approvals() {
  const { data } = useLeaveRequests("approvals");
  const [noteFor, setNoteFor] = useState<{ id: string; decision: "approved" | "rejected" } | null>(null);
  const [note, setNote] = useState("");
  const decide = useApiMutation(
    (v: { id: string; decision: "approved" | "rejected"; note?: string }) =>
      api(`leave/requests/${v.id}/decide`, { method: "POST", body: JSON.stringify({ decision: v.decision, note: v.note || null }) }),
    { invalidate: LEAVE_KEYS, onSuccess: (_, v) => {
        setNoteFor(null);
        setNote("");
        toast.success(`Request ${v.decision}`);
      },
    },
  );

  return (
    <Card>
      <h2 className="border-b border-border px-4 py-3 font-bold">Waiting for you</h2>
      {data?.requests.length === 0 ? (
        <EmptyState icon={<CalendarCheck />} title="All caught up" description="New requests from your team will show up here." />
      ) : (
        <ul className="divide-y divide-border">
          {data?.requests.map((r) => (
            <RequestRow
              key={r.id}
              r={r}
              showName
              actions={
                <span className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setNoteFor({ id: r.id, decision: "rejected" })}>
                    Decline
                  </Button>
                  <Button size="sm" variant="primary" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, decision: "approved" })}>
                    Approve
                  </Button>
                </span>
              }
            />
          ))}
        </ul>
      )}
      <Dialog open={noteFor !== null} onOpenChange={(o) => !o && setNoteFor(null)}>
        <DialogContent
          title="Decline request"
          footer={
            <>
              <Button variant="ghost" onClick={() => setNoteFor(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => noteFor && decide.mutate({ ...noteFor, note })}>
                Decline
              </Button>
            </>
          }
        >
          <Field label="Note to the employee" hint="Optional, but helps them plan">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoFocus />
          </Field>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const startOffset = (first.getUTCDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10));
  while (cells.length % 7) cells.push(null);
  return cells;
}

function LeaveCalendar({ workWeek }: { workWeek: number[] }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const cells = monthGrid(cursor.y, cursor.m);
  const from = cells.find(Boolean)!;
  const to = [...cells].reverse().find(Boolean)!;
  const { data } = useLeaveCalendar(from, to);
  const today = now.toISOString().slice(0, 10);
  const move = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="flex-1 font-display text-lg font-bold">
          {new Date(cursor.y, cursor.m, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </h2>
        <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => move(-1)}>
          <ChevronLeft />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>
          Today
        </Button>
        <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => move(1)}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-surface-2 px-2 py-1.5 font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          const weekday = (i % 7) + 1;
          const off = !workWeek.includes(weekday);
          const holiday = date ? data?.holidays.find((h) => h.date === date) : undefined;
          const away = date ? (data?.requests ?? []).filter((r) => r.startDate <= date && r.endDate >= date) : [];
          return (
            <div key={i} className={cn("min-h-24 bg-surface p-1.5", (off || !date) && "bg-surface-2/50")}>
              {date ? (
                <>
                  <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full font-mono", date === today && "bg-primary text-primary-foreground")}>
                    {Number(date.slice(8))}
                  </div>
                  {holiday ? <div className="mb-1 truncate rounded bg-brass/20 px-1.5 py-0.5 text-[11px] text-finance">{holiday.name}</div> : null}
                  {!off
                    ? away.slice(0, 3).map((r) => (
                        <div
                          key={r.id}
                          className="mb-0.5 truncate rounded px-1.5 py-0.5 text-[11px]"
                          style={{ background: `color-mix(in srgb, ${r.leaveTypeColor} 22%, transparent)` }}
                          title={`${r.employeeName} · ${r.leaveTypeName}`}
                        >
                          {r.employeeName.split(" ")[0]}
                        </div>
                      ))
                    : null}
                  {!off && away.length > 3 ? <div className="text-[11px] text-muted-foreground">+{away.length - 3} more</div> : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function LeaveSettings() {
  const { data: types } = useLeaveTypes();
  const year = String(new Date().getFullYear());
  const { data: hols } = useHolidays(year);
  const [typeName, setTypeName] = useState("");
  const [quota, setQuota] = useState("12");
  const [holName, setHolName] = useState("");
  const [holDate, setHolDate] = useState("");

  const addType = useApiMutation(
    () => api("leave/types", { method: "POST", body: JSON.stringify({ name: typeName, annualQuota: quota === "" ? null : Number(quota) }) }),
    { invalidate: ["leave-types", "leave-balances"], success: "Leave type added", onSuccess: () => setTypeName("") },
  );
  const archiveType = useApiMutation((id: string) => api(`leave/types/${id}`, { method: "DELETE" }), {
    invalidate: ["leave-types", "leave-balances"],
    success: "Leave type removed",
  });
  const addHoliday = useApiMutation(() => api("holidays", { method: "POST", body: JSON.stringify({ name: holName, date: holDate }) }), {
    invalidate: ["holidays", "leave-calendar"],
    success: "Holiday added",
    onSuccess: () => (setHolName(""), setHolDate("")),
  });
  const removeHoliday = useApiMutation((id: string) => api(`holidays/${id}`, { method: "DELETE" }), {
    invalidate: ["holidays", "leave-calendar"],
    success: "Holiday removed",
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="font-bold">Leave types</h2>
        <p className="mt-1 text-sm text-muted-foreground">Leave blank for no yearly limit.</p>
        <ul className="mt-4 divide-y divide-border">
          {types?.types.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="size-2.5 rounded-full" style={{ background: t.color }} />
              <span className="flex-1">{t.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{t.annualQuota === null ? "Unlimited" : `${t.annualQuota} days/yr`}</span>
              {!t.paid ? <Badge>Unpaid</Badge> : null}
              <button type="button" aria-label={`Remove ${t.name}`} onClick={() => confirm(`Remove ${t.name}? Past requests are kept.`) && archiveType.mutate(t.id)} className="rounded p-1 text-muted-foreground hover:text-danger">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typeName.trim()) addType.mutate(undefined);
          }}
        >
          <Input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="Maternity leave" maxLength={60} />
          <Input value={quota} onChange={(e) => setQuota(e.target.value)} type="number" min={0} max={365} step={0.5} className="w-24" aria-label="Days per year" />
          <Button type="submit" aria-label="Add leave type">
            <Plus />
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="font-bold">Holidays in {year}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Holidays don't count against anyone's leave.</p>
        <ul className="mt-4 divide-y divide-border">
          {hols?.holidays.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-28 font-mono text-xs text-muted-foreground">{formatDate(h.date, { weekday: "short", day: "numeric", month: "short" })}</span>
              <span className="flex-1">{h.name}</span>
              <button type="button" aria-label={`Remove ${h.name}`} onClick={() => removeHoliday.mutate(h.id)} className="rounded p-1 text-muted-foreground hover:text-danger">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (holName.trim() && holDate) addHoliday.mutate(undefined);
          }}
        >
          <Input value={holName} onChange={(e) => setHolName(e.target.value)} placeholder="Diwali" maxLength={80} />
          <Input value={holDate} onChange={(e) => setHolDate(e.target.value)} type="date" className="w-40" aria-label="Date" />
          <Button type="submit" aria-label="Add holiday">
            <Plus />
          </Button>
        </form>
      </Card>
    </div>
  );
}

export function LeavePage({ me }: { me: Me }) {
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const { data: approvals } = useLeaveRequests("approvals");
  const isApprover = can(me.org.permissions, "leave", "approve") || (approvals?.requests.length ?? 0) > 0;
  const canSettings = can(me.org.permissions, "settings", "manage");

  const tabs = [
    { key: "mine", label: "My leave" },
    ...(isApprover ? [{ key: "approvals", label: "Approvals", count: approvals?.requests.length }] : []),
    { key: "calendar", label: "Team calendar" },
    ...(canSettings ? [{ key: "settings", label: "Types and holidays" }] : []),
  ];
  const tab = tabs.some((t) => t.key === search.tab) ? search.tab! : "mine";

  return (
    <PageBody>
      <PageHeader title="Leave" description="Requests, approvals, and who's away." />
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 text-sm sm:w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => navigate({ to: "/people/leave", search: { tab: t.key }, replace: true })}
            className={cn(
              "flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 transition-colors",
              tab === t.key ? "bg-surface-2 font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {"count" in t && t.count ? <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">{t.count}</span> : null}
          </button>
        ))}
      </div>
      {tab === "mine" ? <MyLeave workWeek={me.settings.workWeek} /> : null}
      {tab === "approvals" ? <Approvals /> : null}
      {tab === "calendar" ? <LeaveCalendar workWeek={me.settings.workWeek} /> : null}
      {tab === "settings" ? <LeaveSettings /> : null}
    </PageBody>
  );
}
