import {
  Avatar,
  Button,
  cn,
  Dialog,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SheetContent,
  Skeleton,
} from "@hephaestus/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Link2, Plus, Repeat, Tag, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api.ts";
import { formatDate, useApiMutation, useEmployees } from "../../lib/people.ts";
import {
  PRIORITY_META,
  type Priority,
  type Recurrence,
  STATUS_META,
  type StageCategory,
  type TaskDetail,
  taskRef,
  useLabels,
  useProject,
  useTask,
  useTasks,
  WORK_KEYS,
} from "../../lib/work.ts";
import { PriorityIcon, QuickAdd, StatusDot, TaskRow, todayLocal } from "./task-bits.tsx";

type Patch = Partial<{
  title: string;
  description: string | null;
  stageId: string;
  status: StageCategory;
  priority: Priority;
  dueDate: string | null;
  startDate: string | null;
  milestoneId: string | null;
  estimateHours: number | null;
  recurrence: Recurrence | null;
  assigneeIds: string[];
  labelIds: string[];
}>;

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const ghostControl = "h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-border focus:border-ring focus:outline-none";

function AssigneePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useEmployees();
  const [q, setQ] = useState("");
  const people = data?.employees ?? [];
  const selected = people.filter((p) => value.includes(p.id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(ghostControl, "flex items-center gap-2 text-left")}>
          {selected.length ? (
            <>
              <span className="flex -space-x-1.5">
                {selected.slice(0, 4).map((p) => (
                  <Avatar key={p.id} name={p.fullName} src={p.image} className="size-6 border-2 border-surface text-[10px]" />
                ))}
              </span>
              <span className="truncate">{selected.map((p) => p.fullName.split(" ")[0]).join(", ")}</span>
            </>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-4" /> Unassigned
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" autoFocus className="mb-1 h-8 w-full rounded-md bg-surface-2 px-2 text-sm outline-none" />
        <ul className="max-h-64 overflow-y-auto">
          {people
            .filter((p) => p.fullName.toLowerCase().includes(q.toLowerCase()))
            .map((p) => {
              const on = value.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
                  >
                    <Avatar name={p.fullName} src={p.image} className="size-6 text-[10px]" />
                    <span className="flex-1 truncate">{p.fullName}</span>
                    {on ? <Check className="size-4 text-primary" /> : null}
                  </button>
                </li>
              );
            })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function LabelPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const qc = useQueryClient();
  const { data } = useLabels();
  const [q, setQ] = useState("");
  const all = data?.labels ?? [];
  const selected = all.filter((l) => value.includes(l.id));
  const exact = all.some((l) => l.name.toLowerCase() === q.trim().toLowerCase());
  const create = async () => {
    try {
      const r = await api<{ label: { id: string } }>("labels", { method: "POST", body: JSON.stringify({ name: q.trim() }) });
      await qc.invalidateQueries({ queryKey: ["labels"] });
      onChange([...value, r.label.id]);
      setQ("");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(ghostControl, "flex h-auto min-h-8 flex-wrap items-center gap-1.5 py-1 text-left")}>
          {selected.length ? (
            selected.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs">
                <span className="size-2 rounded-full" style={{ background: l.color }} />
                {l.name}
              </span>
            ))
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Tag className="size-4" /> No labels
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && q.trim() && !exact && void create()}
          placeholder="Find or create a label"
          autoFocus
          maxLength={40}
          className="mb-1 h-8 w-full rounded-md bg-surface-2 px-2 text-sm outline-none"
        />
        <ul className="max-h-60 overflow-y-auto">
          {all
            .filter((l) => l.name.toLowerCase().includes(q.toLowerCase()))
            .map((l) => {
              const on = value.includes(l.id);
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => onChange(on ? value.filter((x) => x !== l.id) : [...value, l.id])}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
                  >
                    <span className="size-2.5 rounded-full" style={{ background: l.color }} />
                    <span className="flex-1 truncate">{l.name}</span>
                    {on ? <Check className="size-4 text-primary" /> : null}
                  </button>
                </li>
              );
            })}
          {q.trim() && !exact ? (
            <li>
              <button type="button" onClick={() => void create()} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-accent hover:bg-surface-2">
                <Plus className="size-4" /> Create "{q.trim()}"
              </button>
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function describeActivity(a: TaskDetail["activity"][number]) {
  const who = a.actorName ?? "Someone";
  if (a.type === "created") return a.data.recurringFrom ? "Created from a repeating task" : `${who} created this task`;
  if (a.type === "blocked_by") return `${who} marked it blocked by "${String(a.data.title)}"`;
  const parts: string[] = [];
  const d = a.data as Record<string, { from: unknown; to: unknown }>;
  if (d.stage) parts.push(`moved it to ${d.stage.to}`);
  else if (d.status) parts.push(d.status.to === "done" ? "completed it" : `set status to ${STATUS_META[d.status.to as StageCategory]?.label ?? d.status.to}`);
  if (d.title) parts.push("renamed it");
  if (d.assignees) parts.push("changed assignees");
  if (d.priority) parts.push(`set priority to ${PRIORITY_META[d.priority.to as Priority]?.label}`);
  if (d.dueDate) parts.push(d.dueDate.to ? `set the due date to ${formatDate(String(d.dueDate.to), { day: "numeric", month: "short" })}` : "removed the due date");
  if (d.description) parts.push("edited the description");
  if (d.milestoneId) parts.push("changed the milestone");
  if (d.estimateHours) parts.push("changed the estimate");
  if (d.recurrence) parts.push(d.recurrence.to ? "made it repeat" : "stopped it repeating");
  if (d.startDate) parts.push("changed the start date");
  return `${who} ${parts.join(", ") || "updated it"}`;
}

function TaskBody({ id, onClose, onOpen }: { id: string; onClose: () => void; onOpen: (id: string) => void }) {
  const { data, isLoading, error } = useTask(id);
  const projectId = data?.task.projectId ?? "";
  const { data: project } = useProject(projectId);
  const { data: siblings } = useTasks({ projectId: projectId || undefined });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const today = todayLocal();

  useEffect(() => {
    if (data) {
      setTitle(data.task.title);
      setDescription(data.task.description ?? "");
    }
  }, [data?.task.id, data?.task.title, data?.task.description]);

  const update = useApiMutation((patch: Patch) => api<{ nextTaskId: string | null }>(`tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }), {
    invalidate: WORK_KEYS,
    onSuccess: (r) => r.nextTaskId && toast.success("Done. The next one is scheduled."),
  });
  const remove = useApiMutation(() => api(`tasks/${id}`, { method: "DELETE" }), {
    invalidate: WORK_KEYS,
    success: "Task deleted",
    onSuccess: onClose,
  });
  const addBlocker = useApiMutation((blockedById: string) => api(`tasks/${id}/dependencies`, { method: "POST", body: JSON.stringify({ blockedById }) }), {
    invalidate: WORK_KEYS,
  });
  const removeBlocker = useApiMutation((blockedById: string) => api(`tasks/${id}/dependencies/${blockedById}`, { method: "DELETE" }), {
    invalidate: WORK_KEYS,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !data) return <p className="p-6 text-sm text-muted-foreground">{error?.message ?? "Task not found"}</p>;

  const t = data.task;
  const ref = taskRef(t);
  const done = t.status === "done";
  const blockerOptions = (siblings?.tasks ?? []).filter((x) => x.id !== t.id && !data.blockedBy.some((b) => b.id === x.id));

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        {t.projectId ? (
          <Link
            to="/work/projects/$id"
            params={{ id: t.projectId }}
            className="flex items-center gap-2 rounded-md px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <span className="size-2 rounded-full" style={{ background: t.projectColor ?? undefined }} />
            {t.projectName}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">{t.source === "onboarding" ? "Onboarding" : "Personal task"}</span>
        )}
        {ref ? <span className="font-mono text-xs text-muted-foreground">{ref}</span> : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Copy link"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href);
              toast.success("Link copied");
            }}
          >
            <Copy />
          </Button>
          {t.source !== "onboarding" ? (
            <Button size="icon" variant="ghost" aria-label="Delete task" onClick={() => confirm("Delete this task and its subtasks?") && remove.mutate(undefined)}>
              <Trash2 />
            </Button>
          ) : null}
          <Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {data.parent ? (
          <button type="button" onClick={() => onOpen(data.parent!.id)} className="mb-2 text-xs text-muted-foreground hover:text-foreground">
            ↑ Subtask of {data.parent.title}
          </button>
        ) : null}
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-1.5"
            aria-label={done ? "Reopen" : "Complete"}
            onClick={() => update.mutate({ status: done ? "todo" : "done" })}
          >
            <StatusDot status={t.status} className="size-5" />
          </button>
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
            onBlur={() => title.trim() && title.trim() !== t.title && update.mutate({ title: title.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
            rows={1}
            maxLength={300}
            aria-label="Title"
            className={cn("field-sizing-content w-full resize-none bg-transparent font-display text-2xl font-bold leading-tight outline-none", done && "text-muted-foreground line-through")}
          />
        </div>
        {t.blocked ? (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            <Link2 className="size-4" /> Blocked until the tasks below are done.
          </p>
        ) : null}

        <div className="mt-5 rounded-lg border border-border px-3 py-2">
          <Prop label="Status">
            {project && t.projectId && !t.parentId ? (
              <Select value={t.stageId ?? ""} onChange={(e) => update.mutate({ stageId: e.target.value })} className="h-8 border-transparent bg-transparent hover:border-border">
                {project.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Select value={t.status} onChange={(e) => update.mutate({ status: e.target.value as StageCategory })} className="h-8 border-transparent bg-transparent hover:border-border">
                {Object.entries(STATUS_META).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </Select>
            )}
          </Prop>
          <Prop label="Assignees">
            <AssigneePicker value={t.assignees.map((a) => a.id)} onChange={(assigneeIds) => update.mutate({ assigneeIds })} />
          </Prop>
          <Prop label="Priority">
            <div className="flex items-center gap-2">
              <PriorityIcon priority={t.priority} />
              <Select value={t.priority} onChange={(e) => update.mutate({ priority: e.target.value as Priority })} className="h-8 border-transparent bg-transparent hover:border-border">
                {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </Select>
            </div>
          </Prop>
          <Prop label="Dates">
            <div className="flex items-center gap-2">
              <Input type="date" value={t.startDate ?? ""} max={t.dueDate ?? undefined} onChange={(e) => update.mutate({ startDate: e.target.value || null })} aria-label="Start date" className="h-8 border-transparent bg-transparent hover:border-border" />
              <span className="text-muted-foreground">→</span>
              <Input
                type="date"
                value={t.dueDate ?? ""}
                min={t.startDate ?? undefined}
                onChange={(e) => update.mutate({ dueDate: e.target.value || null })}
                aria-label="Due date"
                className={cn("h-8 border-transparent bg-transparent hover:border-border", !done && t.dueDate && t.dueDate < today && "text-danger")}
              />
            </div>
          </Prop>
          {project && t.projectId ? (
            <Prop label="Milestone">
              <Select value={t.milestoneId ?? ""} onChange={(e) => update.mutate({ milestoneId: e.target.value || null })} className="h-8 border-transparent bg-transparent hover:border-border">
                <option value="">None</option>
                {project.milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Prop>
          ) : null}
          <Prop label="Labels">
            <LabelPicker value={t.labels.map((l) => l.id)} onChange={(labelIds) => update.mutate({ labelIds })} />
          </Prop>
          <Prop label="Estimate">
            <div className="flex items-center gap-2">
              <Input
                key={String(t.estimateHours)}
                type="number"
                min={0}
                step={0.5}
                defaultValue={t.estimateHours ?? ""}
                placeholder="—"
                onBlur={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  if (v !== t.estimateHours) update.mutate({ estimateHours: v });
                }}
                aria-label="Estimate in hours"
                className="h-8 w-24 border-transparent bg-transparent hover:border-border"
              />
              <span className="text-xs text-muted-foreground">hours</span>
            </div>
          </Prop>
          <Prop label="Repeat">
            <div className="flex items-center gap-2">
              <Repeat className="size-4 text-muted-foreground" />
              <Select
                value={t.recurrence ? `${t.recurrence.freq}:${t.recurrence.interval}` : ""}
                onChange={(e) => {
                  const [freq, interval] = e.target.value.split(":");
                  update.mutate({ recurrence: e.target.value ? { freq: freq as Recurrence["freq"], interval: Number(interval) } : null });
                }}
                disabled={!t.dueDate}
                title={t.dueDate ? undefined : "Set a due date first"}
                className="h-8 border-transparent bg-transparent hover:border-border"
              >
                <option value="">{t.dueDate ? "Doesn't repeat" : "Set a due date to repeat"}</option>
                <option value="daily:1">Every day</option>
                <option value="weekly:1">Every week</option>
                <option value="weekly:2">Every 2 weeks</option>
                <option value="monthly:1">Every month</option>
                <option value="monthly:3">Every quarter</option>
              </Select>
            </div>
          </Prop>
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (t.description ?? "") && update.mutate({ description: description || null })}
          placeholder="Add details, links or acceptance criteria…"
          maxLength={20000}
          aria-label="Description"
          className="field-sizing-content mt-5 min-h-24 w-full resize-none rounded-lg border border-transparent bg-transparent p-2 text-sm leading-relaxed outline-none hover:border-border focus:border-ring"
        />

        {!t.parentId ? (
          <section className="mt-6">
            <h3 className="mb-2 text-sm font-bold">
              Subtasks {data.subtasks.length ? <span className="font-mono text-xs font-normal text-muted-foreground">{data.subtasks.filter((s) => s.status === "done").length}/{data.subtasks.length}</span> : null}
            </h3>
            {data.subtasks.length ? (
              <ul className="mb-2 divide-y divide-border rounded-lg border border-border">
                {data.subtasks.map((s) => (
                  <TaskRow key={s.id} task={s} today={today} onOpen={onOpen} showProject={false} />
                ))}
              </ul>
            ) : null}
            <QuickAdd placeholder="Add a subtask" extra={{ parentId: t.id }} />
          </section>
        ) : null}

        {t.projectId ? (
          <section className="mt-6">
            <h3 className="mb-2 text-sm font-bold">Blocked by</h3>
            <ul className="space-y-1">
              {data.blockedBy.map((b) => (
                <li key={b.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                  <StatusDot status={b.status} />
                  <button type="button" onClick={() => onOpen(b.id)} className={cn("flex-1 truncate text-left", b.status === "done" && "text-muted-foreground line-through")}>
                    {taskRef(b) ? <span className="mr-2 font-mono text-xs text-muted-foreground">{taskRef(b)}</span> : null}
                    {b.title}
                  </button>
                  <button type="button" aria-label="Remove blocker" onClick={() => removeBlocker.mutate(b.id)} className="rounded p-1 text-muted-foreground hover:text-danger">
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <Select value="" onChange={(e) => e.target.value && addBlocker.mutate(e.target.value)} className="mt-1 h-8 text-muted-foreground" aria-label="Add a blocking task">
              <option value="">Add a task that must finish first…</option>
              {blockerOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {taskRef(o) ? `${taskRef(o)} · ` : ""}
                  {o.title}
                </option>
              ))}
            </Select>
            {data.blocking.length ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Blocking: {data.blocking.map((b) => taskRef(b) ?? b.title).join(", ")}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="mt-8">
          <h3 className="mb-3 text-sm font-bold">Activity</h3>
          <ol className="space-y-3 border-l border-border pl-4">
            {data.activity.map((a) => (
              <li key={a.id} className="relative text-xs text-muted-foreground">
                <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-border" />
                <span className="text-foreground">{describeActivity(a)}</span>
                <span className="ml-2 font-mono">{new Date(a.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">Comments arrive with Collaboration.</p>
        </section>
      </div>
    </>
  );
}

/** Task details in a side panel, driven by the `?task=` URL parameter so links can be shared. */
export function TaskSheet({ id, onOpenChange }: { id: string | undefined; onOpenChange: (id: string | undefined) => void }) {
  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onOpenChange(undefined)}>
      <SheetContent title="Task">{id ? <TaskBody key={id} id={id} onClose={() => onOpenChange(undefined)} onOpen={(next) => onOpenChange(next)} /> : null}</SheetContent>
    </Dialog>
  );
}
