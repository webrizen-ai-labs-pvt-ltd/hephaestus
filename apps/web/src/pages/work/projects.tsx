import { can, projectKeyFrom } from "@hephaestus/core";
import { Badge, Button, Card, cn, DateInput, Dialog, DialogContent, Em, EmptyState, Field, Input, PageHero, ProgressRing, Segmented, Select, Textarea } from "@hephaestus/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolderKanban, Plus } from "lucide-react";
import { useState } from "react";
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
  const [clientId, setClient] = useState(project?.clientId ?? "");
  const { data: clientData } = useQuery({ queryKey: ["clients", ""], queryFn: () => api<{ clients: { id: string; name: string }[] }>("clients"), retry: false });
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
        ...(clientData ? { clientId: clientId || null } : {}),
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
        icon={FolderKanban}
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
        <div className="grid gap-4 sm:grid-cols-[1fr_168px]">
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
          {clientData ? (
            <Field label="Client" hint="Billable milestones invoice this client" className="sm:col-span-2">
              <Select value={clientId} onChange={(e) => setClient(e.target.value)}>
                <option value="">Internal (no client)</option>
                {clientData.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Start">
            <DateInput value={startDate} onChange={(v) => setStart(v)} />
          </Field>
          <Field label="Due">
            <DateInput value={dueDate} min={startDate || undefined} onChange={(v) => setDue(v)} />
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
                  className="size-7 rounded-full ring-offset-2 ring-offset-bg-primary aria-pressed:ring-2 aria-pressed:ring-fg-primary"
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

function ProjectCard({ p, today }: { p: ProjectSummary; today: string }) {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  const late = p.dueDate && p.dueDate < today && p.status !== "completed";
  const daysLeft = p.dueDate ? Math.round((Date.parse(p.dueDate) - Date.parse(today)) / 86_400_000) : null;
  return (
    <Link to="/work/projects/$id" params={{ id: p.id }} className="group">
      <Card className="relative flex h-full flex-col overflow-hidden p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-primary">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${p.color} 16%, transparent), transparent)` }} />
        <div className="relative flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl font-mono text-[11px] font-bold text-white shadow-xs" style={{ background: p.color }}>
            {p.key.slice(0, 4)}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[17px] font-bold leading-tight">{p.name}</h3>
            <div className="mt-0.5 truncate text-xs text-tertiary">{p.leadName ? `Led by ${p.leadName}` : "No lead yet"}</div>
          </div>
          {p.status === "paused" ? <Badge>Paused</Badge> : null}
          {p.status === "completed" ? <Badge tone="people">Completed</Badge> : null}
        </div>
        <p className="relative mt-3 line-clamp-2 min-h-10 text-sm text-tertiary">{p.description ?? "No description"}</p>
        <div className="relative mt-auto flex items-center gap-4 pt-4">
          <ProgressRing value={pct} size={52} stroke={5} color={p.color}>
            <span className="text-[11px]">{pct}%</span>
          </ProgressRing>
          <dl className="grid flex-1 grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[10.5px] text-tertiary">Done</dt>
              <dd className="font-display text-base font-bold tabular">
                {p.done}
                <span className="text-xs font-normal text-quaternary">/{p.total}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[10.5px] text-tertiary">Overdue</dt>
              <dd className={cn("font-display text-base font-bold tabular", p.overdue ? "text-error-primary" : "text-quaternary")}>{p.overdue}</dd>
            </div>
            <div>
              <dt className="text-[10.5px] text-tertiary">Due</dt>
              <dd className={cn("pt-0.5 font-mono text-xs", late ? "text-error-primary" : "text-primary")}>
                {p.dueDate ? (daysLeft !== null && daysLeft >= 0 && daysLeft <= 14 ? `${daysLeft}d left` : formatDate(p.dueDate, { day: "numeric", month: "short" })) : "—"}
              </dd>
            </div>
          </dl>
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
  const today = new Date().toISOString().slice(0, 10);
  const total = projects.reduce((a, p) => a + p.total, 0);
  const done = projects.reduce((a, p) => a + p.done, 0);
  const overdue = projects.reduce((a, p) => a + p.overdue, 0);
  const many = me.settings.terms.project.many;

  return (
    <WorkBody>
      <PageHero
        eyebrow={`Work · ${many}`}
        tone="var(--work)"
        title="Everything in flight"
        summary={
          projects.length ? (
            <>
              <Em tone="var(--work)">{projects.length}</Em> {status} {projects.length === 1 ? me.settings.terms.project.one.toLowerCase() : many.toLowerCase()}, <Em>{total ? Math.round((done / total) * 100) : 0}%</Em> of their tasks done
              {overdue ? (
                <>
                  , <Em tone="var(--color-fg-error-primary)">{overdue} overdue</Em>
                </>
              ) : null}
              .
            </>
          ) : (
            "Projects hold tasks, stages and milestones."
          )
        }
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New {me.settings.terms.project.one.toLowerCase()}
            </Button>
          ) : null
        }
      />
      <Segmented
        aria-label="Project status"
        value={status}
        onChange={setStatus}
        items={[
          { key: "current", label: "Current" },
          { key: "completed", label: "Completed" },
          { key: "archived", label: "Archived" },
        ]}
      />
      {data && projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title={status === "current" ? `No ${many.toLowerCase()} yet` : "Nothing here"}
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
        <div className="rise rise-1 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} today={today} />
          ))}
          {canCreate && status === "current" ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-secondary text-sm text-tertiary transition-colors hover:border-primary hover:bg-primary/60 hover:text-primary"
            >
              <Plus className="size-5" /> New {me.settings.terms.project.one.toLowerCase()}
            </button>
          ) : null}
        </div>
      )}
      {creating ? <ProjectDialog open onOpenChange={setCreating} /> : null}
    </WorkBody>
  );
}

