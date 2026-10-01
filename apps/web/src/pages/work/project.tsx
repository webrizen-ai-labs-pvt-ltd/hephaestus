import { can } from "@hephaestus/core";
import { Badge, Button, Card, cn, EmptyState, Input, Select, Skeleton } from "@hephaestus/ui";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, ChevronLeft, ChevronRight, Flag, Kanban, List, MessagesSquare, Plus, Search, Settings, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type Me } from "../../lib/api.ts";
import { formatDate, useApiMutation, useEmployees } from "../../lib/people.ts";
import {
  PRIORITY_META,
  type Priority,
  type ProjectDetail,
  STATUS_META,
  type StageCategory,
  type TaskCard,
  useLabels,
  useProject,
  useProjects,
  useTasks,
  WORK_KEYS,
} from "../../lib/work.ts";
import { Thread } from "../../components/collab/thread.tsx";
import { Board } from "./board.tsx";
import { useOpenTask, WorkBody } from "./layout.tsx";
import { ProjectDialog } from "./projects.tsx";
import { QuickAdd, StatusDot, TaskRow, todayLocal } from "./task-bits.tsx";

type View = "board" | "list" | "calendar" | "milestones" | "discussion" | "settings";

function Filters({
  q,
  setQ,
  assignee,
  setAssignee,
  priority,
  setPriority,
  label,
  setLabel,
}: {
  q: string;
  setQ: (v: string) => void;
  assignee: string;
  setAssignee: (v: string) => void;
  priority: string;
  setPriority: (v: string) => void;
  label: string;
  setLabel: (v: string) => void;
}) {
  const { data: people } = useEmployees();
  const { data: labels } = useLabels();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tasks" className="h-8 pl-9" />
      </div>
      <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-8 w-auto" aria-label="Assignee">
        <option value="">Anyone</option>
        <option value="none">Unassigned</option>
        {people?.employees.map((p) => (
          <option key={p.id} value={p.id}>
            {p.fullName}
          </option>
        ))}
      </Select>
      <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="h-8 w-auto" aria-label="Priority">
        <option value="">Any priority</option>
        {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_META[p].label}
          </option>
        ))}
      </Select>
      <Select value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 w-auto" aria-label="Label">
        <option value="">Any label</option>
        {labels?.labels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

function ListView({ detail, tasks, today, onOpen, canCreate }: { detail: ProjectDetail; tasks: TaskCard[]; today: string; onOpen: (id: string) => void; canCreate: boolean }) {
  return (
    <div className="space-y-4">
      {detail.stages.map((s) => {
        const list = tasks.filter((t) => t.stageId === s.id).sort((a, b) => a.position - b.position);
        return (
          <Card key={s.id}>
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="size-2.5 rounded-full" style={{ background: s.color ?? undefined }} />
              <span className="text-sm font-medium">{s.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{list.length}</span>
            </div>
            <ul className="divide-y divide-border">
              {list.map((t) => (
                <TaskRow key={t.id} task={t} today={today} onOpen={onOpen} showProject={false} />
              ))}
            </ul>
            {canCreate && s.category !== "done" ? (
              <div className="p-2">
                <QuickAdd placeholder="+ Add task" extra={{ projectId: detail.project.id, stageId: s.id }} />
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function CalendarView({ tasks, today, onOpen }: { tasks: TaskCard[]; today: string; onOpen: (id: string) => void }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(Date.UTC(cursor.y, cursor.m, d)).toISOString().slice(0, 10));
  while (cells.length % 7) cells.push(null);
  const move = (n: number) => setCursor((c) => {
    const d = new Date(c.y, c.m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const undated = tasks.filter((t) => !t.dueDate && t.status !== "done").length;

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="flex-1 font-display text-lg font-bold">{first.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
        {undated ? <span className="text-xs text-muted-foreground">{undated} without a due date</span> : null}
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
          const due = date ? tasks.filter((t) => t.dueDate === date) : [];
          return (
            <div key={i} className={cn("min-h-28 bg-surface p-1.5", !date && "bg-surface-2/50")}>
              {date ? (
                <>
                  <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full font-mono", date === today && "bg-primary text-primary-foreground")}>{Number(date.slice(8))}</div>
                  {due.slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpen(t.id)}
                      className={cn("mb-0.5 flex w-full items-center gap-1 truncate rounded bg-surface-2 px-1.5 py-0.5 text-left text-[11px] hover:bg-input", t.status === "done" && "text-muted-foreground line-through")}
                    >
                      <StatusDot status={t.status} className="size-2.5 border" />
                      <span className="truncate">{t.title}</span>
                    </button>
                  ))}
                  {due.length > 4 ? <div className="text-[11px] text-muted-foreground">+{due.length - 4} more</div> : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MilestonesView({ detail, canEdit, today }: { detail: ProjectDetail; canEdit: boolean; today: string }) {
  const [name, setName] = useState("");
  const [due, setDue] = useState("");
  const add = useApiMutation(
    () => api(`projects/${detail.project.id}/milestones`, { method: "POST", body: JSON.stringify({ name, dueDate: due || null }) }),
    { invalidate: WORK_KEYS, success: "Milestone added", onSuccess: () => (setName(""), setDue("")) },
  );
  const toggle = useApiMutation((v: { id: string; completed: boolean }) => api(`milestones/${v.id}`, { method: "PATCH", body: JSON.stringify({ completed: v.completed }) }), {
    invalidate: WORK_KEYS,
  });
  const remove = useApiMutation((id: string) => api(`milestones/${id}`, { method: "DELETE" }), { invalidate: WORK_KEYS, success: "Milestone removed" });

  return (
    <div className="space-y-4">
      {detail.milestones.length === 0 ? (
        <Card>
          <EmptyState icon={<Flag />} title="No milestones yet" description="Milestones mark the big moments, like a launch or a client hand-off. Later, they can trigger invoices." />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {detail.milestones.map((m) => {
            const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
            const late = !m.completedAt && m.dueDate && m.dueDate < today;
            return (
              <Card key={m.id} className="p-5">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => toggle.mutate({ id: m.id, completed: !m.completedAt })}
                    aria-label={m.completedAt ? "Reopen milestone" : "Complete milestone"}
                    className={cn("mt-0.5 flex size-5 items-center justify-center rounded-full border-2", m.completedAt ? "border-success bg-success text-white" : "border-input")}
                  >
                    {m.completedAt ? <Check className="size-3" /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h3 className={cn("font-bold", m.completedAt && "text-muted-foreground line-through")}>{m.name}</h3>
                    <p className={cn("text-xs", late ? "text-danger" : "text-muted-foreground")}>
                      {m.dueDate ? `Due ${formatDate(m.dueDate)}` : "No due date"}
                      {m.completedAt ? ` · completed ${formatDate(m.completedAt.slice(0, 10), { day: "numeric", month: "short" })}` : ""}
                    </p>
                  </div>
                  {canEdit ? (
                    <button type="button" aria-label={`Delete ${m.name}`} onClick={() => confirm(`Delete ${m.name}? Its tasks stay in the project.`) && remove.mutate(m.id)} className="rounded p-1 text-muted-foreground hover:text-danger">
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {m.done}/{m.total} tasks
                  </span>
                  <span className="font-mono">{pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-work" style={{ width: `${pct}%` }} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {canEdit ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add.mutate(undefined);
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New milestone, e.g. Beta launch" maxLength={120} className="flex-1" />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-44" aria-label="Due date" />
          <Button type="submit">
            <Plus /> Add
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function SettingsView({ detail, me }: { detail: ProjectDetail; me: Me }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [newStage, setNewStage] = useState({ name: "", category: "in_progress" as StageCategory });
  const { data: summaries } = useProjects("current");
  const summary = summaries?.projects.find((p) => p.id === detail.project.id);
  const canArchive = can(me.org.permissions, "project", "archive");
  const id = detail.project.id;

  const patchStage = useApiMutation((v: { id: string; body: object }) => api(`stages/${v.id}`, { method: "PATCH", body: JSON.stringify(v.body) }), { invalidate: WORK_KEYS });
  const addStage = useApiMutation(() => api(`projects/${id}/stages`, { method: "POST", body: JSON.stringify(newStage) }), {
    invalidate: WORK_KEYS,
    success: "Stage added",
    onSuccess: () => setNewStage({ name: "", category: "in_progress" }),
  });
  const reorder = useApiMutation((stageIds: string[]) => api(`projects/${id}/stages/order`, { method: "PUT", body: JSON.stringify({ stageIds }) }), { invalidate: WORK_KEYS });
  const removeStage = useApiMutation((v: { id: string; moveTo: string }) => api(`stages/${v.id}?moveTo=${v.moveTo}`, { method: "DELETE" }), {
    invalidate: WORK_KEYS,
    success: "Stage removed",
  });
  const setStatus = useApiMutation((status: string) => api(`projects/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }), {
    invalidate: WORK_KEYS,
    onSuccess: (_, status) => {
      toast.success(status === "archived" ? "Project archived" : "Project updated");
      if (status === "archived") navigate({ to: "/work/projects" });
    },
  });

  const stages = detail.stages;
  const move = (i: number, d: -1 | 1) => {
    const ids = stages.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d]!, ids[i]!];
    reorder.mutate(ids);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-5">
        <h2 className="font-bold">Stages</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your workflow, left to right. The type decides what counts as started or done in reports.</p>
        <ul className="mt-4 space-y-2">
          {stages.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
              <input
                type="color"
                value={s.color ?? "#8a8178"}
                onChange={(e) => patchStage.mutate({ id: s.id, body: { color: e.target.value } })}
                aria-label={`${s.name} colour`}
                className="size-7 cursor-pointer rounded border-0 bg-transparent"
              />
              <Input
                defaultValue={s.name}
                maxLength={40}
                onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && patchStage.mutate({ id: s.id, body: { name: e.target.value.trim() } })}
                className="h-8 flex-1"
                aria-label="Stage name"
              />
              <Select value={s.category} onChange={(e) => patchStage.mutate({ id: s.id, body: { category: e.target.value } })} className="h-8 w-36" aria-label="Stage type">
                {Object.entries(STATUS_META).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <span className="flex">
                <Button size="icon" variant="ghost" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Move later" disabled={i === stages.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${s.name}`}
                  disabled={stages.length <= 1}
                  onClick={() => {
                    const target = stages.find((x) => x.id !== s.id && x.category === s.category) ?? stages.find((x) => x.id !== s.id)!;
                    if (confirm(`Delete "${s.name}"? Its tasks move to "${target.name}".`)) removeStage.mutate({ id: s.id, moveTo: target.id });
                  }}
                >
                  <Trash2 />
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newStage.name.trim()) addStage.mutate(undefined);
          }}
        >
          <Input value={newStage.name} onChange={(e) => setNewStage({ ...newStage, name: e.target.value })} placeholder="New stage, e.g. Client approval" maxLength={40} />
          <Select value={newStage.category} onChange={(e) => setNewStage({ ...newStage, category: e.target.value as StageCategory })} className="w-36" aria-label="Stage type">
            {Object.entries(STATUS_META).map(([k, m]) => (
              <option key={k} value={k}>
                {m.label}
              </option>
            ))}
          </Select>
          <Button type="submit" aria-label="Add stage">
            <Plus />
          </Button>
        </form>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="font-bold">Details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Lead</dt>
              <dd>{detail.project.leadName ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Goal</dt>
              <dd className="truncate">{detail.project.goalTitle ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Dates</dt>
              <dd>
                {formatDate(detail.project.startDate, { day: "numeric", month: "short" })} → {formatDate(detail.project.dueDate, { day: "numeric", month: "short" })}
              </dd>
            </div>
          </dl>
          <Button className="mt-4 w-full" onClick={() => setEditing(true)}>
            <Settings /> Edit details
          </Button>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold">Status</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {detail.project.status !== "active" ? <Button size="sm" onClick={() => setStatus.mutate("active")}>Mark active</Button> : null}
            {detail.project.status === "active" ? <Button size="sm" onClick={() => setStatus.mutate("paused")}>Pause</Button> : null}
            {detail.project.status !== "completed" ? <Button size="sm" onClick={() => setStatus.mutate("completed")}>Mark completed</Button> : null}
            {canArchive && detail.project.status !== "archived" ? (
              <Button size="sm" variant="ghost" onClick={() => confirm("Archive this project? It's hidden from lists and My work.") && setStatus.mutate("archived")}>
                Archive
              </Button>
            ) : null}
          </div>
        </Card>
      </div>
      {editing && summary ? <ProjectDialog open onOpenChange={setEditing} project={summary} /> : null}
    </div>
  );
}

export function ProjectPage({ me }: { me: Me }) {
  const { id } = useParams({ strict: false }) as { id: string };
  const search = useSearch({ strict: false }) as { view?: View };
  const navigate = useNavigate();
  const openTask = useOpenTask();
  const { data: detail, isLoading, error } = useProject(id);
  const { data: taskData } = useTasks({ projectId: id });
  const [q, setQ] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("");
  const [label, setLabel] = useState("");
  const today = todayLocal();
  const view: View = search.view ?? "board";
  const canCreate = can(me.org.permissions, "task", "create");
  const canEdit = can(me.org.permissions, "project", "update");

  const tasks = useMemo(
    () =>
      (taskData?.tasks ?? []).filter(
        (t) =>
          (!q || t.title.toLowerCase().includes(q.toLowerCase())) &&
          (!assignee || (assignee === "none" ? t.assignees.length === 0 : t.assignees.some((a) => a.id === assignee))) &&
          (!priority || t.priority === priority) &&
          (!label || t.labels.some((l) => l.id === label)),
      ),
    [taskData, q, assignee, priority, label],
  );

  if (isLoading) {
    return (
      <WorkBody>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </WorkBody>
    );
  }
  if (error || !detail) {
    return (
      <WorkBody>
        <p className="text-sm text-muted-foreground">{error?.message ?? "Project not found"}</p>
      </WorkBody>
    );
  }

  const all = taskData?.tasks ?? [];
  const done = all.filter((t) => t.status === "done").length;
  const overdue = all.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const views = [
    { key: "board", label: "Board", icon: Kanban },
    { key: "list", label: "List", icon: List },
    { key: "calendar", label: "Calendar", icon: CalendarDays },
    { key: "milestones", label: "Milestones", icon: Flag },
    { key: "discussion", label: "Discussion", icon: MessagesSquare },
    ...(canEdit ? [{ key: "settings", label: "Settings", icon: Settings }] : []),
  ] as const;

  return (
    <WorkBody className="space-y-5">
      <Link to="/work/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {me.settings.terms.project.many}
      </Link>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold text-white" style={{ background: detail.project.color }}>
            {detail.project.key}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold sm:text-3xl">{detail.project.name}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {[detail.project.leadName && `Led by ${detail.project.leadName}`, detail.project.dueDate && `due ${formatDate(detail.project.dueDate, { day: "numeric", month: "short" })}`]
                .filter(Boolean)
                .join(" · ") || detail.project.description || " "}
            </p>
          </div>
          {detail.project.status !== "active" ? <Badge className="capitalize">{detail.project.status}</Badge> : null}
        </div>
        <div className="flex items-center gap-4 text-sm">
          {overdue ? <span className="text-danger">{overdue} overdue</span> : null}
          <span className="text-muted-foreground">
            {done}/{all.length} done
          </span>
          <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: detail.project.color }} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex gap-1 overflow-x-auto text-sm">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => navigate({ to: "/work/projects/$id", params: { id }, search: { view: v.key === "board" ? undefined : v.key }, replace: true })}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5",
                view === v.key ? "bg-surface-2 font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <v.icon className="size-4" />
              {v.label}
            </button>
          ))}
        </div>
        {view === "board" || view === "list" || view === "calendar" ? (
          <Filters q={q} setQ={setQ} assignee={assignee} setAssignee={setAssignee} priority={priority} setPriority={setPriority} label={label} setLabel={setLabel} />
        ) : null}
      </div>

      {view === "board" ? <Board stages={detail.stages} tasks={tasks} today={today} onOpen={openTask} projectId={id} canCreate={canCreate} /> : null}
      {view === "list" ? <ListView detail={detail} tasks={tasks} today={today} onOpen={openTask} canCreate={canCreate} /> : null}
      {view === "calendar" ? <CalendarView tasks={tasks} today={today} onOpen={openTask} /> : null}
      {view === "milestones" ? <MilestonesView detail={detail} canEdit={canEdit} today={today} /> : null}
      {view === "discussion" ? (
        <Card className="max-w-3xl p-4 sm:p-6">
          <Thread type="project" id={id} placeholder={`Discuss ${detail.project.name}, or @mention someone`} />
        </Card>
      ) : null}
      {view === "settings" && canEdit ? <SettingsView detail={detail} me={me} /> : null}
    </WorkBody>
  );
}

