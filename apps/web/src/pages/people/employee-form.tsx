import { Button, DateInput, Dialog, DialogContent, Field, Input, Select } from "@hephaestus/ui";
import { useState } from "react";
import { api } from "../../lib/api.ts";
import {
  EMPLOYMENT_LABEL,
  type Employee,
  type EmploymentType,
  PEOPLE_KEYS,
  useApiMutation,
  useDepartments,
  useEmployees,
} from "../../lib/people.ts";

interface FormState {
  fullName: string;
  workEmail: string;
  jobTitle: string;
  departmentId: string;
  managerId: string;
  employmentType: EmploymentType;
  joinDate: string;
  location: string;
  phone: string;
  birthday: string;
}

const empty: FormState = {
  fullName: "",
  workEmail: "",
  jobTitle: "",
  departmentId: "",
  managerId: "",
  employmentType: "full_time",
  joinDate: new Date().toISOString().slice(0, 10),
  location: "",
  phone: "",
  birthday: "",
};

/** Create or edit an employee. `employee` given = edit mode. */
export function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee & { phone?: string | null; birthday?: string | null };
  onSaved?: (id: string) => void;
}) {
  const initial: FormState = employee
    ? {
        fullName: employee.fullName,
        workEmail: employee.workEmail ?? "",
        jobTitle: employee.jobTitle ?? "",
        departmentId: employee.departmentId ?? "",
        managerId: employee.managerId ?? "",
        employmentType: employee.employmentType,
        joinDate: employee.joinDate ?? "",
        location: employee.location ?? "",
        phone: employee.phone ?? "",
        birthday: employee.birthday ?? "",
      }
    : empty;
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const { data: depts } = useDepartments();
  const { data: people } = useEmployees();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const save = useApiMutation(
    async (f: FormState) => {
      const body = {
        fullName: f.fullName,
        workEmail: f.workEmail || null,
        jobTitle: f.jobTitle || null,
        departmentId: f.departmentId || null,
        managerId: f.managerId || null,
        employmentType: f.employmentType,
        joinDate: f.joinDate || null,
        location: f.location || null,
        phone: f.phone || null,
        birthday: f.birthday || null,
      };
      if (employee) {
        await api(`employees/${employee.id}`, { method: "PATCH", body: JSON.stringify(body) });
        return employee.id;
      }
      const res = await api<{ employee: { id: string } }>("employees", { method: "POST", body: JSON.stringify(body) });
      return res.employee.id;
    },
    {
      invalidate: PEOPLE_KEYS,
      success: employee ? "Profile updated" : "Employee added",
      onSuccess: (id) => {
        onOpenChange(false);
        if (!employee) setForm(empty);
        onSaved?.(id);
      },
    },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.fullName.trim()) next.fullName = "Enter a name";
    if (form.workEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.workEmail)) next.workEmail = "Enter a valid email";
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate(form);
  };

  const managers = (people?.employees ?? []).filter((p) => p.id !== employee?.id);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setForm(initial) : null, onOpenChange(o))}>
      <DialogContent
        title={employee ? "Edit profile" : "Add employee"}
        description={employee ? employee.employeeCode : "They'll be linked to their Webrizen account automatically when the work email matches."}
        className="w-[min(640px,calc(100vw-32px))]"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="employee-form" variant="primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : employee ? "Save changes" : "Add employee"}
            </Button>
          </>
        }
      >
        <form id="employee-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Full name" error={errors.fullName} className="sm:col-span-2">
            <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} autoFocus maxLength={120} />
          </Field>
          <Field label="Work email" error={errors.workEmail}>
            <Input type="email" value={form.workEmail} onChange={(e) => set("workEmail", e.target.value)} placeholder="name@company.com" />
          </Field>
          <Field label="Job title">
            <Input value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} placeholder="Senior designer" maxLength={120} />
          </Field>
          <Field label="Department">
            <Select value={form.departmentId} onChange={(e) => set("departmentId", e.target.value)}>
              <option value="">No department</option>
              {depts?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Manager">
            <Select value={form.managerId} onChange={(e) => set("managerId", e.target.value)}>
              <option value="">No manager</option>
              {managers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Employment type">
            <Select value={form.employmentType} onChange={(e) => set("employmentType", e.target.value as EmploymentType)}>
              {Object.entries(EMPLOYMENT_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Joining date">
            <DateInput value={form.joinDate} onChange={(v) => set("joinDate", v)} />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Mumbai" maxLength={120} />
          </Field>
          <Field label="Phone" hint="Visible to HR and the employee only">
            <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" maxLength={32} />
          </Field>
          <Field label="Birthday" hint="Visible to HR and the employee only">
            <DateInput value={form.birthday} onChange={(v) => set("birthday", v)} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}
