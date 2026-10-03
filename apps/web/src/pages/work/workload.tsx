import { addDays } from "@hephaestus/core";
import { Avatar, Card, cn, EmptyState, KpiTile, Select } from "@hephaestus/ui";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Coffee, Flame, Gauge } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/app-shell.tsx";
import { useWorkload } from "../../lib/work.ts";
import { WorkBody } from "./layout.tsx";

/** Heat from task count, adjusted for days away. Thresholds suit a 5-day week. */
function heat(tasks: number, leaveDays: number) {
  const capacity = Math.max(0, 5 - leaveDays);
  if (tasks === 0) return { bg: "transparent", label: "Free" };
  const load = capacity === 0 ? 99 : tasks / capacity;
  if (load > 2) return { bg: "color-mix(in srgb, var(--color-fg-error-primary) 45%, transparent)", label: "Overloaded" };
  if (load > 1.2) return { bg: "color-mix(in srgb, var(--work) 40%, transparent)", label: "Busy" };
  if (load > 0.5) return { bg: "color-mix(in srgb, var(--finance) 32%, transparent)", label: "Steady" };
  return { bg: "color-mix(in srgb, var(--people) 25%, transparent)", label: "Light" };
}

export function WorkloadPage() {
  const [weeks, setWeeks] = useState(6);
  const { data } = useWorkload(weeks);
  const people = data?.people ?? [];
  const thisWeek = people.map((p) => heat((p.weeks[0]?.tasks ?? 0) + p.overdue, p.weeks[0]?.leaveDays ?? 0).label);
  const overloaded = people.filter((_, i) => thisWeek[i] === "Overloaded" || thisWeek[i] === "Busy");
  const free = people.filter((_, i) => thisWeek[i] === "Free" || thisWeek[i] === "Light");
  const totals = people.map((p) => p.overdue + p.unscheduled + p.weeks.reduce((a, w) => a + w.tasks, 0));
  const maxTotal = Math.max(1, ...totals);

  return (
    <WorkBody>
      <PageHeader
        title="Workload"
        description="Open tasks by due week for each person, with approved leave taken into account."
        actions={
          <Select value={String(weeks)} onChange={(e) => setWeeks(Number(e.target.value))} className="w-36" aria-label="Weeks">
            <option value="4">4 weeks</option>
            <option value="6">6 weeks</option>
            <option value="8">8 weeks</option>
            <option value="12">12 weeks</option>
          </Select>
        }
      />
      {people.length ? (
        <div className="rise rise-1 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile label="Busy this week" icon={<Flame />} tone="var(--color-fg-error-primary)" value={overloaded.length} hint={overloaded.map((p) => p.fullName.split(" ")[0]).join(", ") || "No one is stretched"} />
          <KpiTile label="Has room this week" icon={<Coffee />} tone="var(--people)" value={free.length} hint={free.slice(0, 4).map((p) => p.fullName.split(" ")[0]).join(", ") || "Everyone is busy"} />
          <KpiTile label="Overdue tasks" icon={<AlertTriangle />} tone="var(--work)" value={people.reduce((a, p) => a + p.overdue, 0)} hint="Across the team" />
          <KpiTile label="No due date" icon={<CalendarClock />} tone="var(--collab)" value={people.reduce((a, p) => a + p.unscheduled, 0)} hint="Open tasks nobody has scheduled" />
        </div>
      ) : null}
      {data && data.people.length === 0 ? (
        <Card>
          <EmptyState icon={<Gauge />} title="No one to show" description="Add people in the directory and assign them tasks." />
        </Card>
      ) : (
        <Card className="rise rise-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-secondary text-left text-xs text-tertiary">
                <th className="sticky left-0 bg-primary px-4 py-2.5 font-medium">Person</th>
                <th className="px-2 py-2.5 text-center font-medium">Overdue</th>
                {data?.weeks.map((w, i) => (
                  <th key={w} className="px-2 py-2.5 text-center font-medium">
                    {i === 0 ? "This week" : new Date(`${w}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    <div className="font-normal">{i === 0 ? "" : `– ${new Date(`${addDays(w, 6)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric" })}`}</div>
                  </th>
                ))}
                <th className="px-2 py-2.5 text-center font-medium">No date</th>
                <th className="px-4 py-2.5 font-medium">Total open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-secondary">
              {people.map((p, pi) => (
                <tr key={p.id}>
                  <td className="sticky left-0 bg-primary px-4 py-2.5">
                    <Link to="/people/$id" params={{ id: p.id }} className="flex items-center gap-2.5 hover:underline">
                      <Avatar name={p.fullName} src={p.image} className="size-7 text-[10px]" />
                      <span className="max-w-40 truncate">{p.fullName}</span>
                    </Link>
                  </td>
                  <td className={cn("px-2 py-2.5 text-center font-mono", p.overdue ? "text-error-primary" : "text-tertiary")}>{p.overdue || "–"}</td>
                  {p.weeks.map((w, i) => {
                    const h = heat(w.tasks, w.leaveDays);
                    return (
                      <td key={i} className="px-1.5 py-1.5">
                        <div
                          className="flex h-11 flex-col items-center justify-center rounded-md border border-secondary"
                          style={{ background: h.bg }}
                          title={`${h.label}: ${w.tasks} tasks${w.hours ? `, ${w.hours}h estimated` : ""}${w.leaveDays ? `, ${w.leaveDays} day${w.leaveDays === 1 ? "" : "s"} on leave` : ""}`}
                        >
                          <span className="font-mono text-sm">{w.tasks || ""}</span>
                          {w.leaveDays ? <span className="text-[10px] text-tertiary">{w.leaveDays}d off</span> : w.hours ? <span className="text-[10px] text-tertiary">{w.hours}h</span> : null}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2.5 text-center font-mono text-tertiary">{p.unscheduled || "–"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                        <span className="block h-full rounded-full bg-work" style={{ width: `${(totals[pi]! / maxTotal) * 100}%` }} />
                      </span>
                      <span className="font-mono text-xs">{totals[pi]}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-4 border-t border-secondary px-4 py-3 text-xs text-tertiary">
            {[
              ["Light", "var(--people)", 25],
              ["Steady", "var(--finance)", 32],
              ["Busy", "var(--work)", 40],
              ["Overloaded", "var(--color-fg-error-primary)", 45],
            ].map(([label, color, pct]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="size-3 rounded" style={{ background: `color-mix(in srgb, ${color} ${pct}%, transparent)` }} />
                {label}
              </span>
            ))}
            <span>Overdue work counts in this week.</span>
          </div>
        </Card>
      )}
    </WorkBody>
  );
}
