import { addDays, isIsoDate, isoWeekday, nextOccurrence, positionBetween, todayIn } from "@hephaestus/core";
import {
  employees,
  labels,
  leaveRequests,
  members,
  milestones,
  PRIORITIES,
  projects,
  STAGE_CATEGORIES,
  taskActivity,
  taskAssignees,
  taskDependencies,
  taskLabels,
  tasks,
  workflowStages,
} from "@hephaestus/db";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../../context.ts";
import { forbid, hasPermission, nextSequence, notFound, notify, orgWorkSettings, userIdsForEmployees, viewerEmployee } from "../../helpers.ts";
import { requirePermission } from "../../middleware.ts";
import { setOnboardingItemDone } from "../../onboarding-sync.ts";
import { likePattern, validate } from "../../validate.ts";
import { assertProject } from "./projects.ts";

type DbT = AppEnv["Variables"]["deps"]["db"];
type Ctx = Context<AppEnv>;

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD)");
const recurrence = z.object({ freq: z.enum(["daily", "weekly", "monthly"]), interval: z.number().int().min(1).max(365) });

const taskFields = z.object({
  title: z.string().trim().min(1, "Enter a title").max(300),
  description: z.string().max(20_000).nullable(),
  stageId: z.uuid().nullable(),
  status: z.enum(STAGE_CATEGORIES),
  milestoneId: z.uuid().nullable(),
  priority: z.enum(PRIORITIES),
  startDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  estimateHours: z.number().min(0).max(9999).nullable(),
  recurrence: recurrence.nullable(),
  assigneeIds: z.array(z.uuid()).max(50),
  labelIds: z.array(z.uuid()).max(30),
});

/* ---------------- Shared helpers ---------------- */

async function logActivity(c: Ctx, taskId: string, type: string, data: Record<string, unknown> = {}) {
  const viewer = c.get("viewer");
  await c
    .get("deps")
    .db.insert(taskActivity)
    .values({ orgId: c.get("org").id, taskId, actorId: viewer?.userId ?? null, actorName: viewer?.name ?? null, type, data });
}

async function loadTask(db: DbT, orgId: string, id: string) {
  const [t] = await db.select().from(tasks).where(and(eq(tasks.orgId, orgId), eq(tasks.id, id)));
  if (!t) notFound("Task not found");
  return t;
}

/** Assigning someone else needs task:assign; you can always take a task yourself. */
async function assertCanAssign(c: Ctx, ids: string[], current: string[] = []) {
  const added = ids.filter((id) => !current.includes(id));
  const removed = current.filter((id) => !ids.includes(id));
  if (!added.length && !removed.length) return;
  if (hasPermission(c, "task", "assign")) return;
  const me = await viewerEmployee(c);
  const onlySelf = [...added, ...removed].every((id) => id === me?.id);
  if (!onlySelf) forbid("You can only assign tasks to yourself");
}

async function assertRefs(db: DbT, orgId: string, projectId: string | null, f: { stageId?: string | null; milestoneId?: string | null; assigneeIds?: string[]; labelIds?: string[] }) {
  if (f.stageId) {
    const [s] = await db.select({ id: workflowStages.id }).from(workflowStages).where(and(eq(workflowStages.id, f.stageId), projectId ? eq(workflowStages.projectId, projectId) : sql`false`));
    if (!s) throw new HTTPException(422, { message: "That stage isn't in this project" });
  }
  if (f.milestoneId) {
    const [m] = await db.select({ id: milestones.id }).from(milestones).where(and(eq(milestones.id, f.milestoneId), projectId ? eq(milestones.projectId, projectId) : sql`false`));
    if (!m) throw new HTTPException(422, { message: "That milestone isn't in this project" });
  }
  if (f.assigneeIds?.length) {
    const [r] = await db.select({ n: count() }).from(employees).where(and(eq(employees.orgId, orgId), inArray(employees.id, [...new Set(f.assigneeIds)])));
    if ((r?.n ?? 0) !== new Set(f.assigneeIds).size) throw new HTTPException(422, { message: "Unknown assignee" });
  }
  if (f.labelIds?.length) {
    const [r] = await db.select({ n: count() }).from(labels).where(and(eq(labels.orgId, orgId), inArray(labels.id, [...new Set(f.labelIds)])));
    if ((r?.n ?? 0) !== new Set(f.labelIds).size) throw new HTTPException(422, { message: "Unknown label" });
  }
}

async function stageOf(db: DbT, stageId: string) {
  const [s] = await db.select().from(workflowStages).where(eq(workflowStages.id, stageId));
  return s ?? null;
}

async function lastPosition(db: DbT, projectId: string | null, stageId: string | null) {
  const [r] = await db
    .select({ max: sql<number | null>`max(${tasks.position})` })
    .from(tasks)
    .where(and(projectId ? eq(tasks.projectId, projectId) : isNull(tasks.projectId), stageId ? eq(tasks.stageId, stageId) : isNull(tasks.stageId)));
  return r?.max === null || r?.max === undefined ? null : Number(r.max);
}

async function setAssignees(db: DbT, orgId: string, taskId: string, ids: string[]) {
  await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
  if (ids.length) await db.insert(taskAssignees).values([...new Set(ids)].map((employeeId) => ({ taskId, employeeId, orgId })));
}

async function setLabels(db: DbT, orgId: string, taskId: string, ids: string[]) {
  await db.delete(taskLabels).where(eq(taskLabels.taskId, taskId));
  if (ids.length) await db.insert(taskLabels).values([...new Set(ids)].map((labelId) => ({ taskId, labelId, orgId })));
}

async function currentAssignees(db: DbT, taskId: string) {
  return (await db.select({ id: taskAssignees.employeeId }).from(taskAssignees).where(eq(taskAssignees.taskId, taskId))).map((r) => r.id);
}

async function notifyAssigned(c: Ctx, taskId: string, title: string, employeeIds: string[], projectId: string | null) {
  if (!employeeIds.length) return;
  const { db } = c.get("deps");
  await notify(c, await userIdsForEmployees(db, c.get("org").id, employeeIds), {
    type: "task.assigned",
    title: `${c.get("viewer")?.name ?? "Someone"} assigned you "${title}"`,
    link: projectId ? `/work/projects/${projectId}?task=${taskId}` : `/work?task=${taskId}`,
  });
}

async function publishChange(c: Ctx, projectId: string | null, taskId: string) {
  await c.get("deps").realtime.publish({
    channel: `org:${c.get("org").id}:${projectId ? `project:${projectId}` : "tasks"}`,
    type: "task.changed",
    payload: { taskId },
  });
}

/**
 * Side effects of a task becoming done: the next occurrence of a recurring
 * task, and ticking the onboarding step it represents.
 */
async function onCompleted(c: Ctx, t: typeof tasks.$inferSelect) {
  const { db } = c.get("deps");
  const org = c.get("org");
  if (t.source === "onboarding" && t.sourceId) {
    await setOnboardingItemDone(db, t.sourceId, true, c.get("viewer")!.userId, { syncTask: false });
  }
  if (t.recurrence && t.dueDate) {
    const due = nextOccurrence(t.dueDate, t.recurrence);
    const start = t.startDate ? addDays(due, Math.round((Date.parse(t.startDate) - Date.parse(t.dueDate)) / 86_400_000)) : null;
    let stageId: string | null = null;
    let status: (typeof STAGE_CATEGORIES)[number] = "todo";
    if (t.projectId) {
      const [first] = await db
        .select()
        .from(workflowStages)
        .where(and(eq(workflowStages.projectId, t.projectId), ne(workflowStages.category, "done")))
        .orderBy(asc(workflowStages.position))
        .limit(1);
      stageId = first?.id ?? null;
      status = first?.category ?? "todo";
    }
    const number = t.projectId ? await nextSequence(db, org.id, `task:${t.projectId}`) : null;
    const [next] = await db
      .insert(tasks)
      .values({
        orgId: org.id,
        projectId: t.projectId,
        number,
        stageId,
        status,
        milestoneId: t.milestoneId,
        title: t.title,
        description: t.description,
        priority: t.priority,
        startDate: start,
        dueDate: due,
        estimateHours: t.estimateHours,
        recurrence: t.recurrence,
        position: positionBetween(await lastPosition(db, t.projectId, stageId), null),
        createdBy: t.createdBy,
      })
      .returning({ id: tasks.id });
    await setAssignees(db, org.id, next!.id, await currentAssignees(db, t.id));
    const lbls = (await db.select({ id: taskLabels.labelId }).from(taskLabels).where(eq(taskLabels.taskId, t.id))).map((r) => r.id);
    await setLabels(db, org.id, next!.id, lbls);
    // The schedule moves to the new task.
    await db.update(tasks).set({ recurrence: null }).where(eq(tasks.id, t.id));
    await logActivity(c, next!.id, "created", { recurringFrom: t.id });
    return next!.id;
  }
  return null;
}

/* ---------------- Queries ---------------- */

const assigneeEmp = alias(employees, "assignee_emp");

/** Card data for lists and boards, with assignees and labels folded in. */
async function hydrate(db: DbT, rows: (typeof tasks.$inferSelect & { projectKey?: string | null; projectName?: string | null; projectColor?: string | null; stageName?: string | null })[]) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [as, ls, subs, blockers] = await Promise.all([
    db
      .select({ taskId: taskAssignees.taskId, id: assigneeEmp.id, fullName: assigneeEmp.fullName, image: members.image })
      .from(taskAssignees)
      .innerJoin(assigneeEmp, eq(assigneeEmp.id, taskAssignees.employeeId))
      .leftJoin(members, eq(members.id, assigneeEmp.memberId))
      .where(inArray(taskAssignees.taskId, ids)),
    db
      .select({ taskId: taskLabels.taskId, id: labels.id, name: labels.name, color: labels.color })
      .from(taskLabels)
      .innerJoin(labels, eq(labels.id, taskLabels.labelId))
      .where(inArray(taskLabels.taskId, ids)),
    db
      .select({
        parentId: tasks.parentId,
        total: count(),
        done: sql<number>`count(*) filter (where ${tasks.status} = 'done')`.mapWith(Number),
      })
      .from(tasks)
      .where(inArray(tasks.parentId, ids))
      .groupBy(tasks.parentId),
    db
      .select({ taskId: taskDependencies.taskId, open: sql<number>`count(*) filter (where b.status <> 'done')`.mapWith(Number) })
      .from(taskDependencies)
      .innerJoin(sql`tasks b`, sql`b.id = ${taskDependencies.blockedById}`)
      .where(inArray(taskDependencies.taskId, ids))
      .groupBy(taskDependencies.taskId),
  ]);
  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    projectKey: r.projectKey ?? null,
    projectName: r.projectName ?? null,
    projectColor: r.projectColor ?? null,
    number: r.number,
    stageId: r.stageId,
    stageName: r.stageName ?? null,
    status: r.status,
    parentId: r.parentId,
    milestoneId: r.milestoneId,
    title: r.title,
    priority: r.priority,
    startDate: r.startDate,
    dueDate: r.dueDate,
    estimateHours: r.estimateHours,
    position: r.position,
    recurrence: r.recurrence,
    source: r.source,
    completedAt: r.completedAt,
    assignees: as.filter((a) => a.taskId === r.id).map(({ taskId: _, ...a }) => a),
    labels: ls.filter((l) => l.taskId === r.id).map(({ taskId: _, ...l }) => l),
    subtasks: subs.find((s) => s.parentId === r.id) ?? { total: 0, done: 0 },
    blocked: (blockers.find((b) => b.taskId === r.id)?.open ?? 0) > 0,
  }));
}

function cardQuery(db: DbT) {
  return db
    .select({
      task: tasks,
      projectKey: projects.key,
      projectName: projects.name,
      projectColor: projects.color,
      stageName: workflowStages.name,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(workflowStages, eq(workflowStages.id, tasks.stageId));
}

const flat = (rows: { task: typeof tasks.$inferSelect; projectKey: string | null; projectName: string | null; projectColor: string | null; stageName: string | null }[]) =>
  rows.map((r) => ({ ...r.task, projectKey: r.projectKey, projectName: r.projectName, projectColor: r.projectColor, stageName: r.stageName }));

/* ---------------- Routes ---------------- */

export const taskRoutes = new Hono<AppEnv>()

  .get(
    "/tasks",
    requirePermission("task", "read"),
    validate(
      "query",
      z.object({
        projectId: z.uuid().optional(),
        assignee: z.union([z.literal("me"), z.uuid()]).optional(),
        milestoneId: z.uuid().optional(),
        status: z.enum([...STAGE_CATEGORIES, "open"]).optional(),
        dueFrom: isoDate.optional(),
        dueTo: isoDate.optional(),
        q: z.string().trim().max(100).optional(),
        parentId: z.uuid().optional(),
        includeSubtasks: z.enum(["true", "false"]).default("false"),
      }),
    ),
    async (c) => {
      const f = c.req.valid("query");
      const { db } = c.get("deps");
      const org = c.get("org");
      let assigneeId: string | undefined;
      if (f.assignee === "me") {
        const me = await viewerEmployee(c);
        if (!me) return c.json({ tasks: [] });
        assigneeId = me.id;
      } else assigneeId = f.assignee;

      const rows = await cardQuery(db)
        .where(
          and(
            eq(tasks.orgId, org.id),
            f.projectId ? eq(tasks.projectId, f.projectId) : undefined,
            f.milestoneId ? eq(tasks.milestoneId, f.milestoneId) : undefined,
            f.status === "open" ? ne(tasks.status, "done") : f.status ? eq(tasks.status, f.status) : undefined,
            f.dueFrom ? gte(tasks.dueDate, f.dueFrom) : undefined,
            f.dueTo ? lte(tasks.dueDate, f.dueTo) : undefined,
            f.q ? ilike(tasks.title, likePattern(f.q)) : undefined,
            f.parentId ? eq(tasks.parentId, f.parentId) : f.includeSubtasks === "true" ? undefined : isNull(tasks.parentId),
            assigneeId
              ? sql`exists (select 1 from task_assignees ta where ta.task_id = ${tasks.id} and ta.employee_id = ${assigneeId})`
              : undefined,
            // Projects that are archived drop out of cross-project views.
            f.projectId ? undefined : or(isNull(tasks.projectId), ne(projects.status, "archived")),
          ),
        )
        .orderBy(asc(tasks.position), asc(tasks.createdAt))
        .limit(2000);
      return c.json({ tasks: await hydrate(db, flat(rows)) });
    },
  )

  .get("/work/my", requirePermission("task", "read"), async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const me = await viewerEmployee(c);
    if (!me) return c.json({ today: todayIn((await orgWorkSettings(db, org.id)).timezone), tasks: [], linked: false });
    const { timezone } = await orgWorkSettings(db, org.id);
    const rows = await cardQuery(db)
      .where(
        and(
          eq(tasks.orgId, org.id),
          or(ne(tasks.status, "done"), gte(tasks.completedAt, sql`now() - interval '2 days'`)),
          sql`exists (select 1 from task_assignees ta where ta.task_id = ${tasks.id} and ta.employee_id = ${me.id})`,
          or(isNull(tasks.projectId), ne(projects.status, "archived")),
        ),
      )
      .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.createdAt))
      .limit(500);
    return c.json({ today: todayIn(timezone), tasks: await hydrate(db, flat(rows)), linked: true });
  })

  .get(
    "/work/workload",
    requirePermission("task", "read"),
    validate("query", z.object({ weeks: z.coerce.number().int().min(1).max(12).default(6), departmentId: z.uuid().optional() })),
    async (c) => {
      const { weeks, departmentId } = c.req.valid("query");
      const { db } = c.get("deps");
      const org = c.get("org");
      const { timezone, workWeek } = await orgWorkSettings(db, org.id);
      const today = todayIn(timezone);
      const monday = addDays(today, 1 - isoWeekday(today));
      const end = addDays(monday, weeks * 7 - 1);

      const people = await db
        .select({ id: employees.id, fullName: employees.fullName, jobTitle: employees.jobTitle, image: members.image })
        .from(employees)
        .leftJoin(members, eq(members.id, employees.memberId))
        .where(and(eq(employees.orgId, org.id), ne(employees.status, "offboarded"), departmentId ? eq(employees.departmentId, departmentId) : undefined))
        .orderBy(asc(employees.fullName));

      const open = await db
        .select({ employeeId: taskAssignees.employeeId, dueDate: tasks.dueDate, estimate: tasks.estimateHours })
        .from(taskAssignees)
        .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
        .where(and(eq(taskAssignees.orgId, org.id), ne(tasks.status, "done"), or(isNull(tasks.dueDate), lte(tasks.dueDate, end))));

      const leave = await db
        .select({ employeeId: leaveRequests.employeeId, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.orgId, org.id), eq(leaveRequests.status, "approved"), lte(leaveRequests.startDate, end), gte(leaveRequests.endDate, monday)));

      const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(monday, i * 7));
      return c.json({
        today,
        weeks: weekStarts,
        people: people.map((p) => {
          const mine = open.filter((t) => t.employeeId === p.id);
          return {
            ...p,
            overdue: mine.filter((t) => t.dueDate && t.dueDate < today).length,
            unscheduled: mine.filter((t) => !t.dueDate).length,
            weeks: weekStarts.map((ws) => {
              const we = addDays(ws, 6);
              // Overdue work counts against the current week.
              const due = mine.filter((t) => t.dueDate && t.dueDate <= we && (t.dueDate >= ws || (ws === monday && t.dueDate < today)));
              let leaveDays = 0;
              for (let d = ws; d <= we; d = addDays(d, 1)) {
                if (workWeek.includes(isoWeekday(d)) && leave.some((l) => l.employeeId === p.id && l.startDate <= d && l.endDate >= d)) leaveDays++;
              }
              return { tasks: due.length, hours: due.reduce((h, t) => h + Number(t.estimate ?? 0), 0), leaveDays };
            }),
          };
        }),
      });
    },
  )

  .get("/tasks/:id", requirePermission("task", "read"), async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const id = c.req.param("id");
    const [row] = await cardQuery(db).where(and(eq(tasks.orgId, org.id), eq(tasks.id, id)));
    if (!row) notFound("Task not found");
    const [card] = await hydrate(db, flat([row]));
    const subtasks = await hydrate(db, flat(await cardQuery(db).where(eq(tasks.parentId, id)).orderBy(asc(tasks.position), asc(tasks.createdAt))));
    const blocker = alias(tasks, "blocker");
    const blockerProject = alias(projects, "blocker_project");
    const blockedBy = await db
      .select({ id: blocker.id, title: blocker.title, status: blocker.status, number: blocker.number, projectKey: blockerProject.key })
      .from(taskDependencies)
      .innerJoin(blocker, eq(blocker.id, taskDependencies.blockedById))
      .leftJoin(blockerProject, eq(blockerProject.id, blocker.projectId))
      .where(eq(taskDependencies.taskId, id));
    const blocking = await db
      .select({ id: blocker.id, title: blocker.title, status: blocker.status, number: blocker.number, projectKey: blockerProject.key })
      .from(taskDependencies)
      .innerJoin(blocker, eq(blocker.id, taskDependencies.taskId))
      .leftJoin(blockerProject, eq(blockerProject.id, blocker.projectId))
      .where(eq(taskDependencies.blockedById, id));
    const activity = await db.select().from(taskActivity).where(eq(taskActivity.taskId, id)).orderBy(desc(taskActivity.createdAt)).limit(100);
    const parent = row.task.parentId
      ? (await db.select({ id: tasks.id, title: tasks.title, number: tasks.number }).from(tasks).where(eq(tasks.id, row.task.parentId)))[0]
      : null;
    return c.json({
      task: { ...card!, description: row.task.description, createdAt: row.task.createdAt, createdBy: row.task.createdBy },
      parent: parent ?? null,
      subtasks,
      blockedBy,
      blocking,
      activity,
    });
  })

  .post(
    "/tasks",
    requirePermission("task", "create"),
    validate(
      "json",
      taskFields.partial().extend({
        title: taskFields.shape.title,
        projectId: z.uuid().nullish(),
        parentId: z.uuid().nullish(),
      }),
    ),
    async (c) => {
      const input = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");

      let projectId = input.projectId ?? null;
      if (input.parentId) {
        const parent = await loadTask(db, org.id, input.parentId);
        if (parent.parentId) throw new HTTPException(422, { message: "Subtasks can't have their own subtasks" });
        projectId = parent.projectId;
      }
      if (projectId) {
        const p = await assertProject(db, org.id, projectId);
        if (p.status === "archived") throw new HTTPException(422, { message: "This project is archived" });
      }

      // Default for "me": a task created without assignees in My work belongs to its creator.
      const me = await viewerEmployee(c);
      const assigneeIds = input.assigneeIds ?? (!projectId && me ? [me.id] : []);
      await assertCanAssign(c, assigneeIds);
      await assertRefs(db, org.id, projectId, { ...input, assigneeIds });

      let stageId = input.stageId ?? null;
      let status = input.status ?? "todo";
      if (projectId && !stageId && !input.parentId) {
        const [first] = await db
          .select()
          .from(workflowStages)
          .where(and(eq(workflowStages.projectId, projectId), input.status ? eq(workflowStages.category, input.status) : sql`true`))
          .orderBy(asc(workflowStages.position))
          .limit(1);
        stageId = first?.id ?? null;
      }
      if (stageId) status = (await stageOf(db, stageId))!.category;

      const number = projectId ? await nextSequence(db, org.id, `task:${projectId}`) : null;
      const [row] = await db
        .insert(tasks)
        .values({
          orgId: org.id,
          projectId,
          number,
          stageId,
          status,
          parentId: input.parentId ?? null,
          milestoneId: input.milestoneId ?? null,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority ?? "none",
          startDate: input.startDate ?? null,
          dueDate: input.dueDate ?? null,
          estimateHours: input.estimateHours ?? null,
          recurrence: input.recurrence ?? null,
          position: positionBetween(await lastPosition(db, projectId, stageId), null),
          completedAt: status === "done" ? new Date() : null,
          createdBy: c.get("viewer")!.userId,
        })
        .returning();
      await setAssignees(db, org.id, row!.id, assigneeIds);
      if (input.labelIds?.length) await setLabels(db, org.id, row!.id, input.labelIds);
      await logActivity(c, row!.id, "created");
      await notifyAssigned(c, row!.id, row!.title, assigneeIds, projectId);
      await publishChange(c, projectId, row!.id);
      return c.json({ task: { id: row!.id, number } }, 201);
    },
  )

  .patch(
    "/tasks/:id",
    requirePermission("task", "update"),
    validate(
      "json",
      taskFields.partial().extend({
        /** Board moves: place between two neighbouring cards (ids) in the target stage. */
        beforeId: z.uuid().nullish(),
        afterId: z.uuid().nullish(),
      }),
    ),
    async (c) => {
      const { beforeId, afterId, assigneeIds, labelIds, ...input } = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      const t = await loadTask(db, org.id, c.req.param("id"));
      await assertRefs(db, org.id, t.projectId, { ...input, assigneeIds, labelIds });

      const changes: Record<string, unknown> = { ...input };
      const activity: Record<string, { from: unknown; to: unknown }> = {};
      for (const k of ["title", "priority", "dueDate", "startDate", "estimateHours", "milestoneId", "recurrence"] as const) {
        if (k in input && JSON.stringify(input[k]) !== JSON.stringify(t[k])) activity[k] = { from: t[k], to: input[k] };
      }
      if ("description" in input && input.description !== t.description) activity.description = { from: null, to: null };

      // Stage decides status inside projects; tasks without a project set status directly.
      if (input.stageId) {
        const s = (await stageOf(db, input.stageId))!;
        changes.status = s.category;
        if (input.stageId !== t.stageId) {
          const from = t.stageId ? await stageOf(db, t.stageId) : null;
          activity.stage = { from: from?.name ?? null, to: s.name };
        }
      } else if (input.status && t.projectId && !t.parentId) {
        // Pick the first stage of that category so the board stays consistent.
        const [s] = await db
          .select()
          .from(workflowStages)
          .where(and(eq(workflowStages.projectId, t.projectId), eq(workflowStages.category, input.status)))
          .orderBy(asc(workflowStages.position))
          .limit(1);
        if (s) changes.stageId = s.id;
      }
      const newStatus = (changes.status as string | undefined) ?? t.status;
      if (newStatus !== t.status) {
        activity.status = { from: t.status, to: newStatus };
        changes.completedAt = newStatus === "done" ? new Date() : null;
        if (newStatus === "done") {
          // Open blockers must be finished first.
          const [open] = await db
            .select({ n: count() })
            .from(taskDependencies)
            .innerJoin(sql`tasks b`, sql`b.id = ${taskDependencies.blockedById}`)
            .where(and(eq(taskDependencies.taskId, t.id), sql`b.status <> 'done'`));
          if ((open?.n ?? 0) > 0) throw new HTTPException(409, { message: "Finish the tasks blocking this one first" });
        }
      }

      if (beforeId !== undefined || afterId !== undefined) {
        const neighbour = async (id: string | null | undefined) =>
          id ? ((await db.select({ p: tasks.position }).from(tasks).where(and(eq(tasks.id, id), eq(tasks.orgId, org.id))))[0]?.p ?? null) : null;
        changes.position = positionBetween(await neighbour(beforeId), await neighbour(afterId));
      }

      if (assigneeIds) {
        const current = await currentAssignees(db, t.id);
        await assertCanAssign(c, assigneeIds, current);
        const added = assigneeIds.filter((id) => !current.includes(id));
        if (added.length || current.some((id) => !assigneeIds.includes(id))) activity.assignees = { from: current, to: assigneeIds };
        await setAssignees(db, org.id, t.id, assigneeIds);
        await notifyAssigned(c, t.id, input.title ?? t.title, added, t.projectId);
      }
      if (labelIds) await setLabels(db, org.id, t.id, labelIds);
      if (Object.keys(changes).length) await db.update(tasks).set(changes).where(eq(tasks.id, t.id));
      if (Object.keys(activity).length) await logActivity(c, t.id, "updated", activity);

      let nextTaskId: string | null = null;
      if (newStatus !== t.status) {
        if (newStatus === "done") nextTaskId = await onCompleted(c, { ...t, ...(changes as object) } as typeof t);
        else if (t.status === "done" && t.source === "onboarding" && t.sourceId) {
          await setOnboardingItemDone(db, t.sourceId, false, c.get("viewer")!.userId, { syncTask: false });
        }
      }
      await publishChange(c, t.projectId, t.id);
      return c.json({ ok: true, nextTaskId });
    },
  )

  .delete("/tasks/:id", async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const t = await loadTask(db, org.id, c.req.param("id"));
    if (!hasPermission(c, "task", "delete") && t.createdBy !== c.get("viewer")!.userId) forbid("Only the creator or an admin can delete this task");
    if (t.source === "onboarding") throw new HTTPException(409, { message: "Onboarding tasks are managed from the onboarding checklist" });
    await db.delete(tasks).where(eq(tasks.id, t.id));
    await publishChange(c, t.projectId, t.id);
    return c.json({ ok: true });
  })

  /* ---------------- Dependencies ---------------- */

  .post(
    "/tasks/:id/dependencies",
    requirePermission("task", "update"),
    validate("json", z.object({ blockedById: z.uuid() })),
    async (c) => {
      const { blockedById } = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      const t = await loadTask(db, org.id, c.req.param("id"));
      const blocker = await loadTask(db, org.id, blockedById);
      if (blocker.id === t.id) throw new HTTPException(422, { message: "A task can't block itself" });
      // Reject cycles: the blocker must not (transitively) wait on this task.
      const res = await db.execute<{ id: string }>(sql`
        with recursive chain as (
          select blocked_by_id as id from task_dependencies where task_id = ${blocker.id}
          union
          select d.blocked_by_id from task_dependencies d join chain c on d.task_id = c.id
        ) select id from chain where id = ${t.id} limit 1`);
      const hit = Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? []);
      if (hit.length) throw new HTTPException(422, { message: "That would make the tasks wait on each other" });
      await db.insert(taskDependencies).values({ taskId: t.id, blockedById: blocker.id, orgId: org.id }).onConflictDoNothing();
      await logActivity(c, t.id, "blocked_by", { taskId: blocker.id, title: blocker.title });
      return c.json({ ok: true }, 201);
    },
  )

  .delete("/tasks/:id/dependencies/:blockedById", requirePermission("task", "update"), async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const t = await loadTask(db, org.id, c.req.param("id"));
    await db.delete(taskDependencies).where(and(eq(taskDependencies.taskId, t.id), eq(taskDependencies.blockedById, c.req.param("blockedById"))));
    return c.json({ ok: true });
  });
