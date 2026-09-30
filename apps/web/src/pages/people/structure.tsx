import { can } from "@hephaestus/core";
import { Avatar, Button, Card, Dialog, DialogContent, EmptyState, Field, Input, Select, Textarea } from "@hephaestus/ui";
import { Building2, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../../components/app-shell.tsx";
import { api, type Me } from "../../lib/api.ts";
import { type Department, PEOPLE_KEYS, type Team, useApiMutation, useDepartments, useEmployees, useTeams } from "../../lib/people.ts";
import { PageBody } from "./layout.tsx";

const SWATCHES = ["#2e8b6e", "#ff5a1f", "#c8a24a", "#4c6e9e", "#9b5de5", "#d7263d", "#0ea5a4", "#8a8178"];

function DepartmentDialog({ open, onOpenChange, dept }: { open: boolean; onOpenChange: (o: boolean) => void; dept?: Department }) {
  const { data: depts } = useDepartments();
  const { data: people } = useEmployees();
  const [name, setName] = useState(dept?.name ?? "");
  const [description, setDescription] = useState(dept?.description ?? "");
  const [parentId, setParentId] = useState(dept?.parentId ?? "");
  const [headEmployeeId, setHead] = useState(dept?.headEmployeeId ?? "");
  const [color, setColor] = useState(dept?.color ?? SWATCHES[0]!);
  const [error, setError] = useState<string | null>(null);

  const save = useApiMutation(
    () => {
      const body = JSON.stringify({ name, description: description || null, parentId: parentId || null, headEmployeeId: headEmployeeId || null, color });
      return dept ? api(`departments/${dept.id}`, { method: "PATCH", body }) : api("departments", { method: "POST", body });
    },
    { invalidate: PEOPLE_KEYS, success: dept ? "Department updated" : "Department created", onSuccess: () => onOpenChange(false) },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={dept ? "Edit department" : "New department"}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={save.isPending}
              onClick={() => (name.trim() ? save.mutate(undefined) : setError("Enter a name"))}
            >
              {dept ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Name" error={error}>
            <Input value={name} onChange={(e) => (setName(e.target.value), setError(null))} placeholder="Engineering" autoFocus maxLength={80} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Part of">
              <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Top level</option>
                {depts?.departments
                  .filter((d) => d.id !== dept?.id)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Head">
              <Select value={headEmployeeId} onChange={(e) => setHead(e.target.value)}>
                <option value="">Nobody yet</option>
                {people?.employees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`Colour ${s}`}
                  aria-pressed={color === s}
                  onClick={() => setColor(s)}
                  className="size-7 rounded-full ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-foreground"
                  style={{ background: s }}
                />
              ))}
            </div>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeamDialog({ open, onOpenChange, team }: { open: boolean; onOpenChange: (o: boolean) => void; team?: Team }) {
  const { data: people } = useEmployees();
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [lead, setLead] = useState(team?.leadEmployeeId ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(team?.members.map((m) => m.id) ?? []);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useApiMutation(
    () => {
      const body = JSON.stringify({ name, description: description || null, leadEmployeeId: lead || null, memberIds });
      return team ? api(`teams/${team.id}`, { method: "PATCH", body }) : api("teams", { method: "POST", body });
    },
    { invalidate: PEOPLE_KEYS, success: team ? "Team updated" : "Team created", onSuccess: () => onOpenChange(false) },
  );

  const visible = (people?.employees ?? []).filter((p) => p.fullName.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (id: string) => setMemberIds((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={team ? "Edit team" : "New team"}
        description="Teams can cut across departments, e.g. a project squad or a branch."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={save.isPending} onClick={() => (name.trim() ? save.mutate(undefined) : setError("Enter a name"))}>
              {team ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Name" error={error}>
            <Input value={name} onChange={(e) => (setName(e.target.value), setError(null))} placeholder="Andheri branch" autoFocus maxLength={80} />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
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
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm font-medium">
              Members <span className="font-mono text-xs text-muted-foreground">{memberIds.length} selected</span>
            </div>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter people" className="mb-2" />
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {visible.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2">
                    <input type="checkbox" checked={memberIds.includes(p.id)} onChange={() => toggle(p.id)} className="accent-[var(--primary)]" />
                    <Avatar name={p.fullName} src={p.image} className="size-6" />
                    <span className="flex-1 truncate">{p.fullName}</span>
                    <span className="truncate text-xs text-muted-foreground">{p.jobTitle}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DepartmentTree({
  depts,
  parentId,
  depth,
  canManage,
  onEdit,
  onDelete,
}: {
  depts: Department[];
  parentId: string | null;
  depth: number;
  canManage: boolean;
  onEdit: (d: Department) => void;
  onDelete: (d: Department) => void;
}) {
  const level = depts.filter((d) => d.parentId === parentId);
  if (level.length === 0) return null;
  return (
    <ul className={depth ? "ml-6 border-l border-border pl-4" : ""}>
      {level.map((d) => (
        <li key={d.id}>
          <div className="group flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-2/60">
            <span className="size-3 shrink-0 rounded" style={{ background: d.color ?? "var(--people)" }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{d.name}</div>
              <div className="truncate text-xs text-muted-foreground">{d.headName ? `Head: ${d.headName}` : (d.description ?? "No head yet")}</div>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{d.headcount}</span>
            {canManage ? (
              <span className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button type="button" aria-label={`Edit ${d.name}`} onClick={() => onEdit(d)} className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                  <Pencil className="size-3.5" />
                </button>
                <button type="button" aria-label={`Delete ${d.name}`} onClick={() => onDelete(d)} className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-danger">
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            ) : null}
          </div>
          <DepartmentTree depts={depts} parentId={d.id} depth={depth + 1} canManage={canManage} onEdit={onEdit} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}

export function StructurePage({ me }: { me: Me }) {
  const canManage = can(me.org.permissions, "department", "manage");
  const { data: depts } = useDepartments();
  const { data: teamData } = useTeams();
  const [deptDialog, setDeptDialog] = useState<{ open: boolean; dept?: Department }>({ open: false });
  const [teamDialog, setTeamDialog] = useState<{ open: boolean; team?: Team }>({ open: false });
  const list = depts?.departments ?? [];
  // Departments whose parent was deleted show at the top level.
  const normalized = useMemo(() => {
    const ids = new Set(list.map((d) => d.id));
    return list.map((d) => (d.parentId && !ids.has(d.parentId) ? { ...d, parentId: null } : d));
  }, [list]);

  const removeDept = useApiMutation((id: string) => api(`departments/${id}`, { method: "DELETE" }), { invalidate: PEOPLE_KEYS, success: "Department deleted" });
  const removeTeam = useApiMutation((id: string) => api(`teams/${id}`, { method: "DELETE" }), { invalidate: PEOPLE_KEYS, success: "Team deleted" });

  return (
    <PageBody>
      <PageHeader title="Departments and teams" description="How your organization is structured." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between px-2 pb-3">
            <h2 className="text-lg font-bold">Departments</h2>
            {canManage ? (
              <Button size="sm" onClick={() => setDeptDialog({ open: true })}>
                <Plus /> New
              </Button>
            ) : null}
          </div>
          {list.length === 0 ? (
            <EmptyState icon={<Building2 />} title="No departments yet" description="Group people by function, like Sales, Operations or Engineering." />
          ) : (
            <DepartmentTree
              depts={normalized}
              parentId={null}
              depth={0}
              canManage={canManage}
              onEdit={(d) => setDeptDialog({ open: true, dept: d })}
              onDelete={(d) =>
                confirm(`Delete ${d.name}? People in it stay in the directory without a department.`) && removeDept.mutate(d.id)
              }
            />
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between px-2 pb-3">
            <h2 className="text-lg font-bold">Teams</h2>
            {canManage ? (
              <Button size="sm" onClick={() => setTeamDialog({ open: true })}>
                <Plus /> New
              </Button>
            ) : null}
          </div>
          {teamData?.teams.length === 0 ? (
            <EmptyState icon={<UsersRound />} title="No teams yet" description="Teams can mix people from different departments." />
          ) : (
            <ul className="space-y-2">
              {teamData?.teams.map((t) => (
                <li key={t.id} className="group rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm font-medium">{t.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{t.members.length}</span>
                    {canManage ? (
                      <span className="flex">
                        <button type="button" aria-label={`Edit ${t.name}`} onClick={() => setTeamDialog({ open: true, team: t })} className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
                          <Pencil className="size-3.5" />
                        </button>
                        <button type="button" aria-label={`Delete ${t.name}`} onClick={() => confirm(`Delete ${t.name}?`) && removeTeam.mutate(t.id)} className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-danger">
                          <Trash2 className="size-3.5" />
                        </button>
                      </span>
                    ) : null}
                  </div>
                  {t.description ? <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p> : null}
                  <div className="mt-3 flex -space-x-2">
                    {t.members.slice(0, 10).map((m) => (
                      <Avatar key={m.id} name={m.fullName} src={m.image} className="size-7 border-2 border-surface" />
                    ))}
                    {t.members.length > 10 ? (
                      <span className="flex size-7 items-center justify-center rounded-full border-2 border-surface bg-surface-2 font-mono text-[10px]">
                        +{t.members.length - 10}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {deptDialog.open ? <DepartmentDialog key={deptDialog.dept?.id ?? "new"} open onOpenChange={(o) => setDeptDialog({ open: o })} dept={deptDialog.dept} /> : null}
      {teamDialog.open ? <TeamDialog key={teamDialog.team?.id ?? "new"} open onOpenChange={(o) => setTeamDialog({ open: o })} team={teamDialog.team} /> : null}
    </PageBody>
  );
}
