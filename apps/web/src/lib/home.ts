import { useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";
import type { Priority, StageCategory } from "./work.ts";

export interface HomeData {
  today: string;
  workWeek: number[];
  me: { employeeId: string; name: string } | null;
  day: {
    buckets: { overdue: number; today: number; week: number; later: number; noDate: number };
    tasks: {
      id: string;
      title: string;
      status: StageCategory;
      priority: Priority;
      dueDate: string | null;
      projectId: string | null;
      number: number | null;
      projectKey: string | null;
      projectName: string | null;
      projectColor: string | null;
      source: string | null;
    }[];
    openTotal: number;
    doneThisWeek: number;
  };
  attention: { kind: string; count: number; title: string; detail?: string; link: string; amount?: number }[];
  counts: { notifications: number; chat: number; myOpenTasks: number; attention: number };
  people: { headcount: number; joinersThisMonth: number; away: { id: string; name: string; image: string | null; until: string }[] };
  work: {
    open: number;
    overdue: number;
    inProgress: number;
    velocity: { day: string; done: number }[];
    projects: { id: string; name: string; key: string; color: string; dueDate: string | null; total: number; done: number; overdue: number }[];
  };
  finance: null | {
    currency: string;
    outstanding: number;
    overdue: number;
    collectedThisMonth: number;
    collectedLastMonth: number;
    monthly: { month: string; amount: number }[];
  };
  upcoming: { date: string; kind: "holiday" | "milestone" | "leave" | "task"; title: string; detail?: string; link?: string; color?: string }[];
  activity: {
    id: string;
    action: string;
    actorId: string | null;
    actorName: string | null;
    actorImage: string | null;
    targetType: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }[];
}

export const useHome = () => useQuery({ queryKey: ["home"], queryFn: () => api<HomeData>("home"), staleTime: 15_000 });
