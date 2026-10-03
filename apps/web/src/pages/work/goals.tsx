import { can } from "@hephaestus/core";
import { Badge, Button, Card, DateInput, Dialog, DialogContent, Em, EmptyState, Field, Input, ProgressRing, Select, Textarea } from "@hephaestus/ui";
import { Link } from "@tanstack/react-router";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/app-shell.tsx";
import { api, type Me } from "../../lib/api.ts";
import { formatDate, useApiMutation, useEmployees } from "../../lib/people.ts";
import { GOAL_STATUS, type Goal, useGoals, WORK_KEYS } from "../../lib/work.ts";
import { WorkBody } from "./layout.tsx";

function GoalDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (o: boolean) => void; goal?: Goal }) {
  const { data: people } = useEmployees();
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [owner, setOwner] = useState(goal?.ownerEmployeeId ?? "");
  const [status, setStatus] = useState<Goal["status"]>(goal?.status ?? "on_track");
  const [targetDate, setTarget] = useState(goal?.targetDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation(
    () => {
      const body = JSON.stringify({ title, description: description || null, ownerEmployeeId: owner || null, status, targetDate: targetDate || null });
      return goal ? api(`goals/${goal.id}`, { method: "PATCH", body }) : api("goals", { method: "POST", body });
    },
    { invalidate: WORK_KEYS, success: goal ? "Goal updated" : "Goal created", onSuccess: () => onOpenChange(false) },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={goal ? "Edit goal" : "New goal"}
        description="Goals are company outcomes. Link projects to them to track progress."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={save.isPending} onClick={() => (title.trim() ? save.mutate(undefined) : setError("Enter a goal"))}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Goal" error={error} className="sm:col-span-2">
            <Input value={title} onChange={(e) => (setTitle(e.target.value), setError(null))} placeholder="Double online revenue by March" autoFocus maxLength={200} />
          </Field>
          <Field label="Why it matters" className="sm:col-span-2">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} className="min-h-16" />
          </Field>
          <Field label="Owner">
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">No owner</option>
              {people?.employees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Target date">
            <DateInput value={targetDate} onChange={(v) => setTarget(v)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Goal["status"])}>
              {Object.entries(GOAL_STATUS).map(([k, m]) => (
                <option key={k} value={k}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_COLOR: Record<Goal["status"], string> = {
  on_track: "var(--color-fg-success-primary)",
  at_risk: "var(--color-fg-warning-primary)",
  off_track: "var(--color-fg-error-primary)",
  done: "var(--color-text-quaternary)",
};

function daysLeft(date: string | null) {
  if (!date) return null;
  const d = Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000);
  return d < 0 ? `${-d}d past target` : d === 0 ? "Due today" : `${d} days left`;
}

export function GoalsPage({ me }: { me: Me }) {
  const { data } = useGoals();
  const [dialog, setDialog] = useState<{ open: boolean; goal?: Goal }>({ open: false });
  const canCreate = can(me.org.permissions, "project", "create");
  const canEdit = can(me.org.permissions, "project", "update");
  const canDelete = can(me.org.permissions, "project", "archive");
  const remove = useApiMutation((id: string) => api(`goals/${id}`, { method: "DELETE" }), { invalidate: WORK_KEYS, success: "Goal deleted" });
  const goals = data?.goals ?? [];
  const count = (s: Goal["status"]) => goals.filter((g) => g.status === s).length;
  const avg = goals.length ? Math.round(goals.reduce((a, g) => a + g.progress, 0) / goals.length) : 0;

  return (
    <WorkBody>
      <PageHeader
        title="Goals"
        description={
          goals.length ? (
            <>
              <Em tone="var(--work)">{goals.length} goals</Em>, <Em>{avg}%</Em> done on average.{" "}
              {count("at_risk") + count("off_track") ? (
                <>
                  <Em tone="var(--color-fg-warning-primary)">{count("at_risk") + count("off_track")}</Em> need attention.
                </>
              ) : (
                "All on track."
              )}
            </>
          ) : (
            "What the company is working towards, and how close you are."
          )
        }
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => setDialog({ open: true })}>
              <Plus /> New goal
            </Button>
          ) : null
        }
      />
      {goals.length ? (
        <div className="rise rise-1 flex flex-wrap gap-2">
          {(Object.keys(GOAL_STATUS) as Goal["status"][]).map((s) => (
            <span key={s} className="inline-flex items-center gap-2 rounded-full border border-secondary bg-primary px-3 py-1.5 text-[13px] shadow-xs">
              <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              {GOAL_STATUS[s].label}
              <span className="font-mono text-xs text-tertiary">{count(s)}</span>
            </span>
          ))}
        </div>
      ) : null}
      {data && goals.length === 0 ? (
        <Card>
          <EmptyState icon={<Target />} title="No goals yet" description="Set a few company goals, then link projects to them. Progress rolls up from tasks." />
        </Card>
      ) : null}
      <div className="rise rise-2 grid gap-4 lg:grid-cols-2">
        {goals.map((g) => {
          const color = STATUS_COLOR[g.status];
          return (
            <Card key={g.id} className="group relative flex flex-col overflow-hidden p-5">
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
              <div className="flex items-start gap-4">
                <ProgressRing value={g.progress} size={68} stroke={6} color={color}>
                  <span className="text-sm">{g.progress}%</span>
                </ProgressRing>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <h3 className="min-w-0 flex-1 font-display text-[17px] font-bold leading-snug">{g.title}</h3>
                    <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      {canEdit ? (
                        <button type="button" aria-label={`Edit ${g.title}`} onClick={() => setDialog({ open: true, goal: g })} className="rounded p-1 text-tertiary hover:text-primary">
                          <Pencil className="size-4" />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button type="button" aria-label={`Delete ${g.title}`} onClick={() => confirm(`Delete "${g.title}"? Linked projects are kept.`) && remove.mutate(g.id)} className="rounded p-1 text-tertiary hover:text-error-primary">
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-tertiary">
                    <Badge tone={GOAL_STATUS[g.status].tone}>{GOAL_STATUS[g.status].label}</Badge>
                    {g.ownerName ? <span>{g.ownerName}</span> : null}
                    {g.targetDate ? (
                      <span className="font-mono">
                        {formatDate(g.targetDate, { day: "numeric", month: "short" })} · {daysLeft(g.targetDate)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              {g.description ? <p className="mt-4 text-sm text-tertiary">{g.description}</p> : null}
              <div className="mt-auto pt-4">
                {g.projects.length ? (
                  <ul className="space-y-2 border-t border-secondary pt-3">
                    {g.projects.map((p) => (
                      <li key={p.id}>
                        <Link to="/work/projects/$id" params={{ id: p.id }} className="flex items-center gap-3 text-[13px] hover:underline">
                          <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} />
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <span className="h-1 w-24 overflow-hidden rounded-full bg-secondary">
                            <span className="block h-full rounded-full" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%`, background: p.color }} />
                          </span>
                          <span className="w-10 text-right font-mono text-[11px] text-tertiary">
                            {p.done}/{p.total}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="border-t border-secondary pt-3 text-xs text-tertiary">No projects linked yet. Pick this goal in a project's settings.</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {dialog.open ? <GoalDialog key={dialog.goal?.id ?? "new"} open onOpenChange={(o) => setDialog({ open: o })} goal={dialog.goal} /> : null}
    </WorkBody>
  );
}

