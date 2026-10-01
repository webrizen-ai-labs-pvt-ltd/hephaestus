import { addDays, isIsoDate } from "@hephaestus/core";
import { employees, onboardingItems, onboardingRuns, onboardingTemplates, taskAssignees, tasks } from "@hephaestus/db";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { audit } from "../../audit.ts";
import type { AppEnv } from "../../context.ts";
import { forbid, hasPermission, notFound, notify, userIdsForEmployees, viewerEmployee } from "../../helpers.ts";
import { requirePermission } from "../../middleware.ts";
import { setOnboardingItemDone } from "../../onboarding-sync.ts";
import { validate } from "../../validate.ts";

const templateItem = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  assignee: z.enum(["employee", "manager", "specific"]),
  assigneeEmployeeId: z.uuid().optional(),
  dueOffsetDays: z.number().int().min(-60).max(365),
});

const templateInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  description: z.string().trim().max(500).nullish(),
  items: z.array(templateItem).max(100),
});

const assignee = alias(employees, "assignee");

export const onboardingRoutes = new Hono<AppEnv>()

  /* ---------------- Templates ---------------- */

  .get("/onboarding/templates", requirePermission("employee", "read"), async (c) => {
    const { db } = c.get("deps");
    const rows = await db
      .select()
      .from(onboardingTemplates)
      .where(eq(onboardingTemplates.orgId, c.get("org").id))
      .orderBy(asc(onboardingTemplates.name));
    return c.json({ templates: rows });
  })

  .post("/onboarding/templates", requirePermission("employee", "create"), validate("json", templateInput), async (c) => {
    const { db } = c.get("deps");
    const [row] = await db
      .insert(onboardingTemplates)
      .values({ ...c.req.valid("json"), orgId: c.get("org").id })
      .returning({ id: onboardingTemplates.id });
    await audit(c, "onboarding_template.created", { type: "onboarding_template", id: row!.id });
    return c.json({ template: row }, 201);
  })

  .patch("/onboarding/templates/:id", requirePermission("employee", "create"), validate("json", templateInput.partial()), async (c) => {
    const { db } = c.get("deps");
    const [row] = await db
      .update(onboardingTemplates)
      .set(c.req.valid("json"))
      .where(and(eq(onboardingTemplates.orgId, c.get("org").id), eq(onboardingTemplates.id, c.req.param("id"))))
      .returning({ id: onboardingTemplates.id });
    if (!row) notFound("Template not found");
    await audit(c, "onboarding_template.updated", { type: "onboarding_template", id: row.id });
    return c.json({ ok: true });
  })

  .delete("/onboarding/templates/:id", requirePermission("employee", "create"), async (c) => {
    const { db } = c.get("deps");
    const [row] = await db
      .delete(onboardingTemplates)
      .where(and(eq(onboardingTemplates.orgId, c.get("org").id), eq(onboardingTemplates.id, c.req.param("id"))))
      .returning({ id: onboardingTemplates.id });
    if (!row) notFound("Template not found");
    await audit(c, "onboarding_template.deleted", { type: "onboarding_template", id: row.id });
    return c.json({ ok: true });
  })

  /* ---------------- Runs ---------------- */

  .get(
    "/onboarding/runs",
    requirePermission("employee", "read"),
    validate("query", z.object({ employeeId: z.uuid().optional(), active: z.enum(["true", "false"]).optional() })),
    async (c) => {
      const { employeeId, active } = c.req.valid("query");
      const { db } = c.get("deps");
      const org = c.get("org");
      const runs = await db
        .select({
          id: onboardingRuns.id,
          name: onboardingRuns.name,
          employeeId: onboardingRuns.employeeId,
          employeeName: employees.fullName,
          startDate: onboardingRuns.startDate,
          completedAt: onboardingRuns.completedAt,
          total: sql<number>`(select count(*) from onboarding_items i where i.run_id = ${onboardingRuns.id})`.mapWith(Number),
          done: sql<number>`(select count(*) from onboarding_items i where i.run_id = ${onboardingRuns.id} and i.done_at is not null)`.mapWith(Number),
        })
        .from(onboardingRuns)
        .innerJoin(employees, eq(employees.id, onboardingRuns.employeeId))
        .where(
          and(
            eq(onboardingRuns.orgId, org.id),
            employeeId ? eq(onboardingRuns.employeeId, employeeId) : undefined,
            active === "true" ? isNull(onboardingRuns.completedAt) : active === "false" ? isNotNull(onboardingRuns.completedAt) : undefined,
          ),
        )
        .orderBy(desc(onboardingRuns.startDate))
        .limit(200);

      const ids = runs.map((r) => r.id);
      const items = ids.length
        ? await db
            .select({
              id: onboardingItems.id,
              runId: onboardingItems.runId,
              title: onboardingItems.title,
              description: onboardingItems.description,
              assigneeEmployeeId: onboardingItems.assigneeEmployeeId,
              assigneeName: assignee.fullName,
              dueDate: onboardingItems.dueDate,
              doneAt: onboardingItems.doneAt,
            })
            .from(onboardingItems)
            .leftJoin(assignee, eq(assignee.id, onboardingItems.assigneeEmployeeId))
            .where(inArray(onboardingItems.runId, ids))
            .orderBy(asc(onboardingItems.position))
        : [];
      return c.json({ runs: runs.map((r) => ({ ...r, items: items.filter((i) => i.runId === r.id) })) });
    },
  )

  .get("/onboarding/my-items", async (c) => {
    const { db } = c.get("deps");
    const me = await viewerEmployee(c);
    if (!me) return c.json({ items: [] });
    const rows = await db
      .select({
        id: onboardingItems.id,
        title: onboardingItems.title,
        dueDate: onboardingItems.dueDate,
        runName: onboardingRuns.name,
        employeeName: employees.fullName,
      })
      .from(onboardingItems)
      .innerJoin(onboardingRuns, eq(onboardingRuns.id, onboardingItems.runId))
      .innerJoin(employees, eq(employees.id, onboardingRuns.employeeId))
      .where(and(eq(onboardingItems.orgId, c.get("org").id), eq(onboardingItems.assigneeEmployeeId, me.id), isNull(onboardingItems.doneAt)))
      .orderBy(asc(onboardingItems.dueDate))
      .limit(50);
    return c.json({ items: rows });
  })

  .post(
    "/onboarding/runs",
    requirePermission("employee", "create"),
    validate(
      "json",
      z.object({
        employeeId: z.uuid(),
        templateId: z.uuid(),
        startDate: z.string().refine(isIsoDate, "Use a valid date"),
      }),
    ),
    async (c) => {
      const { employeeId, templateId, startDate } = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      const [emp] = await db
        .select({ id: employees.id, fullName: employees.fullName, managerId: employees.managerId })
        .from(employees)
        .where(and(eq(employees.orgId, org.id), eq(employees.id, employeeId)));
      if (!emp) notFound("Employee not found");
      const [tpl] = await db
        .select()
        .from(onboardingTemplates)
        .where(and(eq(onboardingTemplates.orgId, org.id), eq(onboardingTemplates.id, templateId)));
      if (!tpl) notFound("Template not found");
      if (tpl.items.length === 0) throw new HTTPException(422, { message: "This template has no steps" });

      const resolved = tpl.items.map((item, position) => ({
        position,
        title: item.title,
        description: item.description ?? null,
        dueDate: addDays(startDate, item.dueOffsetDays),
        assigneeEmployeeId:
          item.assignee === "employee" ? emp.id : item.assignee === "manager" ? emp.managerId : (item.assigneeEmployeeId ?? null),
      }));
      // Only keep assignees that still exist in this org.
      const candidateIds = [...new Set(resolved.map((r) => r.assigneeEmployeeId).filter((x): x is string => Boolean(x)))];
      const valid = candidateIds.length
        ? new Set(
            (await db.select({ id: employees.id }).from(employees).where(and(eq(employees.orgId, org.id), inArray(employees.id, candidateIds)))).map(
              (r) => r.id,
            ),
          )
        : new Set<string>();

      const runId = await db.transaction(async (tx) => {
        const [run] = await tx
          .insert(onboardingRuns)
          .values({ orgId: org.id, employeeId, templateId, name: tpl.name, startDate, createdBy: c.get("viewer")!.userId })
          .returning({ id: onboardingRuns.id });
        const items = await tx
          .insert(onboardingItems)
          .values(
            resolved.map((r) => ({
              ...r,
              orgId: org.id,
              runId: run!.id,
              assigneeEmployeeId: r.assigneeEmployeeId && valid.has(r.assigneeEmployeeId) ? r.assigneeEmployeeId : null,
            })),
          )
          .returning();
        // Each step is also a task, so it shows up in the assignee's My work.
        for (const item of items) {
          const [task] = await tx
            .insert(tasks)
            .values({
              orgId: org.id,
              title: `${item.title} · ${emp.fullName}`,
              description: item.description,
              dueDate: item.dueDate,
              source: "onboarding",
              sourceId: item.id,
              createdBy: c.get("viewer")!.userId,
            })
            .returning({ id: tasks.id });
          if (item.assigneeEmployeeId) {
            await tx.insert(taskAssignees).values({ taskId: task!.id, employeeId: item.assigneeEmployeeId, orgId: org.id });
          }
        }
        return run!.id;
      });

      await db.update(employees).set({ status: "onboarding" }).where(and(eq(employees.id, emp.id), eq(employees.status, "active")));
      await audit(c, "onboarding.started", { type: "employee", id: emp.id }, { template: tpl.name });
      await notify(c, await userIdsForEmployees(db, org.id, [...valid]), {
        type: "onboarding.assigned",
        title: `You have onboarding steps for ${emp.fullName}`,
        link: "/people/onboarding",
      });
      return c.json({ run: { id: runId } }, 201);
    },
  )

  .patch("/onboarding/items/:id", validate("json", z.object({ done: z.boolean() })), async (c) => {
    const { done } = c.req.valid("json");
    const { db } = c.get("deps");
    const org = c.get("org");
    const [item] = await db
      .select({ id: onboardingItems.id, runId: onboardingItems.runId, assigneeEmployeeId: onboardingItems.assigneeEmployeeId })
      .from(onboardingItems)
      .where(and(eq(onboardingItems.orgId, org.id), eq(onboardingItems.id, c.req.param("id"))));
    if (!item) notFound("Step not found");

    const me = await viewerEmployee(c);
    if (item.assigneeEmployeeId !== me?.id && !hasPermission(c, "employee", "update")) forbid();

    const { runCompleted } = await setOnboardingItemDone(db, item.id, done, c.get("viewer")!.userId);
    return c.json({ ok: true, runCompleted });
  });
