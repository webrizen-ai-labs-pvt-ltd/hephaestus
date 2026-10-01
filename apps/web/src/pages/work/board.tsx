import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@hephaestus/ui";
import { useQueryClient } from "@tanstack/react-query";
import { GitBranch, Link2, Repeat } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api.ts";
import { type Stage, type TaskCard, taskRef, WORK_KEYS } from "../../lib/work.ts";
import { AssigneeStack, DueChip, PriorityIcon, QuickAdd } from "./task-bits.tsx";

type Columns = Record<string, string[]>;

function CardFace({ task, today, dragging }: { task: TaskCard; today: string; dragging?: boolean }) {
  const ref = taskRef(task);
  const done = task.status === "done";
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-3 text-left transition-shadow",
        dragging ? "rotate-2 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.6)]" : "hover:border-input",
      )}
    >
      <div className="flex items-center gap-2">
        <PriorityIcon priority={task.priority} />
        {ref ? <span className="font-mono text-[11px] text-muted-foreground">{ref}</span> : null}
        <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          {task.recurrence ? <Repeat className="size-3.5" aria-label="Repeats" /> : null}
          {task.blocked ? <Link2 className="size-3.5 text-danger" aria-label="Blocked" /> : null}
        </span>
      </div>
      <p className={cn("mt-1.5 text-sm leading-snug", done && "text-muted-foreground line-through")}>{task.title}</p>
      {task.labels.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-2.5 flex items-center gap-2">
        <DueChip date={task.dueDate} done={done} today={today} />
        {task.subtasks.total ? (
          <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
            <GitBranch className="size-3" />
            {task.subtasks.done}/{task.subtasks.total}
          </span>
        ) : null}
        <span className="ml-auto">
          <AssigneeStack people={task.assignees} size="size-5" />
        </span>
      </div>
    </div>
  );
}

function SortableCard({ task, today, onOpen }: { task: TaskCard; today: string; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-manipulation", isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task.id);
        listeners?.onKeyDown?.(e);
      }}
    >
      <CardFace task={task} today={today} />
    </div>
  );
}

function Column({
  stage,
  ids,
  byId,
  today,
  onOpen,
  projectId,
  canCreate,
}: {
  stage: Stage;
  ids: string[];
  byId: Map<string, TaskCard>;
  today: string;
  onOpen: (id: string) => void;
  projectId: string;
  canCreate: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="size-2.5 rounded-full" style={{ background: stage.color ?? "var(--muted-foreground)" }} />
        <span className="text-sm font-medium">{stage.name}</span>
        <span className="font-mono text-xs text-muted-foreground">{ids.length}</span>
      </div>
      <div ref={setNodeRef} className={cn("flex min-h-24 flex-1 flex-col gap-2 rounded-xl bg-surface-2/40 p-2 transition-colors", isOver && "bg-surface-2")}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const t = byId.get(id);
            return t ? <SortableCard key={id} task={t} today={today} onOpen={onOpen} /> : null;
          })}
        </SortableContext>
        {canCreate && stage.category !== "done" ? <QuickAdd placeholder="+ Add task" extra={{ projectId, stageId: stage.id }} /> : null}
      </div>
    </div>
  );
}

export function Board({
  stages,
  tasks,
  today,
  onOpen,
  projectId,
  canCreate,
}: {
  stages: Stage[];
  tasks: TaskCard[];
  today: string;
  onOpen: (id: string) => void;
  projectId: string;
  canCreate: boolean;
}) {
  const qc = useQueryClient();
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const serverColumns = useMemo(() => {
    const cols: Columns = Object.fromEntries(stages.map((s) => [s.id, [] as string[]]));
    for (const t of [...tasks].sort((a, b) => a.position - b.position)) {
      const key = t.stageId && cols[t.stageId] ? t.stageId : stages[0]?.id;
      if (key) cols[key]!.push(t.id);
    }
    return cols;
  }, [stages, tasks]);
  const [columns, setColumns] = useState<Columns>(serverColumns);
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeId) setColumns(serverColumns);
  }, [serverColumns, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnOf = (id: string) => (id.startsWith("stage:") ? id.slice(6) : Object.keys(columns).find((k) => columns[k]!.includes(id)));

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  // Moving across columns happens live while dragging, so the card shows where it'll land.
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = columnOf(String(active.id));
    const to = columnOf(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const fromIds = cols[from]!.filter((x) => x !== active.id);
      const toIds = [...cols[to]!];
      const overIndex = toIds.indexOf(String(over.id));
      toIds.splice(overIndex >= 0 ? overIndex : toIds.length, 0, String(active.id));
      return { ...cols, [from]: fromIds, [to]: toIds };
    });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    let cols = columns;
    const col = columnOf(id);
    if (col && overId && !overId.startsWith("stage:") && overId !== id) {
      const list = cols[col]!;
      const from = list.indexOf(id);
      const to = list.indexOf(overId);
      if (from >= 0 && to >= 0) {
        const next = [...list];
        next.splice(to, 0, ...next.splice(from, 1));
        cols = { ...cols, [col]: next };
        setColumns(cols);
      }
    }
    setActiveId(null);
    if (!col) return;
    const list = cols[col]!;
    const idx = list.indexOf(id);
    const task = byId.get(id);
    const moved = task?.stageId !== col || serverColumns[col]?.indexOf(id) !== idx;
    if (!moved) return;
    try {
      await api(`tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ stageId: col, beforeId: list[idx - 1] ?? null, afterId: list[idx + 1] ?? null }),
      });
    } catch (err) {
      toast.error((err as Error).message);
      setColumns(serverColumns);
    }
    await Promise.all(WORK_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })));
  };

  const active = activeId ? byId.get(activeId) : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), setColumns(serverColumns))}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((s) => (
          <Column key={s.id} stage={s} ids={columns[s.id] ?? []} byId={byId} today={today} onOpen={onOpen} projectId={projectId} canCreate={canCreate} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>{active ? <CardFace task={active} today={today} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
