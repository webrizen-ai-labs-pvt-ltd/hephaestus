import { addDays } from "@hephaestus/core";
import { Avatar, Card, cn, EmptyState, Select } from "@hephaestus/ui";
import { Link } from "@tanstack/react-router";
import { Gauge } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/app-shell.tsx";
import { useWorkload } from "../../lib/work.ts";
import { WorkBody } from "./layout.tsx";

/** Heat from task count, adjusted for days away. Thresholds suit a 5-day week. */
function heat(tasks: number, leaveDays: number) {
  const capacity = Math.max(0, 5 - leaveDays);
  if (tasks === 0) return { bg: "transparent", label: "Free" };
  const load = capacity === 0 ? 99 : tasks / capacity;
  if (load > 2) return { bg: "color-mix(in srgb, var(--danger) 45%, transparent)", label: "Overloaded" };
  if (load > 1.2) return { bg: "color-mix(in srgb, var(--work) 40%, transparent)", label: "Busy" };
  if (load > 0.5) return { bg: "color-mix(in srgb, var(--finance) 32%, transparent)", label: "Steady" };
  return { bg: "color-mix(in srgb, var(--people) 25%, transparent)", label: "Light" };
}

export function WorkloadPage() {
  const [weeks, setWeeks] = useState(6);
  const { data } = useWorkload(weeks);

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
      {data && data.people.length === 0 ? (
        <Card>
          <EmptyState icon={<Gauge />} title="No one to show" description="Add people in the directory and assign them tasks." />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="sticky left-0 bg-surface px-4 py-2.5 font-medium">Person</th>
                <th className="px-2 py-2.5 text-center font-medium">Overdue</th>
                {data?.weeks.map((w, i) => (
                  <th key={w} className="px-2 py-2.5 text-center font-medium">
                    {i === 0 ? "This week" : new Date(`${w}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    <div className="font-normal">{i === 0 ? "" : `– ${new Date(`${addDays(w, 6)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric" })}`}</div>
                  </th>
                ))}
                <th className="px-2 py-2.5 text-center font-medium">No date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.people.map((p) => (
                <tr key={p.id}>
                  <td className="sticky left-0 bg-surface px-4 py-2.5">
                    <Link to="/people/$id" params={{ id: p.id }} className="flex items-center gap-2.5 hover:underline">
                      <Avatar name={p.fullName} src={p.image} className="size-7 text-[10px]" />
                      <span className="max-w-40 truncate">{p.fullName}</span>
                    </Link>
                  </td>
                  <td className={cn("px-2 py-2.5 text-center font-mono", p.overdue ? "text-danger" : "text-muted-foreground")}>{p.overdue || "–"}</td>
                  {p.weeks.map((w, i) => {
                    const h = heat(w.tasks, w.leaveDays);
                    return (
                      <td key={i} className="px-1.5 py-1.5">
                        <div
                          className="flex h-11 flex-col items-center justify-center rounded-md border border-border"
                          style={{ background: h.bg }}
                          title={`${h.label}: ${w.tasks} tasks${w.hours ? `, ${w.hours}h estimated` : ""}${w.leaveDays ? `, ${w.leaveDays} day${w.leaveDays === 1 ? "" : "s"} on leave` : ""}`}
                        >
                          <span className="font-mono text-sm">{w.tasks || ""}</span>
                          {w.leaveDays ? <span className="text-[10px] text-muted-foreground">{w.leaveDays}d off</span> : w.hours ? <span className="text-[10px] text-muted-foreground">{w.hours}h</span> : null}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2.5 text-center font-mono text-muted-foreground">{p.unscheduled || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            {[
              ["Light", "var(--people)", 25],
              ["Steady", "var(--finance)", 32],
              ["Busy", "var(--work)", 40],
              ["Overloaded", "var(--danger)", 45],
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
