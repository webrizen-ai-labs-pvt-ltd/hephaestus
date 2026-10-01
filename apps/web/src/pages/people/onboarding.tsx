import { can } from "@hephaestus/core";
import { Avatar, Badge, Button, Card, cn, Dialog, DialogContent, EmptyState, Field, Input, ProgressRing, Select, Textarea } from "@hephaestus/ui";
import { Link } from "@tanstack/react-router";
import { Check, ClipboardList, GripVertical, Pencil, Plus, Rocket, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/app-shell.tsx";
import { api, type Me } from "../../lib/api.ts";
import {
  formatDate,
  type OnboardingRun,
  type OnboardingTemplate,
  type OnboardingTemplateItem,
  PEOPLE_KEYS,
  useApiMutation,
  useEmployees,
  useMyEmployee,
  useOnboardingRuns,
  useOnboardingTemplates,
} from "../../lib/people.ts";
import { PageBody } from "./layout.tsx";

const ONBOARDING_KEYS = ["onboarding-runs", "onboarding-my-items", "onboarding-templates", ...PEOPLE_KEYS];

function StartDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: people } = useEmployees({ status: "current" });
  const { data: templates } = useOnboardingTemplates();
  const [employeeId, setEmployee] = useState("");
  const [templateId, setTemplate] = useState("");
  const [startDate, setStart] = useState(new Date().toISOString().slice(0, 10));
  const tpl = templateId || templates?.templates[0]?.id || "";

  const start = useApiMutation(
    () => api("onboarding/runs", { method: "POST", body: JSON.stringify({ employeeId, templateId: tpl, startDate }) }),
    { invalidate: ONBOARDING_KEYS, success: "Onboarding started. Everyone with steps has been notified.", onSuccess: () => onOpenChange(false) },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Start onboarding"
        description="Steps go to the new joiner and their manager, with due dates from the start date."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!employeeId || !tpl || start.isPending} onClick={() => start.mutate(undefined)}>
              <Rocket /> Start
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="New joiner" hint="Add them to the directory first, with their manager.">
            <Select value={employeeId} onChange={(e) => setEmployee(e.target.value)}>
              <option value="">Choose someone</option>
              {people?.employees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                  {p.managerName ? ` (reports to ${p.managerName})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Checklist">
            <Select value={tpl} onChange={(e) => setTemplate(e.target.value)}>
              {templates?.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.items.length} steps)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({ open, onOpenChange, template }: { open: boolean; onOpenChange: (o: boolean) => void; template?: OnboardingTemplate }) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [items, setItems] = useState<OnboardingTemplateItem[]>(
    template?.items ?? [{ title: "", assignee: "employee", dueOffsetDays: 0 }],
  );
  const [error, setError] = useState<string | null>(null);

  const save = useApiMutation(
    () => {
      const body = JSON.stringify({ name, description: description || null, items: items.filter((i) => i.title.trim()) });
      return template ? api(`onboarding/templates/${template.id}`, { method: "PATCH", body }) : api("onboarding/templates", { method: "POST", body });
    },
    { invalidate: ONBOARDING_KEYS, success: "Checklist saved", onSuccess: () => onOpenChange(false) },
  );
  const update = (i: number, patch: Partial<OnboardingTemplateItem>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={template ? "Edit checklist" : "New checklist"}
        className="w-[min(720px,calc(100vw-32px))]"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={save.isPending} onClick={() => (name.trim() ? save.mutate(undefined) : setError("Enter a name"))}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Name" error={error}>
            <Input value={name} onChange={(e) => (setName(e.target.value), setError(null))} placeholder="Engineering onboarding" maxLength={80} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="min-h-14" />
          </Field>
          <div>
            <div className="mb-2 text-sm font-medium">Steps</div>
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li key={i} className="grid grid-cols-[16px_1fr] gap-2 rounded-lg border border-border p-2 sm:grid-cols-[16px_1fr_140px_110px_32px] sm:items-center">
                  <GripVertical className="size-4 text-muted-foreground" />
                  <Input value={it.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="What needs doing" maxLength={200} aria-label="Step" />
                  <Select value={it.assignee} onChange={(e) => update(i, { assignee: e.target.value as "employee" | "manager" })} aria-label="Who">
                    <option value="employee">New joiner</option>
                    <option value="manager">Their manager</option>
                  </Select>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={it.dueOffsetDays}
                      min={-60}
                      max={365}
                      onChange={(e) => update(i, { dueOffsetDays: Number(e.target.value) || 0 })}
                      aria-label="Due, days after start"
                    />
                    <span className="text-xs text-muted-foreground">days</span>
                  </div>
                  <button type="button" aria-label="Remove step" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="justify-self-end rounded p-1.5 text-muted-foreground hover:text-danger">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setItems((l) => [...l, { title: "", assignee: "employee", dueOffsetDays: 0 }])}>
              <Plus /> Add step
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">Due dates count from the start date; use a negative number for steps before day one.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RunCard({ run, myEmployeeId, canManage }: { run: OnboardingRun; myEmployeeId?: string; canManage: boolean }) {
  const toggle = useApiMutation(
    (v: { id: string; done: boolean }) => api(`onboarding/items/${v.id}`, { method: "PATCH", body: JSON.stringify({ done: v.done }) }),
    { invalidate: ONBOARDING_KEYS },
  );
  const today = new Date().toISOString().slice(0, 10);
  const pct = Math.round((run.done / Math.max(1, run.total)) * 100);
  const overdueCount = run.items.filter((it) => !it.doneAt && it.dueDate && it.dueDate < today).length;
  const day = Math.max(1, Math.round((Date.parse(today) - Date.parse(run.startDate)) / 86_400_000) + 1);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-border bg-gradient-to-r from-people/10 to-transparent p-5">
        <Avatar name={run.employeeName} className="size-12 text-sm" />
        <div className="min-w-0 flex-1">
          <Link to="/people/$id" params={{ id: run.employeeId }} className="font-display text-lg font-bold hover:underline">
            {run.employeeName}
          </Link>
          <div className="text-xs text-muted-foreground">
            {run.name} · started {formatDate(run.startDate, { day: "numeric", month: "short" })}
            {!run.completedAt ? ` · day ${day}` : ""}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground">
              {run.done} of {run.total} steps
            </span>
            {overdueCount ? <span className="rounded-full bg-danger/12 px-2 py-0.5 text-danger">{overdueCount} overdue</span> : null}
          </div>
        </div>
        {run.completedAt ? (
          <Badge tone="people">Complete</Badge>
        ) : (
          <ProgressRing value={pct} size={52} stroke={5} color="var(--people)">
            <span className="text-[11px]">{pct}%</span>
          </ProgressRing>
        )}
      </div>
      <ul className="space-y-0.5 p-4">

        {run.items.map((it) => {
          const mine = it.assigneeEmployeeId === myEmployeeId;
          const allowed = mine || canManage;
          const overdue = !it.doneAt && it.dueDate && it.dueDate < today;
          return (
            <li key={it.id} className="flex items-center gap-3 rounded-md px-1 py-1.5 text-sm">
              <button
                type="button"
                disabled={!allowed || toggle.isPending}
                onClick={() => toggle.mutate({ id: it.id, done: !it.doneAt })}
                aria-label={it.doneAt ? `Mark "${it.title}" not done` : `Mark "${it.title}" done`}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                  it.doneAt ? "border-people bg-people text-white" : "border-input",
                  allowed ? "hover:border-people" : "cursor-not-allowed opacity-50",
                )}
              >
                {it.doneAt ? <Check className="size-3.5" /> : null}
              </button>
              <span className={cn("flex-1", it.doneAt && "text-muted-foreground line-through")}>{it.title}</span>
              <span className={cn("hidden text-xs sm:inline", mine ? "text-accent" : "text-muted-foreground")}>{mine ? "You" : (it.assigneeName ?? "Unassigned")}</span>
              <span className={cn("w-14 text-right font-mono text-xs", overdue ? "text-danger" : "text-muted-foreground")}>
                {formatDate(it.dueDate, { day: "numeric", month: "short" })}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function OnboardingPage({ me }: { me: Me }) {
  const canManage = can(me.org.permissions, "employee", "create");
  const canTick = can(me.org.permissions, "employee", "update");
  const [showDone, setShowDone] = useState(false);
  const { data: runs } = useOnboardingRuns({ active: showDone ? "false" : "true" });
  const { data: templates } = useOnboardingTemplates();
  const { data: myEmployee } = useMyEmployee();
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState<{ open: boolean; template?: OnboardingTemplate }>({ open: false });
  const removeTemplate = useApiMutation((id: string) => api(`onboarding/templates/${id}`, { method: "DELETE" }), {
    invalidate: ONBOARDING_KEYS,
    success: "Checklist deleted",
  });

  return (
    <PageBody>
      <PageHeader
        title="Onboarding"
        description="Welcome new joiners with a clear first month."
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setStarting(true)}>
              <Rocket /> Start onboarding
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <button type="button" onClick={() => setShowDone(false)} className={cn("rounded-md px-2.5 py-1", !showDone ? "bg-surface-2 font-medium" : "text-muted-foreground")}>
              In progress
            </button>
            <button type="button" onClick={() => setShowDone(true)} className={cn("rounded-md px-2.5 py-1", showDone ? "bg-surface-2 font-medium" : "text-muted-foreground")}>
              Completed
            </button>
          </div>
          {runs?.runs.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Rocket />}
                title={showDone ? "Nothing completed yet" : "No one is onboarding"}
                description="Start onboarding when someone joins, and their first steps are assigned automatically."
              />
            </Card>
          ) : (
            runs?.runs.map((r) => <RunCard key={r.id} run={r} myEmployeeId={myEmployee?.employee?.id} canManage={canTick} />)
          )}
        </div>

        <Card className="h-fit p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Checklists</h2>
            {canManage ? (
              <Button size="sm" variant="ghost" onClick={() => setEditing({ open: true })}>
                <Plus /> New
              </Button>
            ) : null}
          </div>
          <ul className="mt-3 space-y-2">
            {templates?.templates.map((t) => (
              <li key={t.id} className="group flex items-center gap-2 rounded-lg border border-border px-3 py-2.5">
                <ClipboardList className="size-4 text-people" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.items.length} steps</div>
                </div>
                {canManage ? (
                  <>
                    <button type="button" aria-label={`Edit ${t.name}`} onClick={() => setEditing({ open: true, template: t })} className="rounded p-1 text-muted-foreground hover:text-foreground">
                      <Pencil className="size-3.5" />
                    </button>
                    <button type="button" aria-label={`Delete ${t.name}`} onClick={() => confirm(`Delete ${t.name}?`) && removeTemplate.mutate(t.id)} className="rounded p-1 text-muted-foreground hover:text-danger">
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {starting ? <StartDialog open onOpenChange={setStarting} /> : null}
      {editing.open ? (
        <TemplateDialog key={editing.template?.id ?? "new"} open onOpenChange={(o) => setEditing({ open: o })} template={editing.template} />
      ) : null}
    </PageBody>
  );
}
