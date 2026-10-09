import {
  type AnyPgColumn,
  boolean,
  date,
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
import { sql } from "drizzle-orm";
import { uuidv7 } from "@operant/core";
import { members, orgs } from "./foundation.ts";

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

export const departments = pgTable(
  "departments",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    description: text("description"),
    parentId: uuid("parent_id").references((): AnyPgColumn => departments.id, { onDelete: "set null" }),
    headEmployeeId: uuid("head_employee_id"),
    color: text("color"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("departments_org_idx").on(t.orgId), uniqueIndex("departments_org_name_key").on(t.orgId, sql`lower(${t.name})`)],
).enableRLS();

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern"] as const;
export const EMPLOYEE_STATUSES = ["onboarding", "active", "offboarded"] as const;

export const employees = pgTable(
  "employees",
  {
    id: id(),
    orgId: orgId(),
    /** Linked sign-in account, if the person has one. */
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    employeeCode: text("employee_code").notNull(),
    fullName: text("full_name").notNull(),
    workEmail: text("work_email"),
    phone: text("phone"),
    jobTitle: text("job_title"),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    managerId: uuid("manager_id").references((): AnyPgColumn => employees.id, { onDelete: "set null" }),
    employmentType: text("employment_type", { enum: EMPLOYMENT_TYPES }).notNull().default("full_time"),
    status: text("status", { enum: EMPLOYEE_STATUSES }).notNull().default("active"),
    joinDate: date("join_date"),
    exitDate: date("exit_date"),
    location: text("location"),
    birthday: date("birthday"),
    /** When they were last invited to sign in (Webrizen invitation), and with which role. */
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    invitedRole: text("invited_role"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("employees_org_idx").on(t.orgId),
    index("employees_manager_idx").on(t.managerId),
    index("employees_department_idx").on(t.departmentId),
    uniqueIndex("employees_org_code_key").on(t.orgId, t.employeeCode),
    uniqueIndex("employees_org_member_key").on(t.orgId, t.memberId),
  ],
).enableRLS();

export const teams = pgTable(
  "teams",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    description: text("description"),
    leadEmployeeId: uuid("lead_employee_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("teams_org_idx").on(t.orgId)],
).enableRLS();

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    orgId: orgId(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.employeeId] }), index("team_members_employee_idx").on(t.employeeId)],
).enableRLS();

/* ---------------- Onboarding ---------------- */

export interface OnboardingTemplateItem {
  title: string;
  description?: string;
  /** Who does it: the new joiner, their manager, or a named person. */
  assignee: "employee" | "manager" | "specific";
  assigneeEmployeeId?: string;
  /** Due this many days after the start date (negative = before). */
  dueOffsetDays: number;
}

export const onboardingTemplates = pgTable(
  "onboarding_templates",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    description: text("description"),
    items: jsonb("items").$type<OnboardingTemplateItem[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("onboarding_templates_org_idx").on(t.orgId)],
).enableRLS();

export const onboardingRuns = pgTable(
  "onboarding_runs",
  {
    id: id(),
    orgId: orgId(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => onboardingTemplates.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("onboarding_runs_employee_idx").on(t.orgId, t.employeeId)],
).enableRLS();

export const onboardingItems = pgTable(
  "onboarding_items",
  {
    id: id(),
    orgId: orgId(),
    runId: uuid("run_id")
      .notNull()
      .references(() => onboardingRuns.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeEmployeeId: uuid("assignee_employee_id").references(() => employees.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    position: integer("position").notNull().default(0),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: text("done_by"),
  },
  (t) => [index("onboarding_items_run_idx").on(t.runId), index("onboarding_items_assignee_idx").on(t.orgId, t.assigneeEmployeeId)],
).enableRLS();

/* ---------------- Leave ---------------- */

export const leaveTypes = pgTable(
  "leave_types",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#2e8b6e"),
    /** Days per calendar year; null = unlimited. */
    annualQuota: numeric("annual_quota", { precision: 5, scale: 1, mode: "number" }),
    paid: boolean("paid").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("leave_types_org_idx").on(t.orgId)],
).enableRLS();

export const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export const HALF_DAY = ["none", "first_half", "second_half"] as const;

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: id(),
    orgId: orgId(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    halfDay: text("half_day", { enum: HALF_DAY }).notNull().default("none"),
    /** Working days, excluding weekends and holidays (computed by the server). */
    days: numeric("days", { precision: 5, scale: 1, mode: "number" }).notNull(),
    reason: text("reason"),
    status: text("status", { enum: LEAVE_STATUSES }).notNull().default("pending"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leave_requests_employee_idx").on(t.orgId, t.employeeId, t.startDate),
    index("leave_requests_status_idx").on(t.orgId, t.status),
  ],
).enableRLS();

export const holidays = pgTable(
  "holidays",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    date: date("date").notNull(),
    optional: boolean("optional").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("holidays_org_date_name_key").on(t.orgId, t.date, t.name)],
).enableRLS();
