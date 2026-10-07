import { Avatar, cn } from "@operant/ui";
import { CircleCheck, GitBranch, Link2, Repeat } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api.ts";
import { useApiMutation } from "../../lib/people.ts";
import { type Person, PRIORITY_META, type Priority, STATUS_META, type StageCategory, type TaskCard, taskRef, WORK_KEYS } from "../../lib/work.ts";

/** Three bars, filled by urgency (Linear-style), or an alert mark for urgent. */
export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const meta = PRIORITY_META[priority];
  if (priority === "urgent") {
    return (
      <span title={meta.label} className={cn("inline-flex size-4 items-center justify-center rounded-[4px] bg-error-solid font-mono text-[10px] font-bold text-white", className)}>
        !
      </span>
    );
  }
  const filled = { high: 3, medium: 2, low: 1, none: 0 }[priority];
  return (
    <span title={meta.label} className={cn("inline-flex h-4 w-4 items-end gap-[2px]", className)}>
      {[1, 2, 3].map((i) => (
        <span key={i} className="w-[3px] rounded-sm" style={{ height: `${4 + i * 3}px`, background: i <= filled ? meta.color : "var(--color-border-primary)" }} />
      ))}
    </span>
  );
}

export function StatusDot({ status, className }: { status: StageCategory; className?: string }) {
  const color = STATUS_META[status].color;
  return (
    <span
      title={STATUS_META[status].label}
      className={cn("inline-block size-3.5 shrink-0 rounded-full border-2", className)}
      style={{
        borderColor: color,
        background:
          status === "done" ? color : status === "review" ? `conic-gradient(${color} 75%, transparent 0)` : status === "in_progress" ? `conic-gradient(${color} 50%, transparent 0)` : "transparent",
      }}
    />
  );
}

export function AssigneeStack({ people, max = 3, size = "size-6" }: { people: Person[]; max?: number; size?: string }) {
  if (!people.length) return null;
  return (
    <span className="flex -space-x-1.5" title={people.map((p) => p.fullName).join(", ")}>
      {people.slice(0, max).map((p) => (
        <Avatar key={p.id} name={p.fullName} src={p.image} className={cn(size, "border-2 border-bg-primary text-[10px]")} />
      ))}
      {people.length > max ? (
        <span className={cn(size, "flex items-center justify-center rounded-full border-2 border-bg-primary bg-secondary font-mono text-[9px]")}>+{people.length - max}</span>
      ) : null}
    </span>
  );
}

export function dueLabel(date: string, today: string) {
  const diff = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function DueChip({ date, done, today }: { date: string | null; done: boolean; today: string }) {
  if (!date) return null;
  const overdue = !done && date < today;
  const soon = !done && !overdue && Date.parse(date) - Date.parse(today) <= 2 * 86_400_000;
  return (
    <span className={cn("font-mono text-xs", overdue ? "text-error-primary" : soon ? "text-work" : "text-tertiary")}>{dueLabel(date, today)}</span>
  );
}

export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A compact row for lists (My work, project list view). */
export function TaskRow({
  task,
  today,
  onOpen,
  showProject = true,
}: {
  task: TaskCard;
  today: string;
  onOpen: (id: string) => void;
  showProject?: boolean;
}) {
  const done = task.status === "done";
  const toggle = useApiMutation(
    () => api(`tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: done ? "todo" : "done" }) }),
    { invalidate: WORK_KEYS },
  );
  const ref = taskRef(task);
  return (
    <li className="group flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50">
      <button
        type="button"
        aria-label={done ? `Reopen "${task.title}"` : `Complete "${task.title}"`}
        onClick={() => toggle.mutate(undefined)}
        disabled={toggle.isPending}
        className="shrink-0 rounded-full"
      >
        {done ? <CircleCheck className="size-[18px] text-success-primary" /> : <StatusDot status={task.status} className="size-[18px] transition-colors group-hover:border-success-500" />}
      </button>
      <button type="button" onClick={() => onOpen(task.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <PriorityIcon priority={task.priority} />
        {ref ? <span className="hidden font-mono text-xs text-tertiary sm:inline">{ref}</span> : null}
        <span className={cn("truncate text-sm", done && "text-tertiary line-through")}>{task.title}</span>
        {task.recurrence ? <Repeat className="size-3.5 shrink-0 text-tertiary" aria-label="Repeats" /> : null}
        {task.blocked ? <Link2 className="size-3.5 shrink-0 text-error-primary" aria-label="Blocked" /> : null}
        {task.subtasks.total ? (
          <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-tertiary">
            <GitBranch className="size-3" />
            {task.subtasks.done}/{task.subtasks.total}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {task.labels.slice(0, 2).map((l) => (
            <span key={l.id} className="hidden items-center gap-1 text-xs text-tertiary md:inline-flex">
              <span className="size-2 rounded-full" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
          {showProject && task.projectName ? (
            <span className="hidden max-w-32 truncate rounded-md bg-secondary px-2 py-0.5 text-xs text-tertiary lg:inline" style={{ borderLeft: `2px solid ${task.projectColor}` }}>
              {task.projectName}
            </span>
          ) : null}
          {!showProject && task.source === "onboarding" ? <span className="text-xs text-people">Onboarding</span> : null}
          <DueChip date={task.dueDate} done={done} today={today} />
          <AssigneeStack people={task.assignees} />
        </span>
      </button>
    </li>
  );
}

/** Inline "add a task" input. Enter creates; Escape clears. */
export function QuickAdd({
  placeholder = "Add a task",
  extra,
  onCreated,
  className,
}: {
  placeholder?: string;
  extra: Record<string, unknown>;
  onCreated?: (id: string) => void;
  className?: string;
}) {
  const [title, setTitle] = useState("");
  const create = useApiMutation(
    (t: string) => api<{ task: { id: string } }>("tasks", { method: "POST", body: JSON.stringify({ title: t, ...extra }) }),
    { invalidate: WORK_KEYS, onSuccess: (r) => onCreated?.(r.task.id) },
  );
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        create.mutate(t);
        setTitle("");
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setTitle("")}
        placeholder={placeholder}
        maxLength={300}
        className="h-9 w-full rounded-lg border border-dashed border-primary bg-transparent px-3 text-sm placeholder:text-tertiary focus:border-solid focus:border-brand focus:bg-primary focus:outline-none"
      />
    </form>
  );
}
