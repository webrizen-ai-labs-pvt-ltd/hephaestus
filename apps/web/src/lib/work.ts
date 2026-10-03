import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";

export type StageCategory = "todo" | "in_progress" | "review" | "done";
export type Priority = "none" | "low" | "medium" | "high" | "urgent";
export type Recurrence = { freq: "daily" | "weekly" | "monthly"; interval: number };

export const PRIORITY_META: Record<Priority, { label: string; color: string; rank: number }> = {
  urgent: { label: "Urgent", color: "var(--color-fg-error-primary)", rank: 0 },
  high: { label: "High", color: "var(--work)", rank: 1 },
  medium: { label: "Medium", color: "var(--finance)", rank: 2 },
  low: { label: "Low", color: "var(--collab)", rank: 3 },
  none: { label: "No priority", color: "var(--color-text-tertiary)", rank: 4 },
};

export const STATUS_META: Record<StageCategory, { label: string; color: string }> = {
  todo: { label: "To do", color: "var(--collab)" },
  in_progress: { label: "In progress", color: "var(--work)" },
  review: { label: "In review", color: "var(--finance)" },
  done: { label: "Done", color: "var(--color-fg-success-primary)" },
};

export interface Person {
  id: string;
  fullName: string;
  image: string | null;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface TaskCard {
  id: string;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  projectColor: string | null;
  number: number | null;
  stageId: string | null;
  stageName: string | null;
  status: StageCategory;
  parentId: string | null;
  milestoneId: string | null;
  title: string;
  priority: Priority;
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  position: number;
  recurrence: Recurrence | null;
  source: string | null;
  completedAt: string | null;
  assignees: Person[];
  labels: Label[];
  subtasks: { total: number; done: number };
  blocked: boolean;
}

export interface TaskDetail {
  task: TaskCard & { description: string | null; createdAt: string; createdBy: string | null };
  parent: { id: string; title: string; number: number | null } | null;
  subtasks: TaskCard[];
  blockedBy: TaskRef[];
  blocking: TaskRef[];
  activity: { id: string; actorName: string | null; type: string; data: Record<string, unknown>; createdAt: string }[];
}

export interface TaskRef {
  id: string;
  title: string;
  status: StageCategory;
  number: number | null;
  projectKey: string | null;
}

export interface Stage {
  id: string;
  name: string;
  category: StageCategory;
  color: string | null;
  position: number;
}

export interface Milestone {
  id: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  amount: number | null;
  invoiceId: string | null;
  completedAt: string | null;
  total: number;
  done: number;
  overdue: number;
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "completed" | "archived";
  color: string;
  startDate: string | null;
  dueDate: string | null;
  goalId: string | null;
  clientId: string | null;
  leadEmployeeId: string | null;
  leadName: string | null;
  total: number;
  done: number;
  overdue: number;
}

export interface ProjectDetail {
  project: Omit<ProjectSummary, "total" | "done" | "overdue"> & { goalTitle: string | null; clientName: string | null };
  stages: Stage[];
  milestones: Milestone[];
  members: { id: string; fullName: string; jobTitle: string | null }[];
}

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: "on_track" | "at_risk" | "off_track" | "done";
  targetDate: string | null;
  ownerEmployeeId: string | null;
  ownerName: string | null;
  progress: number;
  projects: { id: string; name: string; color: string; total: number; done: number }[];
}

export const GOAL_STATUS: Record<Goal["status"], { label: string; tone: "people" | "finance" | "danger" | "neutral" }> = {
  on_track: { label: "On track", tone: "people" },
  at_risk: { label: "At risk", tone: "finance" },
  off_track: { label: "Off track", tone: "danger" },
  done: { label: "Done", tone: "neutral" },
};

export const WORK_KEYS = ["tasks", "task", "my-work", "projects", "project", "goals", "workload"];

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const useProjects = (status = "current") =>
  useQuery({ queryKey: ["projects", status], queryFn: () => api<{ projects: ProjectSummary[] }>(`projects${qs({ status })}`) });
export const useProject = (id: string) =>
  useQuery({ queryKey: ["project", id], queryFn: () => api<ProjectDetail>(`projects/${id}`), enabled: Boolean(id) });
export const useTasks = (params: { projectId?: string; assignee?: string; dueFrom?: string; dueTo?: string; status?: string }) =>
  useQuery({ queryKey: ["tasks", params], queryFn: () => api<{ tasks: TaskCard[] }>(`tasks${qs(params)}`) });
export const useTask = (id: string | undefined) =>
  useQuery({ queryKey: ["task", id], queryFn: () => api<TaskDetail>(`tasks/${id}`), enabled: Boolean(id) });
export const useMyWork = () =>
  useQuery({ queryKey: ["my-work"], queryFn: () => api<{ today: string; tasks: TaskCard[]; linked: boolean }>("work/my") });
export const useGoals = () => useQuery({ queryKey: ["goals"], queryFn: () => api<{ goals: Goal[] }>("goals") });
export const useLabels = () => useQuery({ queryKey: ["labels"], queryFn: () => api<{ labels: Label[] }>("labels") });
export const useWorkload = (weeks: number) =>
  useQuery({
    queryKey: ["workload", weeks],
    queryFn: () =>
      api<{
        today: string;
        weeks: string[];
        people: (Person & { jobTitle: string | null; overdue: number; unscheduled: number; weeks: { tasks: number; hours: number; leaveDays: number }[] })[];
      }>(`work/workload?weeks=${weeks}`),
  });

export function taskRef(t: { projectKey: string | null; number: number | null }) {
  return t.projectKey && t.number ? `${t.projectKey}-${t.number}` : null;
}
