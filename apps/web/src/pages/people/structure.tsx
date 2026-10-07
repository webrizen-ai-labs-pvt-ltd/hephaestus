import { can } from "@operant/core";
import { Avatar, Button, Card, CheckboxBase, Dialog, DialogContent, Em, EmptyState, Field, Input, Select, Textarea } from "@operant/ui";
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
        icon={Building2}
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
                  className="size-7 rounded-full ring-offset-2 ring-offset-bg-primary aria-pressed:ring-2 aria-pressed:ring-fg-primary"
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
        icon={UsersRound}
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
              Members <span className="font-mono text-xs text-tertiary">{memberIds.length} selected</span>
            </div>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter people" className="mb-2" />
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-secondary">
              {visible.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-secondary">
                    <input type="checkbox" checked={memberIds.includes(p.id)} onChange={() => toggle(p.id)} className="peer sr-only" />
                    <CheckboxBase isSelected={memberIds.includes(p.id)} className="peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring" />
                    <Avatar name={p.fullName} src={p.image} className="size-6" />
                    <span className="flex-1 truncate">{p.fullName}</span>
                    <span className="truncate text-xs text-tertiary">{p.jobTitle}</span>
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

function IconAction({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`rounded-md p-1.5 text-tertiary hover:bg-secondary ${danger ? "hover:text-error-primary" : "hover:text-primary"}`}
    >
      {children}
    </button>
  );
}

/** All descendants of a department, flattened. */
function descendants(all: Department[], id: string): Department[] {
  return all.filter((d) => d.parentId === id).flatMap((d) => [d, ...descendants(all, d.id)]);
}

function DepartmentCard({
  d,
  all,
  total,
  canManage,
  onEdit,
  onDelete,
}: {
  d: Department;
  all: Department[];
  total: number;
  canManage: boolean;
  onEdit: (d: Department) => void;
  onDelete: (d: Department) => void;
}) {
  const color = d.color ?? "var(--people)";
  const subs = descendants(all, d.id);
  const people = d.headcount + subs.reduce((a, s) => a + s.headcount, 0);
  const share = total ? Math.round((people / total) * 100) : 0;
  return (
    <Card className="group relative flex flex-col overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full blur-2xl" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)` }} />
      <div className="relative flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
          <Building2 />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[17px] font-bold leading-tight">{d.name}</h3>
          <p className="mt-0.5 truncate text-xs text-tertiary">{d.description ?? "No description"}</p>
        </div>
        {canManage ? (
          <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <IconAction label={`Edit ${d.name}`} onClick={() => onEdit(d)}>
              <Pencil className="size-3.5" />
            </IconAction>
            <IconAction label={`Delete ${d.name}`} onClick={() => onDelete(d)} danger>
              <Trash2 className="size-3.5" />
            </IconAction>
          </span>
        ) : null}
      </div>
      <div className="relative mt-5 flex items-end justify-between">
        <div>
          <div className="font-display text-3xl font-bold leading-none tabular">{people}</div>
          <div className="mt-1 text-xs text-tertiary">{people === 1 ? "person" : "people"}</div>
        </div>
        <div className="text-right text-xs text-tertiary">
          {d.headName ? (
            <>
              <div className="text-[11px] text-quaternary">Head</div>
              <div className="font-medium text-primary">{d.headName}</div>
            </>
          ) : (
            <span>No head yet</span>
          )}
        </div>
      </div>
      <div className="relative mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full" style={{ width: `${share}%`, background: color }} />
        </div>
        <div className="mt-1 text-[11px] text-quaternary">{share}% of the company</div>
      </div>
      {subs.length ? (
        <div className="relative mt-4 flex flex-wrap gap-1.5 border-t border-secondary pt-3">
          {subs.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={!canManage}
              onClick={() => onEdit(s)}
              className="inline-flex items-center gap-1.5 rounded-full border border-secondary px-2 py-0.5 text-[11.5px] text-tertiary enabled:hover:border-primary enabled:hover:text-primary"
            >
              <span className="size-1.5 rounded-full" style={{ background: s.color ?? color }} />
              {s.name}
              <span className="font-mono text-[10px] text-quaternary">{s.headcount}</span>
            </button>
          ))}
        </div>
      ) : null}
    </Card>
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
  const top = normalized.filter((d) => !d.parentId);
  const total = normalized.reduce((a, d) => a + d.headcount, 0);
  const teams = teamData?.teams ?? [];

  const removeDept = useApiMutation((id: string) => api(`departments/${id}`, { method: "DELETE" }), { invalidate: PEOPLE_KEYS, success: "Department deleted" });
  const removeTeam = useApiMutation((id: string) => api(`teams/${id}`, { method: "DELETE" }), { invalidate: PEOPLE_KEYS, success: "Team deleted" });

  return (
    <PageBody>
      <PageHeader
        title="Departments and teams"
        description={
          list.length || teams.length ? (
            <>
              <Em tone="var(--people)">{list.length} departments</Em> group people by function. <Em>{teams.length} teams</Em> mix people across them.
            </>
          ) : (
            "How your organization is structured."
          )
        }
        actions={
          canManage ? (
            <>
              <Button variant="secondary" onClick={() => setTeamDialog({ open: true })}>
                <UsersRound /> New team
              </Button>
              <Button variant="primary" onClick={() => setDeptDialog({ open: true })}>
                <Plus /> New department
              </Button>
            </>
          ) : null
        }
      />

      <section className="rise rise-1 space-y-3">
        <h2 className="eyebrow">Departments</h2>
        {list.length === 0 ? (
          <Card>
            <EmptyState icon={<Building2 />} title="No departments yet" description="Group people by function, like Sales, Operations or Engineering." />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {top.map((d) => (
              <DepartmentCard
                key={d.id}
                d={d}
                all={normalized}
                total={total}
                canManage={canManage}
                onEdit={(x) => setDeptDialog({ open: true, dept: x })}
                onDelete={(x) => confirm(`Delete ${x.name}? People in it stay in the directory without a department.`) && removeDept.mutate(x.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rise rise-2 space-y-3">
        <h2 className="eyebrow">Teams</h2>
        {teams.length === 0 ? (
          <Card>
            <EmptyState icon={<UsersRound />} title="No teams yet" description="Teams can mix people from different departments." />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((t) => (
              <Card key={t.id} className="group flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-collab/15 text-collab [&_svg]:size-5">
                    <UsersRound />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-[17px] font-bold leading-tight">{t.name}</h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-tertiary">{t.description ?? "No description"}</p>
                  </div>
                  {canManage ? (
                    <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <IconAction label={`Edit ${t.name}`} onClick={() => setTeamDialog({ open: true, team: t })}>
                        <Pencil className="size-3.5" />
                      </IconAction>
                      <IconAction label={`Delete ${t.name}`} onClick={() => confirm(`Delete ${t.name}?`) && removeTeam.mutate(t.id)} danger>
                        <Trash2 className="size-3.5" />
                      </IconAction>
                    </span>
                  ) : null}
                </div>
                <div className="mt-auto flex items-center justify-between pt-5">
                  <div className="flex -space-x-2">
                    {t.members.slice(0, 7).map((m) => (
                      <Avatar key={m.id} name={m.fullName} src={m.image} className="size-8 border-2 border-bg-primary" />
                    ))}
                    {t.members.length > 7 ? (
                      <span className="flex size-8 items-center justify-center rounded-full border-2 border-bg-primary bg-secondary font-mono text-[10px]">+{t.members.length - 7}</span>
                    ) : null}
                  </div>
                  <span className="text-xs text-tertiary">
                    {t.members.length} {t.members.length === 1 ? "member" : "members"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {deptDialog.open ? <DepartmentDialog key={deptDialog.dept?.id ?? "new"} open onOpenChange={(o) => setDeptDialog({ open: o })} dept={deptDialog.dept} /> : null}
      {teamDialog.open ? <TeamDialog key={teamDialog.team?.id ?? "new"} open onOpenChange={(o) => setTeamDialog({ open: o })} team={teamDialog.team} /> : null}
    </PageBody>
  );
}

