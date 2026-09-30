import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api.ts";

export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type EmployeeStatus = "onboarding" | "active" | "offboarded";

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
};

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  managerId: string | null;
  managerName: string | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  joinDate: string | null;
  exitDate: string | null;
  location: string | null;
  memberId: string | null;
  image: string | null;
  userId: string | null;
}

export interface EmployeeDetail {
  employee: Employee & { phone: string | null; birthday: string | null };
  reports: { id: string; fullName: string; jobTitle: string | null; image: string | null }[];
  teams: { id: string; name: string }[];
  access: { isSelf: boolean; canEdit: boolean; canArchive: boolean; seesPrivate: boolean };
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  headEmployeeId: string | null;
  headName: string | null;
  color: string | null;
  headcount: number;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  leadEmployeeId: string | null;
  members: { id: string; fullName: string; jobTitle: string | null; image: string | null }[];
}

export interface LeaveType {
  id: string;
  name: string;
  color: string;
  annualQuota: number | null;
  paid: boolean;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  managerId: string | null;
  image: string | null;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeColor: string;
  startDate: string;
  endDate: string;
  halfDay: "none" | "first_half" | "second_half";
  days: number;
  reason?: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  optional: boolean;
}

export interface Balance {
  leaveTypeId: string;
  name: string;
  color: string;
  quota: number | null;
  approved: number;
  pending: number;
  remaining: number | null;
}

export interface OnboardingTemplateItem {
  title: string;
  description?: string;
  assignee: "employee" | "manager" | "specific";
  assigneeEmployeeId?: string;
  dueOffsetDays: number;
}

export interface OnboardingTemplate {
  id: string;
  name: string;
  description: string | null;
  items: OnboardingTemplateItem[];
}

export interface OnboardingRun {
  id: string;
  name: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  completedAt: string | null;
  total: number;
  done: number;
  items: {
    id: string;
    title: string;
    description: string | null;
    assigneeEmployeeId: string | null;
    assigneeName: string | null;
    dueDate: string | null;
    doneAt: string | null;
  }[];
}

export interface PeopleSummary {
  today: string;
  headcount: number;
  byDepartment: { id: string; name: string; color: string | null; count: number }[];
  joinersThisMonth: { id: string; fullName: string; jobTitle: string | null; joinDate: string | null }[];
  onLeaveToday: { id: string; fullName: string; endDate: string; image: string | null }[];
  pendingLeave: number;
  activeOnboarding: number;
}

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const useEmployees = (params: { q?: string; departmentId?: string; status?: string } = {}) =>
  useQuery({ queryKey: ["employees", params], queryFn: () => api<{ employees: Employee[] }>(`employees${qs(params)}`) });

export const useEmployee = (id: string) =>
  useQuery({ queryKey: ["employee", id], queryFn: () => api<EmployeeDetail>(`employees/${id}`) });

export const useMyEmployee = () =>
  useQuery({
    queryKey: ["employee-me"],
    queryFn: () => api<{ employee: { id: string; fullName: string; managerId: string | null } | null }>("employees/me"),
    staleTime: 60_000,
  });

export const usePeopleSummary = () => useQuery({ queryKey: ["people-summary"], queryFn: () => api<PeopleSummary>("people/summary") });

export const useOrgChart = () =>
  useQuery({
    queryKey: ["org-chart"],
    queryFn: () =>
      api<{
        employees: {
          id: string;
          fullName: string;
          jobTitle: string | null;
          managerId: string | null;
          departmentName: string | null;
          departmentColor: string | null;
          image: string | null;
        }[];
      }>("org-chart"),
  });

export const useDepartments = () => useQuery({ queryKey: ["departments"], queryFn: () => api<{ departments: Department[] }>("departments") });
export const useTeams = () => useQuery({ queryKey: ["teams"], queryFn: () => api<{ teams: Team[] }>("teams") });
export const useLeaveTypes = () => useQuery({ queryKey: ["leave-types"], queryFn: () => api<{ types: LeaveType[] }>("leave/types") });
export const useHolidays = (year?: string) =>
  useQuery({ queryKey: ["holidays", year], queryFn: () => api<{ holidays: Holiday[] }>(`holidays${qs({ year })}`) });
export const useBalances = (employeeId?: string) =>
  useQuery({
    queryKey: ["leave-balances", employeeId],
    queryFn: () => api<{ year: string; balances: Balance[] }>(`leave/balances${qs({ employeeId })}`),
  });
export const useLeaveRequests = (scope: "mine" | "approvals" | "all", status?: string) =>
  useQuery({
    queryKey: ["leave-requests", scope, status],
    queryFn: () => api<{ requests: LeaveRequest[] }>(`leave/requests${qs({ scope, status })}`),
  });
export const useLeaveCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: ["leave-calendar", from, to],
    queryFn: () => api<{ requests: LeaveRequest[]; holidays: Holiday[] }>(`leave/calendar${qs({ from, to })}`),
  });
export const useOnboardingTemplates = () =>
  useQuery({ queryKey: ["onboarding-templates"], queryFn: () => api<{ templates: OnboardingTemplate[] }>("onboarding/templates") });
export const useOnboardingRuns = (params: { employeeId?: string; active?: "true" | "false" } = {}) =>
  useQuery({ queryKey: ["onboarding-runs", params], queryFn: () => api<{ runs: OnboardingRun[] }>(`onboarding/runs${qs(params)}`) });
export const useMyOnboardingItems = () =>
  useQuery({
    queryKey: ["onboarding-my-items"],
    queryFn: () =>
      api<{ items: { id: string; title: string; dueDate: string | null; runName: string; employeeName: string }[] }>("onboarding/my-items"),
  });

/** A mutation that toasts errors and refreshes the given query families on success. */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { invalidate: string[]; success?: string; onSuccess?: (r: TResult, vars: TVars) => void },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      await Promise.all(opts.invalidate.map((k) => qc.invalidateQueries({ queryKey: [k] })));
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(result, vars);
    },
    onError: (e) => toast.error(e.message),
  });
}

export const PEOPLE_KEYS = ["employees", "employee", "people-summary", "org-chart", "departments", "teams", "employee-me"];
export const LEAVE_KEYS = ["leave-requests", "leave-balances", "leave-calendar", "people-summary"];

export function formatDate(date: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!date) return "—";
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", opts);
}

export function formatRange(start: string, end: string) {
  if (start === end) return formatDate(start, { day: "numeric", month: "short" });
  return `${formatDate(start, { day: "numeric", month: "short" })} – ${formatDate(end, { day: "numeric", month: "short" })}`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
