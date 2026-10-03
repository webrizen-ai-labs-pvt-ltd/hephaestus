import { can } from "@hephaestus/core";
import { Avatar, Badge, Button, Card, cn, EmptyState, Input, Segmented, Select } from "@hephaestus/ui";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Download, LayoutGrid, List, Search, UserPlus, Users } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "../../components/app-shell.tsx";
import { api, type Me } from "../../lib/api.ts";
import { EMPLOYMENT_LABEL, type Employee, PEOPLE_KEYS, useApiMutation, useDepartments, useEmployees } from "../../lib/people.ts";
import { EmployeeFormDialog } from "./employee-form.tsx";
import { PageBody } from "./layout.tsx";

export function StatusBadge({ status }: { status: Employee["status"] }) {
  if (status === "onboarding") return <Badge tone="finance">Onboarding</Badge>;
  if (status === "offboarded") return <Badge>Former</Badge>;
  return null;
}

export function DirectoryPage({ me }: { me: Me }) {
  const search = useSearch({ strict: false }) as { add?: boolean };
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("current");
  const [adding, setAdding] = useState(Boolean(search.add));
  const [view, setViewState] = useState<"cards" | "list">(() => {
    try {
      return localStorage.getItem("directory-view") === "list" ? "list" : "cards";
    } catch {
      return "cards";
    }
  });
  const setView = (v: "cards" | "list") => {
    setViewState(v);
    try {
      localStorage.setItem("directory-view", v);
    } catch {}
  };
  const deferred = useDeferredValue(q.trim());
  const { data, isLoading } = useEmployees({ q: deferred || undefined, departmentId: departmentId || undefined, status });
  const { data: depts } = useDepartments();
  const canCreate = can(me.org.permissions, "employee", "create");
  const employees = data?.employees ?? [];

  const importMembers = useApiMutation(() => api<{ created: number }>("employees/import-members", { method: "POST" }), {
    invalidate: PEOPLE_KEYS,
    onSuccess: (r) => {
      toast.success(r.created ? `Added ${r.created} ${r.created === 1 ? "person" : "people"} from Webrizen` : "Everyone's already in the directory");
    },
  });

  return (
    <PageBody>
      <PageHeader
        title="Directory"
        description={`${employees.length} ${employees.length === 1 ? "person" : "people"}${departmentId ? ` in ${depts?.departments.find((d) => d.id === departmentId)?.name ?? "this department"}` : ""}. Click anyone to see their profile.`}
        actions={
          canCreate ? (
            <>
              <Button onClick={() => importMembers.mutate(undefined)} disabled={importMembers.isPending}>
                <Download /> Import from Webrizen
              </Button>
              <Button variant="primary" onClick={() => setAdding(true)}>
                <UserPlus /> Add employee
              </Button>
            </>
          ) : null
        }
      />

      <div className="rise rise-1 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, title or ID" className="pl-9" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-40" aria-label="Status">
            <option value="current">Current</option>
            <option value="onboarding">Onboarding</option>
            <option value="offboarded">Former</option>
            <option value="all">Everyone</option>
          </Select>
          <Segmented
            className="ml-auto"
            aria-label="View"
            value={view}
            onChange={setView}
            items={[
              { key: "cards", icon: LayoutGrid, title: "Cards" },
              { key: "list", icon: List, title: "List" },
            ]}
          />
        </div>
        {depts?.departments.length ? (
          <div className="flex flex-wrap gap-1.5">
            {[{ id: "", name: "All", color: "var(--people)", headcount: null as number | null }, ...depts.departments].map((d) => {
              const active = departmentId === d.id;
              return (
                <button
                  key={d.id || "all"}
                  type="button"
                  onClick={() => setDepartmentId(d.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors",
                    active ? "border-primary bg-tertiary text-primary" : "border-secondary text-tertiary hover:bg-secondary hover:text-primary",
                  )}
                >
                  <span className="size-2 rounded-full" style={{ background: d.color ?? "var(--people)" }} />
                  {d.name}
                  {d.headcount !== null ? <span className="font-mono text-[11px] text-quaternary">{d.headcount}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <Card className={cn("rise rise-2", view === "cards" && employees.length > 0 && "border-0 bg-transparent shadow-none")}>
        {!isLoading && employees.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={deferred || departmentId ? "No one matches" : "Build your directory"}
            description={
              deferred || departmentId
                ? "Try a different search or filter."
                : "Import everyone who has a Webrizen account in your organization, or add people one by one."
            }
            action={
              canCreate && !deferred && !departmentId ? (
                <Button variant="primary" onClick={() => importMembers.mutate(undefined)}>
                  <Download /> Import from Webrizen
                </Button>
              ) : null
            }
          />
        ) : view === "cards" ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {employees.map((e) => (
              <li key={e.id}>
                <Link to="/people/$id" params={{ id: e.id }} className="group block h-full">
                  <Card className="relative flex h-full flex-col items-center overflow-hidden px-4 pb-4 pt-6 text-center transition-all group-hover:-translate-y-0.5 group-hover:border-primary">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-16" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${e.departmentColor ?? "var(--people)"} 22%, transparent), transparent)` }} />
                    <Avatar name={e.fullName} src={e.image} className="relative size-16 border-4 border-bg-primary text-lg shadow-xs" />
                    <div className="mt-3 flex max-w-full items-center gap-1.5">
                      <span className="truncate font-display text-[15px] font-bold">{e.fullName}</span>
                    </div>
                    <div className="mt-0.5 max-w-full truncate text-[13px] text-tertiary">{e.jobTitle ?? "—"}</div>
                    <div className="mt-2">
                      <StatusBadge status={e.status} />
                    </div>
                    <div className="mt-auto flex w-full items-center justify-between gap-2 border-t border-secondary pt-3 text-[11.5px] text-tertiary">
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: e.departmentColor ?? "var(--color-text-quaternary)" }} />
                        <span className="truncate">{e.departmentName ?? "No department"}</span>
                      </span>
                      <span className="shrink-0 font-mono">{e.employeeCode}</span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-secondary bg-secondary text-left text-xs font-semibold text-quaternary">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Department</th>
                  <th className="px-5 py-3 font-semibold">Manager</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-secondary">
                {employees.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer hover:bg-secondary/60"
                    onClick={() => navigate({ to: "/people/$id", params: { id: e.id } })}
                  >
                    <td className="px-5 py-3.5">
                      <Link to="/people/$id" params={{ id: e.id }} className="flex items-center gap-3" onClick={(ev) => ev.stopPropagation()}>
                        <Avatar name={e.fullName} src={e.image} className="size-9" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            <span className="truncate">{e.fullName}</span>
                            <StatusBadge status={e.status} />
                          </div>
                          <div className="truncate text-xs text-tertiary">{e.jobTitle ?? e.workEmail ?? "—"}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      {e.departmentName ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="size-2 rounded-full" style={{ background: e.departmentColor ?? "var(--people)" }} />
                          {e.departmentName}
                        </span>
                      ) : (
                        <span className="text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-tertiary">{e.managerName ?? "—"}</td>
                    <td className="px-5 py-3.5 text-tertiary">{EMPLOYMENT_LABEL[e.employmentType]}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-tertiary">{e.employeeCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canCreate ? (
        <EmployeeFormDialog
          open={adding}
          onOpenChange={(o) => {
            setAdding(o);
            if (!o && search.add) navigate({ to: "/people/directory", search: {}, replace: true });
          }}
          onSaved={(id) => navigate({ to: "/people/$id", params: { id } })}
        />
      ) : null}
    </PageBody>
  );
}
