import { can } from "@hephaestus/core";
import { Badge, Button, Card, Dialog, DialogContent, EmptyState, Field, Input, Select, Textarea } from "@hephaestus/ui";
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
            <Input type="date" value={targetDate} onChange={(e) => setTarget(e.target.value)} />
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

export function GoalsPage({ me }: { me: Me }) {
  const { data } = useGoals();
  const [dialog, setDialog] = useState<{ open: boolean; goal?: Goal }>({ open: false });
  const canCreate = can(me.org.permissions, "project", "create");
  const canEdit = can(me.org.permissions, "project", "update");
  const canDelete = can(me.org.permissions, "project", "archive");
  const remove = useApiMutation((id: string) => api(`goals/${id}`, { method: "DELETE" }), { invalidate: WORK_KEYS, success: "Goal deleted" });

  return (
    <WorkBody className="max-w-5xl">
      <PageHeader
        title="Goals"
        description="What the company is working towards, and how close you are."
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => setDialog({ open: true })}>
              <Plus /> New goal
            </Button>
          ) : null
        }
      />
      {data?.goals.length === 0 ? (
        <Card>
          <EmptyState icon={<Target />} title="No goals yet" description="Set a few company goals, then link projects to them. Progress rolls up from tasks." />
        </Card>
      ) : null}
      <div className="space-y-3">
        {data?.goals.map((g) => (
          <Card key={g.id} className="p-5">
            <div className="flex flex-wrap items-start gap-3">
              <Target className="mt-1 size-5 text-work" />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold">{g.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {[g.ownerName, g.targetDate && `by ${formatDate(g.targetDate)}`].filter(Boolean).join(" · ") || "No owner or date yet"}
                </p>
              </div>
              <Badge tone={GOAL_STATUS[g.status].tone}>{GOAL_STATUS[g.status].label}</Badge>
              {canEdit ? (
                <button type="button" aria-label={`Edit ${g.title}`} onClick={() => setDialog({ open: true, goal: g })} className="rounded p-1 text-muted-foreground hover:text-foreground">
                  <Pencil className="size-4" />
                </button>
              ) : null}
              {canDelete ? (
                <button type="button" aria-label={`Delete ${g.title}`} onClick={() => confirm(`Delete "${g.title}"? Linked projects are kept.`) && remove.mutate(g.id)} className="rounded p-1 text-muted-foreground hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
            {g.description ? <p className="mt-3 text-sm">{g.description}</p> : null}
            <div className="mt-4 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-work" style={{ width: `${g.progress}%` }} />
              </div>
              <span className="font-mono text-sm">{g.progress}%</span>
            </div>
            {g.projects.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {g.projects.map((p) => (
                  <Link key={p.id} to="/work/projects/$id" params={{ id: p.id }} className="inline-flex items-center gap-2 rounded-md bg-surface-2 px-2 py-1 text-xs hover:bg-input">
                    <span className="size-2 rounded-full" style={{ background: p.color }} />
                    {p.name}
                    <span className="font-mono text-muted-foreground">
                      {p.done}/{p.total}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">No projects linked yet. Pick this goal in a project's settings.</p>
            )}
          </Card>
        ))}
      </div>
      {dialog.open ? <GoalDialog key={dialog.goal?.id ?? "new"} open onOpenChange={(o) => setDialog({ open: o })} goal={dialog.goal} /> : null}
    </WorkBody>
  );
}
