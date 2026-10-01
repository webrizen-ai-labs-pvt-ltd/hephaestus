import { addDays, isoWeekday } from "@hephaestus/core";
import { Card, EmptyState, Skeleton } from "@hephaestus/ui";
import { CheckCircle2, ListTodo } from "lucide-react";
import { PageHeader } from "../../components/app-shell.tsx";
import { type TaskCard, useMyWork } from "../../lib/work.ts";
import { useOpenTask, WorkBody } from "./layout.tsx";
import { QuickAdd, TaskRow } from "./task-bits.tsx";

function bucket(t: TaskCard, today: string) {
  if (t.status === "done") return "done";
  if (!t.dueDate) return "later";
  if (t.dueDate < today) return "overdue";
  if (t.dueDate === today) return "today";
  const sunday = addDays(today, 7 - isoWeekday(today));
  return t.dueDate <= sunday ? "week" : "upcoming";
}

const SECTIONS = [
  { key: "overdue", title: "Overdue", tone: "text-danger" },
  { key: "today", title: "Today", tone: "text-work" },
  { key: "week", title: "Later this week", tone: "" },
  { key: "upcoming", title: "Upcoming", tone: "" },
  { key: "later", title: "No due date", tone: "text-muted-foreground" },
  { key: "done", title: "Recently done", tone: "text-success" },
] as const;

export function MyWorkPage() {
  const { data, isLoading } = useMyWork();
  const openTask = useOpenTask();
  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const tasks = data?.tasks ?? [];
  const open = tasks.filter((t) => t.status !== "done");

  return (
    <WorkBody className="max-w-5xl">
      <PageHeader
        title="My work"
        description={data?.linked === false ? "Your account isn't linked to an employee profile yet." : `${open.length} open ${open.length === 1 ? "task" : "tasks"} assigned to you`}
      />
      <QuickAdd placeholder="Add a personal task and press Enter" extra={{}} onCreated={(id) => openTask(id)} />

      {isLoading ? <Skeleton className="h-64 w-full" /> : null}
      {!isLoading && tasks.length === 0 ? (
        <Card>
          <EmptyState icon={<ListTodo />} title="Nothing on your plate" description="Tasks assigned to you across every project show up here." />
        </Card>
      ) : null}

      {SECTIONS.map((s) => {
        const list = tasks.filter((t) => bucket(t, today) === s.key);
        if (!list.length) return null;
        return (
          <section key={s.key}>
            <h2 className={`mb-2 flex items-center gap-2 text-sm font-bold ${s.tone}`}>
              {s.key === "done" ? <CheckCircle2 className="size-4" /> : null}
              {s.title}
              <span className="font-mono text-xs font-normal text-muted-foreground">{list.length}</span>
            </h2>
            <Card>
              <ul className="divide-y divide-border">
                {list.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} onOpen={openTask} />
                ))}
              </ul>
            </Card>
          </section>
        );
      })}
    </WorkBody>
  );
}
