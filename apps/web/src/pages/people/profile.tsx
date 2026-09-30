import { Avatar, Badge, Button, Card, Dialog, DialogContent, Field, Input, Skeleton } from "@hephaestus/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Briefcase, Cake, FileText, Mail, MapPin, Paperclip, Pencil, Phone, Trash2, UserMinus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api.ts";
import {
  EMPLOYMENT_LABEL,
  formatDate,
  PEOPLE_KEYS,
  useApiMutation,
  useBalances,
  useEmployee,
  useOnboardingRuns,
} from "../../lib/people.ts";
import { StatusBadge } from "./directory.tsx";
import { EmployeeFormDialog } from "./employee-form.tsx";
import { PageBody } from "./layout.tsx";

function Detail({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-sm">{children}</div>
      </div>
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Documents({ employeeId, canDelete }: { employeeId: string; canDelete: boolean }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const key = ["attachments", "employee", employeeId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () =>
      api<{ attachments: { id: string; name: string; size: number; createdAt: string }[] }>(
        `attachments?ownerType=employee&ownerId=${employeeId}`,
      ),
  });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        form.set("ownerType", "employee");
        form.set("ownerId", employeeId);
        await api("files", { method: "POST", body: form });
      }
      toast.success(files.length === 1 ? "Document uploaded" : `${files.length} documents uploaded`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
      await qc.invalidateQueries({ queryKey: key });
    }
  };

  const remove = useApiMutation((id: string) => api(`files/${id}`, { method: "DELETE" }), {
    invalidate: ["attachments"],
    success: "Document removed",
  });

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Documents</h2>
        <Button size="sm" onClick={() => input.current?.click()} disabled={uploading}>
          <Paperclip /> {uploading ? "Uploading…" : "Upload"}
        </Button>
        <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Only HR and this person can see these. Up to 25 MB each.</p>
      <ul className="mt-4 divide-y divide-border">
        {data?.attachments.length === 0 ? <li className="py-2 text-sm text-muted-foreground">No documents yet.</li> : null}
        {data?.attachments.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
            <FileText className="size-4 text-muted-foreground" />
            <a href={`/api/v1/files/${a.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
              {a.name}
            </a>
            <span className="font-mono text-xs text-muted-foreground">{formatBytes(a.size)}</span>
            {canDelete ? (
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => confirm(`Remove ${a.name}?`) && remove.mutate(a.id)}
                className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OffboardDialog({ open, onOpenChange, id, name }: { open: boolean; onOpenChange: (o: boolean) => void; id: string; name: string }) {
  const [exitDate, setExitDate] = useState(new Date().toISOString().slice(0, 10));
  const offboard = useApiMutation(() => api(`employees/${id}/offboard`, { method: "POST", body: JSON.stringify({ exitDate }) }), {
    invalidate: PEOPLE_KEYS,
    success: `${name} was offboarded`,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Offboard ${name}?`}
        description="They'll move to former employees. Their direct reports move up to their manager."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => offboard.mutate(undefined)} disabled={offboard.isPending}>
              Offboard
            </Button>
          </>
        }
      >
        <Field label="Last working day">
          <Input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
        </Field>
      </DialogContent>
    </Dialog>
  );
}

export function ProfilePage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { data, isLoading, error } = useEmployee(id);
  const { data: balances } = useBalances(data?.access.seesPrivate || data?.access.isSelf ? id : undefined);
  const { data: runs } = useOnboardingRuns({ employeeId: id });
  const [editing, setEditing] = useState(false);
  const [offboarding, setOffboarding] = useState(false);

  if (isLoading) {
    return (
      <PageBody>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageBody>
    );
  }
  if (error || !data) {
    return (
      <PageBody>
        <p className="text-sm text-muted-foreground">{error?.message ?? "Employee not found"}</p>
      </PageBody>
    );
  }

  const { employee: e, reports, teams, access } = data;
  const activeRun = runs?.runs.find((r) => !r.completedAt);

  return (
    <PageBody>
      <Link to="/people/directory" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Directory
      </Link>

      <Card className="relative overflow-hidden">
        <div className="h-20 bg-[linear-gradient(120deg,color-mix(in_srgb,var(--people)_35%,transparent),transparent_70%)]" />
        <div className="flex flex-wrap items-end gap-4 px-6 pb-6">
          <Avatar name={e.fullName} src={e.image} className="-mt-10 size-20 border-4 border-surface text-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{e.fullName}</h1>
              <StatusBadge status={e.status} />
              {access.isSelf ? <Badge tone="people">You</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {[e.jobTitle, e.departmentName].filter(Boolean).join(" · ") || "No title yet"}
            </p>
          </div>
          <div className="flex gap-2">
            {access.canEdit ? (
              <Button onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            ) : null}
            {access.canArchive && e.status !== "offboarded" ? (
              <Button variant="ghost" onClick={() => setOffboarding(true)}>
                <UserMinus /> Offboard
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card className="grid gap-5 p-6 sm:grid-cols-2">
            <Detail icon={<Mail />} label="Work email">
              {e.workEmail ? (
                <a href={`mailto:${e.workEmail}`} className="hover:underline">
                  {e.workEmail}
                </a>
              ) : (
                "—"
              )}
            </Detail>
            <Detail icon={<Briefcase />} label="Employment">
              {EMPLOYMENT_LABEL[e.employmentType]} · <span className="font-mono text-xs">{e.employeeCode}</span>
            </Detail>
            <Detail icon={<MapPin />} label="Location">
              {e.location ?? "—"}
            </Detail>
            <Detail icon={<Briefcase />} label="Joined">
              {formatDate(e.joinDate)}
              {e.exitDate ? ` · left ${formatDate(e.exitDate)}` : ""}
            </Detail>
            {access.seesPrivate ? (
              <>
                <Detail icon={<Phone />} label="Phone">
                  {e.phone ?? "—"}
                </Detail>
                <Detail icon={<Cake />} label="Birthday">
                  {formatDate(e.birthday, { day: "numeric", month: "long" })}
                </Detail>
              </>
            ) : null}
          </Card>

          {activeRun ? (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{activeRun.name}</h2>
                <span className="font-mono text-xs text-muted-foreground">
                  {activeRun.done}/{activeRun.total}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-people" style={{ width: `${(activeRun.done / Math.max(1, activeRun.total)) * 100}%` }} />
              </div>
              <Link to="/people/onboarding" className="mt-3 inline-block text-sm text-accent hover:underline">
                Open checklist
              </Link>
            </Card>
          ) : null}

          {access.seesPrivate ? <Documents employeeId={e.id} canDelete={access.canEdit || access.isSelf} /> : null}
        </div>

        <div className="space-y-4">
          <Card className="p-6">
            <h2 className="text-lg font-bold">Reporting</h2>
            <div className="mt-4 text-xs text-muted-foreground">Manager</div>
            {e.managerId ? (
              <Link to="/people/$id" params={{ id: e.managerId }} className="mt-2 flex items-center gap-3 rounded-lg hover:bg-surface-2">
                <Avatar name={e.managerName ?? "?"} />
                <span className="text-sm font-medium">{e.managerName}</span>
              </Link>
            ) : (
              <p className="mt-1 text-sm">—</p>
            )}
            <div className="mt-5 text-xs text-muted-foreground">Direct reports ({reports.length})</div>
            <ul className="mt-2 space-y-2">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link to="/people/$id" params={{ id: r.id }} className="flex items-center gap-3 rounded-lg hover:bg-surface-2">
                    <Avatar name={r.fullName} src={r.image} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.fullName}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.jobTitle ?? "—"}</div>
                    </div>
                  </Link>
                </li>
              ))}
              {reports.length === 0 ? <li className="text-sm">—</li> : null}
            </ul>
            {teams.length ? (
              <>
                <div className="mt-5 text-xs text-muted-foreground">Teams</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {teams.map((t) => (
                    <Badge key={t.id} tone="collab">
                      {t.name}
                    </Badge>
                  ))}
                </div>
              </>
            ) : null}
          </Card>

          {balances && balances.balances.length ? (
            <Card className="p-6">
              <h2 className="text-lg font-bold">Leave in {balances.year}</h2>
              <ul className="mt-4 space-y-3">
                {balances.balances.map((b) => (
                  <li key={b.leaveTypeId} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: b.color }} />
                      <span className="flex-1">{b.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {b.quota === null ? `${b.approved} used` : `${b.remaining} left`}
                      </span>
                    </div>
                    {b.quota ? (
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((b.approved + b.pending) / b.quota) * 100)}%`, background: b.color }} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      {access.canEdit ? <EmployeeFormDialog key={e.id} open={editing} onOpenChange={setEditing} employee={e} /> : null}
      {access.canArchive ? <OffboardDialog open={offboarding} onOpenChange={setOffboarding} id={e.id} name={e.fullName} /> : null}
    </PageBody>
  );
}
