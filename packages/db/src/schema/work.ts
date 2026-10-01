import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "@hephaestus/core";
import { orgs } from "./foundation.ts";
import { employees } from "./people.ts";

const id = () => uuid("id").primaryKey().$defaultFn(uuidv7);
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date());

export const GOAL_STATUSES = ["on_track", "at_risk", "off_track", "done"] as const;

export const goals = pgTable(
  "goals",
  {
    id: id(),
    orgId: orgId(),
    title: text("title").notNull(),
    description: text("description"),
    ownerEmployeeId: uuid("owner_employee_id").references(() => employees.id, { onDelete: "set null" }),
    status: text("status", { enum: GOAL_STATUSES }).notNull().default("on_track"),
    targetDate: date("target_date"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("goals_org_idx").on(t.orgId)],
).enableRLS();

export const PROJECT_STATUSES = ["active", "paused", "completed", "archived"] as const;

export const projects = pgTable(
  "projects",
  {
    id: id(),
    orgId: orgId(),
    /** Short code used in task numbers, e.g. WEB → WEB-42. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    leadEmployeeId: uuid("lead_employee_id").references(() => employees.id, { onDelete: "set null" }),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
    color: text("color").notNull().default("#ff5a1f"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_org_idx").on(t.orgId), uniqueIndex("projects_org_key_key").on(t.orgId, t.key)],
).enableRLS();

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    orgId: orgId(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.employeeId] }), index("project_members_employee_idx").on(t.employeeId)],
).enableRLS();

/** Every stage maps to one of four categories, so reports work across custom workflows. */
export const STAGE_CATEGORIES = ["todo", "in_progress", "review", "done"] as const;
export type StageCategory = (typeof STAGE_CATEGORIES)[number];

export const workflowStages = pgTable(
  "workflow_stages",
  {
    id: id(),
    orgId: orgId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category", { enum: STAGE_CATEGORIES }).notNull(),
    color: text("color"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("workflow_stages_project_idx").on(t.projectId, t.position)],
).enableRLS();

export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    orgId: orgId(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("milestones_project_idx").on(t.projectId)],
).enableRLS();

export const labels = pgTable(
  "labels",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#8a8178"),
  },
  (t) => [uniqueIndex("labels_org_name_key").on(t.orgId, sql`lower(${t.name})`)],
).enableRLS();

export const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Recurrence {
  freq: "daily" | "weekly" | "monthly";
  interval: number;
}

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    orgId: orgId(),
    /** Null for personal tasks and tasks created by other pillars (e.g. onboarding). */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    /** Per-project number (WEB-42). */
    number: integer("number"),
    stageId: uuid("stage_id").references(() => workflowStages.id, { onDelete: "set null" }),
    /** Mirrors the stage's category so cross-project queries don't need joins. */
    status: text("status", { enum: STAGE_CATEGORIES }).notNull().default("todo"),
    parentId: uuid("parent_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority", { enum: PRIORITIES }).notNull().default("none"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    estimateHours: numeric("estimate_hours", { precision: 6, scale: 1, mode: "number" }),
    /** Board order inside a stage (fractional, so moves touch one row). */
    position: doublePrecision("position").notNull().default(0),
    recurrence: jsonb("recurrence").$type<Recurrence>(),
    /** Where the task came from, e.g. ("onboarding", <item id>). */
    source: text("source"),
    sourceId: uuid("source_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_project_stage_idx").on(t.projectId, t.stageId, t.position),
    index("tasks_org_status_due_idx").on(t.orgId, t.status, t.dueDate),
    index("tasks_parent_idx").on(t.parentId),
    index("tasks_milestone_idx").on(t.milestoneId),
    index("tasks_source_idx").on(t.source, t.sourceId),
    uniqueIndex("tasks_project_number_key").on(t.projectId, t.number),
  ],
).enableRLS();

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    orgId: orgId(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.employeeId] }), index("task_assignees_employee_idx").on(t.orgId, t.employeeId)],
).enableRLS();

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    orgId: orgId(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] })],
).enableRLS();

/** `taskId` is blocked by `blockedById`. */
export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    blockedById: uuid("blocked_by_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    orgId: orgId(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.blockedById] }), index("task_dependencies_blocker_idx").on(t.blockedById)],
).enableRLS();

export const taskActivity = pgTable(
  "task_activity",
  {
    id: id(),
    orgId: orgId(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("task_activity_task_idx").on(t.taskId, t.createdAt)],
).enableRLS();
