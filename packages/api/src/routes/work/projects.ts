import { addDays, DEFAULT_STAGES, isIsoDate, projectKeyFrom, todayIn } from "@operant/core";
import {
  employees,
  GOAL_STATUSES,
  goals,
  invoices,
  labels,
  milestones,
  PROJECT_STATUSES,
  projectMembers,
  projects,
  STAGE_CATEGORIES,
  taxRates,
  tasks,
  workflowStages,
} from "@operant/db";
import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { audit } from "../../audit.ts";
import type { AppEnv } from "../../context.ts";
import { loadClient, loadSettings, placeOfSupplyFor, writeLines } from "../../finance/service.ts";
import { notFound, orgWorkSettings } from "../../helpers.ts";
import { requirePermission } from "../../middleware.ts";
import { validate } from "../../validate.ts";

type DbT = AppEnv["Variables"]["deps"]["db"];

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD)");
const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a hex colour");

function isUnique(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e?.cause?.code ?? e?.code) === "23505";
}

export async function assertProject(db: DbT, orgId: string, projectId: string) {
  const [p] = await db
    .select({ id: projects.id, key: projects.key, name: projects.name, status: projects.status })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)));
  if (!p) notFound("Project not found");
  return p;
}

async function assertEmployees(db: DbT, orgId: string, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!list.length) return;
  const [row] = await db.select({ n: count() }).from(employees).where(and(eq(employees.orgId, orgId), inArray(employees.id, list)));
  if ((row?.n ?? 0) !== list.length) throw new HTTPException(422, { message: "Unknown employee" });
}

/** A free project key: the suggested one, or with a number appended. */
async function freeKey(db: DbT, orgId: string, base: string) {
  const taken = new Set(
    (await db.select({ key: projects.key }).from(projects).where(and(eq(projects.orgId, orgId), sql`${projects.key} like ${`${base}%`}`))).map(
      (r) => r.key,
    ),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

const projectInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(100),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9]{1,5}$/, "2–6 letters or digits, starting with a letter")
    .optional(),
  description: z.string().trim().max(2000).nullish(),
  goalId: z.uuid().nullish(),
  clientId: z.uuid().nullish(),
  leadEmployeeId: z.uuid().nullish(),
  color: hex.optional(),
  startDate: isoDate.nullish(),
  dueDate: isoDate.nullish(),
  memberIds: z.array(z.uuid()).max(500).optional(),
});

/** Progress columns shared by the project list and goal roll-ups. */
const progressColumns = {
  total: sql<number>`count(${tasks.id}) filter (where ${tasks.parentId} is null)`.mapWith(Number),
  done: sql<number>`count(${tasks.id}) filter (where ${tasks.parentId} is null and ${tasks.status} = 'done')`.mapWith(Number),
  overdue: sql<number>`count(${tasks.id}) filter (where ${tasks.parentId} is null and ${tasks.status} <> 'done' and ${tasks.dueDate} < current_date)`.mapWith(Number),
};

export const projectRoutes = new Hono<AppEnv>()

  /* ---------------- Goals ---------------- */

  .get("/goals", requirePermission("project", "read"), async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const rows = await db
      .select({
        id: goals.id,
        title: goals.title,
        description: goals.description,
        status: goals.status,
        targetDate: goals.targetDate,
        ownerEmployeeId: goals.ownerEmployeeId,
        ownerName: employees.fullName,
      })
      .from(goals)
      .leftJoin(employees, eq(employees.id, goals.ownerEmployeeId))
      .where(eq(goals.orgId, org.id))
      .orderBy(asc(goals.targetDate), asc(goals.title));
    const linked = await db
      .select({ goalId: projects.goalId, id: projects.id, name: projects.name, color: projects.color, ...progressColumns })
      .from(projects)
      .leftJoin(tasks, eq(tasks.projectId, projects.id))
      .where(and(eq(projects.orgId, org.id), ne(projects.status, "archived"), sql`${projects.goalId} is not null`))
      .groupBy(projects.id);
    return c.json({
      goals: rows.map((g) => {
        const ps = linked.filter((p) => p.goalId === g.id);
        const total = ps.reduce((n, p) => n + p.total, 0);
        const done = ps.reduce((n, p) => n + p.done, 0);
        return { ...g, projects: ps, progress: total ? Math.round((done / total) * 100) : 0 };
      }),
    });
  })

  .post(
    "/goals",
    requirePermission("project", "create"),
    validate(
      "json",
      z.object({
        title: z.string().trim().min(1, "Enter a goal").max(200),
        description: z.string().trim().max(2000).nullish(),
        ownerEmployeeId: z.uuid().nullish(),
        status: z.enum(GOAL_STATUSES).default("on_track"),
        targetDate: isoDate.nullish(),
      }),
    ),
    async (c) => {
      const input = c.req.valid("json");
      const { db } = c.get("deps");
      await assertEmployees(db, c.get("org").id, [input.ownerEmployeeId]);
      const [row] = await db.insert(goals).values({ ...input, orgId: c.get("org").id }).returning({ id: goals.id });
      await audit(c, "goal.created", { type: "goal", id: row!.id }, { title: input.title });
      return c.json({ goal: row }, 201);
    },
  )

  .patch(
    "/goals/:id",
    requirePermission("project", "update"),
    validate(
      "json",
      z
        .object({
          title: z.string().trim().min(1).max(200),
          description: z.string().trim().max(2000).nullable(),
          ownerEmployeeId: z.uuid().nullable(),
          status: z.enum(GOAL_STATUSES),
          targetDate: isoDate.nullable(),
        })
        .partial(),
    ),
    async (c) => {
      const input = c.req.valid("json");
      const { db } = c.get("deps");
      await assertEmployees(db, c.get("org").id, [input.ownerEmployeeId]);
      const [row] = await db
        .update(goals)
        .set(input)
        .where(and(eq(goals.orgId, c.get("org").id), eq(goals.id, c.req.param("id"))))
        .returning({ id: goals.id });
      if (!row) notFound("Goal not found");
      await audit(c, "goal.updated", { type: "goal", id: row.id }, { fields: Object.keys(input) });
      return c.json({ ok: true });
    },
  )

  .delete("/goals/:id", requirePermission("project", "archive"), async (c) => {
    const { db } = c.get("deps");
    const [row] = await db
      .delete(goals)
      .where(and(eq(goals.orgId, c.get("org").id), eq(goals.id, c.req.param("id"))))
      .returning({ id: goals.id, title: goals.title });
    if (!row) notFound("Goal not found");
    await audit(c, "goal.deleted", { type: "goal", id: row.id }, { title: row.title });
    return c.json({ ok: true });
  })

  /* ---------------- Projects ---------------- */

  .get(
    "/projects",
    requirePermission("project", "read"),
    validate("query", z.object({ status: z.enum([...PROJECT_STATUSES, "current"]).default("current") })),
    async (c) => {
      const { status } = c.req.valid("query");
      const { db } = c.get("deps");
      const org = c.get("org");
      const rows = await db
        .select({
          id: projects.id,
          key: projects.key,
          name: projects.name,
          description: projects.description,
          status: projects.status,
          color: projects.color,
          startDate: projects.startDate,
          dueDate: projects.dueDate,
          goalId: projects.goalId,
          clientId: projects.clientId,
          leadEmployeeId: projects.leadEmployeeId,
          leadName: employees.fullName,
          ...progressColumns,
        })
        .from(projects)
        .leftJoin(employees, eq(employees.id, projects.leadEmployeeId))
        .leftJoin(tasks, eq(tasks.projectId, projects.id))
        .where(
          and(
            eq(projects.orgId, org.id),
            status === "current" ? inArray(projects.status, ["active", "paused"]) : eq(projects.status, status),
          ),
        )
        .groupBy(projects.id, employees.fullName)
        .orderBy(asc(projects.name));
      return c.json({ projects: rows });
    },
  )

  .get("/projects/:id", requirePermission("project", "read"), async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const id = c.req.param("id");
    const [project] = await db
      .select({
        id: projects.id,
        key: projects.key,
        name: projects.name,
        description: projects.description,
        status: projects.status,
        color: projects.color,
        startDate: projects.startDate,
        dueDate: projects.dueDate,
        goalId: projects.goalId,
        goalTitle: goals.title,
        clientId: projects.clientId,
        clientName: sql<string | null>`(select name from clients cl where cl.id = ${projects.clientId})`,
        leadEmployeeId: projects.leadEmployeeId,
        leadName: employees.fullName,
      })
      .from(projects)
      .leftJoin(employees, eq(employees.id, projects.leadEmployeeId))
      .leftJoin(goals, eq(goals.id, projects.goalId))
      .where(and(eq(projects.orgId, org.id), eq(projects.id, id)));
    if (!project) notFound("Project not found");

    const stages = await db.select().from(workflowStages).where(eq(workflowStages.projectId, id)).orderBy(asc(workflowStages.position));
    const ms = await db
      .select({
        id: milestones.id,
        name: milestones.name,
        description: milestones.description,
        dueDate: milestones.dueDate,
        amount: milestones.amount,
        completedAt: milestones.completedAt,
        position: milestones.position,
        invoiceId: sql<string | null>`(select i.id from invoices i where i.milestone_id = ${milestones.id} and i.status <> 'void' limit 1)`,
        ...progressColumns,
      })
      .from(milestones)
      .leftJoin(tasks, eq(tasks.milestoneId, milestones.id))
      .where(eq(milestones.projectId, id))
      .groupBy(milestones.id)
      .orderBy(asc(milestones.dueDate), asc(milestones.position));
    const team = await db
      .select({ id: employees.id, fullName: employees.fullName, jobTitle: employees.jobTitle })
      .from(projectMembers)
      .innerJoin(employees, eq(employees.id, projectMembers.employeeId))
      .where(eq(projectMembers.projectId, id))
      .orderBy(asc(employees.fullName));
    return c.json({ project, stages, milestones: ms, members: team });
  })

  .post(
    "/projects",
    requirePermission("project", "create"),
    validate("json", projectInput.extend({ templateProjectId: z.uuid().optional() })),
    async (c) => {
      const { memberIds = [], templateProjectId, ...input } = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      await assertEmployees(db, org.id, [input.leadEmployeeId, ...memberIds]);
      if (input.goalId) {
        const [g] = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.orgId, org.id), eq(goals.id, input.goalId)));
        if (!g) throw new HTTPException(422, { message: "Unknown goal" });
      }
      if (input.clientId) await loadClient(db, org.id, input.clientId);
      const template = templateProjectId ? await assertProject(db, org.id, templateProjectId) : null;
      const key = input.key ?? (await freeKey(db, org.id, projectKeyFrom(input.name)));

      try {
        const projectId = await db.transaction(async (tx) => {
          const [p] = await tx
            .insert(projects)
            .values({ ...input, key, orgId: org.id, createdBy: c.get("viewer")!.userId })
            .returning({ id: projects.id });
          const pid = p!.id;
          const members = [...new Set([...memberIds, ...(input.leadEmployeeId ? [input.leadEmployeeId] : [])])];
          if (members.length) await tx.insert(projectMembers).values(members.map((employeeId) => ({ projectId: pid, employeeId, orgId: org.id })));

          if (!template) {
            await tx.insert(workflowStages).values(DEFAULT_STAGES.map((s, position) => ({ ...s, position, orgId: org.id, projectId: pid })));
            return pid;
          }

          // Copy stages, milestones (dates shifted to the new start) and top-level tasks from the template.
          const srcStages = await tx.select().from(workflowStages).where(eq(workflowStages.projectId, template.id)).orderBy(asc(workflowStages.position));
          const stageMap = new Map<string, string>();
          for (const s of srcStages) {
            const [ns] = await tx
              .insert(workflowStages)
              .values({ orgId: org.id, projectId: pid, name: s.name, category: s.category, color: s.color, position: s.position })
              .returning({ id: workflowStages.id });
            stageMap.set(s.id, ns!.id);
          }
          const [src] = await tx.select({ startDate: projects.startDate }).from(projects).where(eq(projects.id, template.id));
          const shift = (d: string | null) => {
            if (!d || !src?.startDate || !input.startDate) return null;
            const days = Math.round((Date.parse(d) - Date.parse(src.startDate)) / 86_400_000);
            return addDays(input.startDate, days);
          };
          const msMap = new Map<string, string>();
          for (const m of await tx.select().from(milestones).where(eq(milestones.projectId, template.id))) {
            const [nm] = await tx
              .insert(milestones)
              .values({ orgId: org.id, projectId: pid, name: m.name, description: m.description, dueDate: shift(m.dueDate), position: m.position })
              .returning({ id: milestones.id });
            msMap.set(m.id, nm!.id);
          }
          const firstStage = srcStages[0] ? stageMap.get(srcStages[0].id)! : null;
          const srcTasks = await tx
            .select()
            .from(tasks)
            .where(and(eq(tasks.projectId, template.id), sql`${tasks.parentId} is null`))
            .orderBy(asc(tasks.number));
          let n = 0;
          for (const t of srcTasks) {
            n++;
            await tx.insert(tasks).values({
              orgId: org.id,
              projectId: pid,
              number: n,
              // Copies start fresh: everything goes back to the first stage.
              stageId: firstStage,
              status: srcStages[0]?.category ?? "todo",
              milestoneId: t.milestoneId ? (msMap.get(t.milestoneId) ?? null) : null,
              title: t.title,
              description: t.description,
              priority: t.priority,
              estimateHours: t.estimateHours,
              dueDate: shift(t.dueDate),
              position: n * 1024,
              createdBy: c.get("viewer")!.userId,
            });
          }
          if (n) await tx.execute(sql`insert into sequences (org_id, key, next_value) values (${org.id}, ${`task:${pid}`}, ${n + 1})`);
          return pid;
        });
        await audit(c, "project.created", { type: "project", id: projectId }, { name: input.name, key, template: template?.name });
        return c.json({ project: { id: projectId, key } }, 201);
      } catch (err) {
        if (isUnique(err)) throw new HTTPException(409, { message: `The key ${key} is already used by another project` });
        throw err;
      }
    },
  )

  .patch(
    "/projects/:id",
    requirePermission("project", "update"),
    validate("json", projectInput.omit({ key: true }).partial().extend({ status: z.enum(PROJECT_STATUSES).optional() })),
    async (c) => {
      const { memberIds, ...input } = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      const id = c.req.param("id");
      await assertProject(db, org.id, id);
      if (input.status === "archived") {
        // Archiving is a separate permission.
        const perms = c.get("viewer")?.org?.permissions ?? {};
        if (!perms.project?.includes("archive")) throw new HTTPException(403, { message: "Missing permission project:archive" });
      }
      await assertEmployees(db, org.id, [input.leadEmployeeId, ...(memberIds ?? [])]);
      if (input.clientId) await loadClient(db, org.id, input.clientId);
      await db.transaction(async (tx) => {
        if (Object.keys(input).length) await tx.update(projects).set(input).where(eq(projects.id, id));
        if (memberIds) {
          await tx.delete(projectMembers).where(eq(projectMembers.projectId, id));
          if (memberIds.length) await tx.insert(projectMembers).values([...new Set(memberIds)].map((employeeId) => ({ projectId: id, employeeId, orgId: org.id })));
        }
      });
      await audit(c, "project.updated", { type: "project", id }, { fields: Object.keys(input), members: memberIds?.length });
      return c.json({ ok: true });
    },
  )

  /* ---------------- Stages ---------------- */

  .post(
    "/projects/:id/stages",
    requirePermission("project", "update"),
    validate("json", z.object({ name: z.string().trim().min(1).max(40), category: z.enum(STAGE_CATEGORIES), color: hex.optional() })),
    async (c) => {
      const { db } = c.get("deps");
      const org = c.get("org");
      const projectId = c.req.param("id");
      await assertProject(db, org.id, projectId);
      const [last] = await db
        .select({ max: sql<number>`coalesce(max(${workflowStages.position}), -1)`.mapWith(Number) })
        .from(workflowStages)
        .where(eq(workflowStages.projectId, projectId));
      const [row] = await db
        .insert(workflowStages)
        .values({ ...c.req.valid("json"), orgId: org.id, projectId, position: (last?.max ?? -1) + 1 })
        .returning();
      return c.json({ stage: row }, 201);
    },
  )

  .patch(
    "/stages/:id",
    requirePermission("project", "update"),
    validate("json", z.object({ name: z.string().trim().min(1).max(40), category: z.enum(STAGE_CATEGORIES), color: hex }).partial()),
    async (c) => {
      const input = c.req.valid("json");
      const { db } = c.get("deps");
      const [row] = await db
        .update(workflowStages)
        .set(input)
        .where(and(eq(workflowStages.orgId, c.get("org").id), eq(workflowStages.id, c.req.param("id"))))
        .returning();
      if (!row) notFound("Stage not found");
      // Tasks mirror their stage's category.
      if (input.category) {
        await db
          .update(tasks)
          .set({ status: input.category, completedAt: input.category === "done" ? sql`coalesce(${tasks.completedAt}, now())` : null })
          .where(eq(tasks.stageId, row.id));
      }
      return c.json({ stage: row });
    },
  )

  .put(
    "/projects/:id/stages/order",
    requirePermission("project", "update"),
    validate("json", z.object({ stageIds: z.array(z.uuid()).min(1).max(30) })),
    async (c) => {
      const { stageIds } = c.req.valid("json");
      const { db } = c.get("deps");
      const projectId = c.req.param("id");
      await assertProject(db, c.get("org").id, projectId);
      await db.transaction(async (tx) => {
        for (const [position, id] of stageIds.entries()) {
          await tx.update(workflowStages).set({ position }).where(and(eq(workflowStages.id, id), eq(workflowStages.projectId, projectId)));
        }
      });
      return c.json({ ok: true });
    },
  )

  .delete(
    "/stages/:id",
    requirePermission("project", "update"),
    validate("query", z.object({ moveTo: z.uuid() })),
    async (c) => {
      const { moveTo } = c.req.valid("query");
      const { db } = c.get("deps");
      const org = c.get("org");
      const id = c.req.param("id");
      const [stage] = await db.select().from(workflowStages).where(and(eq(workflowStages.orgId, org.id), eq(workflowStages.id, id)));
      if (!stage) notFound("Stage not found");
      const [target] = await db
        .select()
        .from(workflowStages)
        .where(and(eq(workflowStages.id, moveTo), eq(workflowStages.projectId, stage.projectId)));
      if (!target || target.id === stage.id) throw new HTTPException(422, { message: "Choose another stage for its tasks" });
      await db.transaction(async (tx) => {
        await tx
          .update(tasks)
          .set({ stageId: target.id, status: target.category, completedAt: target.category === "done" ? sql`coalesce(${tasks.completedAt}, now())` : null })
          .where(eq(tasks.stageId, stage.id));
        await tx.delete(workflowStages).where(eq(workflowStages.id, stage.id));
      });
      await audit(c, "stage.deleted", { type: "project", id: stage.projectId }, { stage: stage.name, movedTo: target.name });
      return c.json({ ok: true });
    },
  )

  /* ---------------- Milestones ---------------- */

  .post(
    "/projects/:id/milestones",
    requirePermission("project", "update"),
    validate(
      "json",
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(2000).nullish(),
        dueDate: isoDate.nullish(),
        amount: z.number().int().min(0).max(1e13).nullish(),
      }),
    ),
    async (c) => {
      const { db } = c.get("deps");
      const org = c.get("org");
      const projectId = c.req.param("id");
      await assertProject(db, org.id, projectId);
      const [row] = await db.insert(milestones).values({ ...c.req.valid("json"), orgId: org.id, projectId }).returning({ id: milestones.id });
      await audit(c, "milestone.created", { type: "project", id: projectId });
      return c.json({ milestone: row }, 201);
    },
  )

  .patch(
    "/milestones/:id",
    requirePermission("project", "update"),
    validate(
      "json",
      z
        .object({
          name: z.string().trim().min(1).max(120),
          description: z.string().trim().max(2000).nullable(),
          dueDate: isoDate.nullable(),
          amount: z.number().int().min(0).max(1e13).nullable(),
          completed: z.boolean(),
        })
        .partial(),
    ),
    async (c) => {
      const { completed, ...input } = c.req.valid("json");
      const { db } = c.get("deps");
      const [row] = await db
        .update(milestones)
        .set({ ...input, ...(completed === undefined ? {} : { completedAt: completed ? new Date() : null }) })
        .where(and(eq(milestones.orgId, c.get("org").id), eq(milestones.id, c.req.param("id"))))
        .returning({ id: milestones.id, projectId: milestones.projectId, name: milestones.name, amount: milestones.amount });
      if (!row) notFound("Milestone not found");
      let invoiceId: string | null = null;
      if (completed !== undefined) {
        await audit(c, completed ? "milestone.completed" : "milestone.reopened", { type: "project", id: row.projectId }, { milestone: row.name });
        if (completed) invoiceId = await billMilestone(c, row);
      }
      return c.json({ ok: true, invoiceId });
    },
  )

  .delete("/milestones/:id", requirePermission("project", "update"), async (c) => {
    const { db } = c.get("deps");
    const [row] = await db
      .delete(milestones)
      .where(and(eq(milestones.orgId, c.get("org").id), eq(milestones.id, c.req.param("id"))))
      .returning({ id: milestones.id });
    if (!row) notFound("Milestone not found");
    return c.json({ ok: true });
  })

  /* ---------------- Labels ---------------- */

  .get("/labels", requirePermission("task", "read"), async (c) => {
    const { db } = c.get("deps");
    const rows = await db.select().from(labels).where(eq(labels.orgId, c.get("org").id)).orderBy(asc(labels.name));
    return c.json({ labels: rows });
  })

  .post(
    "/labels",
    requirePermission("task", "create"),
    validate("json", z.object({ name: z.string().trim().min(1).max(40), color: hex.default("#8a8178") })),
    async (c) => {
      const { db } = c.get("deps");
      try {
        const [row] = await db.insert(labels).values({ ...c.req.valid("json"), orgId: c.get("org").id }).returning();
        return c.json({ label: row }, 201);
      } catch (err) {
        if (isUnique(err)) throw new HTTPException(409, { message: "That label already exists" });
        throw err;
      }
    },
  )

  .delete("/labels/:id", requirePermission("project", "update"), async (c) => {
    const { db } = c.get("deps");
    const [row] = await db
      .delete(labels)
      .where(and(eq(labels.orgId, c.get("org").id), eq(labels.id, c.req.param("id"))))
      .returning({ id: labels.id });
    if (!row) notFound("Label not found");
    return c.json({ ok: true });
  });

/**
 * Completing a billable milestone (an amount, on a project with a client)
 * creates a draft invoice for it, once. Returns the invoice id, if any.
 */
async function billMilestone(c: Context<AppEnv>, m: { id: string; projectId: string; name: string; amount: number | null }) {
  if (!m.amount) return null;
  const { db } = c.get("deps");
  const org = c.get("org");
  const [project] = await db.select({ name: projects.name, clientId: projects.clientId }).from(projects).where(eq(projects.id, m.projectId));
  if (!project?.clientId) return null;
  const [existing] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.orgId, org.id), eq(invoices.milestoneId, m.id), ne(invoices.status, "void")));
  if (existing) return existing.id;

  const settings = await loadSettings(db, org.id);
  const client = await loadClient(db, org.id, project.clientId);
  const pos = placeOfSupplyFor(settings, client);
  const [rate] = await db
    .select({ rate: taxRates.rate })
    .from(taxRates)
    .where(and(eq(taxRates.orgId, org.id), eq(taxRates.isDefault, true), isNull(taxRates.archivedAt)));
  const { timezone } = await orgWorkSettings(db, org.id);
  const today = todayIn(timezone);
  const [inv] = await db
    .insert(invoices)
    .values({
      orgId: org.id,
      kind: "invoice",
      clientId: client.id,
      projectId: m.projectId,
      milestoneId: m.id,
      issueDate: today,
      dueDate: addDays(today, client.paymentTermsDays ?? settings.defaultDueDays),
      currency: client.currency,
      ...pos,
      notes: settings.notes,
      terms: settings.terms,
      createdBy: c.get("viewer")!.userId,
    })
    .returning({ id: invoices.id });
  await writeLines(db, org.id, inv!.id, [{ description: `${project.name}: ${m.name}`, quantity: 1, unitPrice: m.amount, taxRate: rate?.rate ?? 18 }], pos.supplyType, settings);
  await audit(c, "invoice.created", { type: "invoice", id: inv!.id }, { fromMilestone: m.name });
  return inv!.id;
}
