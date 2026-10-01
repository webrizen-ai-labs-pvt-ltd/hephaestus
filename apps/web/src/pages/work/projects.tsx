import { can, projectKeyFrom } from "@hephaestus/core";
import { Badge, Button, Card, cn, Dialog, DialogContent, EmptyState, Field, Input, Select, Textarea } from "@hephaestus/ui";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, FolderKanban, Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../../components/app-shell.tsx";
import { api, type Me } from "../../lib/api.ts";
import { formatDate, useApiMutation, useEmployees } from "../../lib/people.ts";
import { type ProjectSummary, useGoals, useProjects, WORK_KEYS } from "../../lib/work.ts";
import { WorkBody } from "./layout.tsx";

export const PROJECT_COLORS = ["#ff5a1f", "#4c6e9e", "#2e8b6e", "#c8a24a", "#9b5de5", "#d7263d", "#0ea5a4", "#8a8178"];

export function ProjectDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project?: ProjectSummary }) {
  const navigate = useNavigate();
  const { data: people } = useEmployees();
  const { data: goalData } = useGoals();
  const { data: existing } = useProjects("current");
  const [name, setName] = useState(project?.name ?? "");
  const [key, setKey] = useState(project?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(Boolean(project));
  const [description, setDescription] = useState(project?.description ?? "");
  const [lead, setLead] = useState(project?.leadEmployeeId ?? "");
  const [goalId, setGoal] = useState(project?.goalId ?? "");
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]!);
  const [startDate, setStart] = useState(project?.startDate ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDue] = useState(project?.dueDate ?? "");
  const [template, setTemplate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useApiMutation(
    async () => {
      const body = {
        name,
        description: description || null,
        leadEmployeeId: lead || null,
        goalId: goalId || null,
        color,
        startDate: startDate || null,
        dueDate: dueDate || null,
      };
      if (project) {
        await api(`projects/${project.id}`, { method: "PATCH", body: JSON.stringify(body) });
        return project.id;
      }
      const r = await api<{ project: { id: string } }>("projects", {
        method: "POST",
        body: JSON.stringify({ ...body, ...(keyTouched && key ? { key } : {}), ...(template ? { templateProjectId: template } : {}) }),
      });
      return r.project.id;
    },
    {
      invalidate: WORK_KEYS,
      success: project ? "Project updated" : "Project created",
      onSuccess: (id) => {
        onOpenChange(false);
        if (!project) navigate({ to: "/work/projects/$id", params: { id } });
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={project ? "Project settings" : "New project"}
        className="w-[min(600px,calc(100vw-32px))]"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={save.isPending} onClick={() => (name.trim() ? save.mutate(undefined) : setError("Enter a name"))}>
              {project ? "Save" : "Create project"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Name" error={error}>
            <Input
              value={name}
              autoFocus
              maxLength={100}
              placeholder="Website relaunch"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
                if (!keyTouched) setKey(projectKeyFrom(e.target.value));
              }}
            />
          </Field>
          <Field label="Key" hint={project ? "Can't be changed" : `Tasks: ${key || "KEY"}-1`}>
            <Input
              value={key}
              disabled={Boolean(project)}
              maxLength={6}
              onChange={(e) => {
                setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                setKeyTouched(true);
              }}
              className="font-mono"
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} className="min-h-16" />
          </Field>
          <Field label="Lead">
            <Select value={lead} onChange={(e) => setLead(e.target.value)}>
              <option value="">No lead</option>
              {people?.employees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Goal">
            <Select value={goalId} onChange={(e) => setGoal(e.target.value)}>
              <option value="">None</option>
              {goalData?.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start">
            <Input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Due">
            <Input type="date" value={dueDate} min={startDate || undefined} onChange={(e) => setDue(e.target.value)} />
          </Field>
          {!project ? (
            <Field label="Start from" hint="Copies stages, milestones and tasks. Dates shift to the new start." className="sm:col-span-2">
              <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
                <option value="">Blank project</option>
                {existing?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    Copy of {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Colour" className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className="size-7 rounded-full ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-foreground"
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCard({ p }: { p: ProjectSummary }) {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <Link to="/work/projects/$id" params={{ id: p.id }} className="group">
      <Card className="relative h-full overflow-hidden p-5 transition-colors group-hover:border-input">
        <div className="absolute inset-y-0 left-0 w-1" style={{ background: p.color }} />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-xs text-muted-foreground">{p.key}</div>
            <h3 className="truncate text-lg font-bold">{p.name}</h3>
          </div>
          {p.status === "paused" ? <Badge>Paused</Badge> : null}
          {p.status === "completed" ? <Badge tone="people">Completed</Badge> : null}
        </div>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">{p.description ?? (p.leadName ? `Led by ${p.leadName}` : "No description")}</p>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {p.done}/{p.total} done
          </span>
          {p.overdue ? (
            <span className="flex items-center gap-1 text-danger">
              <AlertTriangle className="size-3.5" /> {p.overdue} overdue
            </span>
          ) : p.dueDate ? (
            <span>Due {formatDate(p.dueDate, { day: "numeric", month: "short" })}</span>
          ) : null}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.color }} />
        </div>
      </Card>
    </Link>
  );
}

export function ProjectsPage({ me }: { me: Me }) {
  const [status, setStatus] = useState("current");
  const [creating, setCreating] = useState(false);
  const { data } = useProjects(status);
  const canCreate = can(me.org.permissions, "project", "create");
  const projects = data?.projects ?? [];

  return (
    <WorkBody>
      <PageHeader
        title={me.settings.terms.project.many}
        description="Everything your team is delivering."
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New {me.settings.terms.project.one.toLowerCase()}
            </Button>
          ) : null
        }
      />
      <div className="flex gap-1 text-sm">
        {[
          ["current", "Current"],
          ["completed", "Completed"],
          ["archived", "Archived"],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatus(k!)}
            className={cn("rounded-md px-2.5 py-1", status === k ? "bg-surface-2 font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      {data && projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title={status === "current" ? `No ${me.settings.terms.project.many.toLowerCase()} yet` : "Nothing here"}
            description="Projects hold tasks, stages and milestones. Start with one your team is working on now."
            action={
              canCreate && status === "current" ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus /> New {me.settings.terms.project.one.toLowerCase()}
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}
      {creating ? <ProjectDialog open onOpenChange={setCreating} /> : null}
    </WorkBody>
  );
}
