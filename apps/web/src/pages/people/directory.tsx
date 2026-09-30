import { can } from "@hephaestus/core";
import { Avatar, Badge, Button, Card, EmptyState, Input, Select } from "@hephaestus/ui";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Download, Search, UserPlus, Users } from "lucide-react";
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
        description={`${employees.length} ${employees.length === 1 ? "person" : "people"}`}
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

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, title or ID" className="pl-9" />
          </div>
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full sm:w-48" aria-label="Department">
            <option value="">All departments</option>
            {depts?.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-40" aria-label="Status">
            <option value="current">Current</option>
            <option value="onboarding">Onboarding</option>
            <option value="offboarded">Former</option>
            <option value="all">Everyone</option>
          </Select>
        </div>

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
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Department</th>
                  <th className="px-4 py-2.5 font-medium">Manager</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer hover:bg-surface-2/60"
                    onClick={() => navigate({ to: "/people/$id", params: { id: e.id } })}
                  >
                    <td className="px-4 py-3">
                      <Link to="/people/$id" params={{ id: e.id }} className="flex items-center gap-3" onClick={(ev) => ev.stopPropagation()}>
                        <Avatar name={e.fullName} src={e.image} className="size-9" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            <span className="truncate">{e.fullName}</span>
                            <StatusBadge status={e.status} />
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{e.jobTitle ?? e.workEmail ?? "—"}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {e.departmentName ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="size-2 rounded-full" style={{ background: e.departmentColor ?? "var(--people)" }} />
                          {e.departmentName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.managerName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{EMPLOYMENT_LABEL[e.employmentType]}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.employeeCode}</td>
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
