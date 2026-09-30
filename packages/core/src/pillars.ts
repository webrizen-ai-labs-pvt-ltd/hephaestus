export const PILLARS = ["people", "work", "collab", "finance"] as const;
export type Pillar = (typeof PILLARS)[number];

/** Default labels. Organizations can rename terms (e.g. "Project" → "Case"). */
export const DEFAULT_TERMS = {
  project: { one: "Project", many: "Projects" },
  task: { one: "Task", many: "Tasks" },
  client: { one: "Client", many: "Clients" },
  employee: { one: "Employee", many: "Employees" },
} as const;

export type TermKey = keyof typeof DEFAULT_TERMS;
export type Terms = Record<TermKey, { one: string; many: string }>;
