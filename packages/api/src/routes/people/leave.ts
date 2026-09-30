import { countLeaveDays, isIsoDate, todayIn } from "@hephaestus/core";
import { employees, HALF_DAY, holidays, LEAVE_STATUSES, leaveRequests, leaveTypes, members } from "@hephaestus/db";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { audit } from "../../audit.ts";
import type { AppEnv } from "../../context.ts";
import { forbid, hasPermission, notFound, notify, orgWorkSettings, userIdsForEmployees, viewerEmployee } from "../../helpers.ts";
import { requirePermission } from "../../middleware.ts";
import { validate } from "../../validate.ts";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD)");

const leaveTypeInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#2e8b6e"),
  annualQuota: z.number().min(0).max(365).multipleOf(0.5).nullable().default(null),
  paid: z.boolean().default(true),
});

const holidayInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  date: isoDate,
  optional: z.boolean().default(false),
});

const requestColumns = {
  id: leaveRequests.id,
  employeeId: leaveRequests.employeeId,
  employeeName: employees.fullName,
  managerId: employees.managerId,
  image: members.image,
  leaveTypeId: leaveRequests.leaveTypeId,
  leaveTypeName: leaveTypes.name,
  leaveTypeColor: leaveTypes.color,
  startDate: leaveRequests.startDate,
  endDate: leaveRequests.endDate,
  halfDay: leaveRequests.halfDay,
  days: leaveRequests.days,
  reason: leaveRequests.reason,
  status: leaveRequests.status,
  decidedAt: leaveRequests.decidedAt,
  decisionNote: leaveRequests.decisionNote,
  createdAt: leaveRequests.createdAt,
};

function requestQuery(db: AppEnv["Variables"]["deps"]["db"]) {
  return db
    .select(requestColumns)
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .leftJoin(members, eq(members.id, employees.memberId));
}

/** Approved + pending days per leave type for one employee in one calendar year. */
async function usedDays(db: AppEnv["Variables"]["deps"]["db"], orgId: string, employeeId: string, year: string) {
  const rows = await db
    .select({
      leaveTypeId: leaveRequests.leaveTypeId,
      approved: sql<number>`coalesce(sum(case when ${leaveRequests.status} = 'approved' then ${leaveRequests.days} end), 0)`,
      pending: sql<number>`coalesce(sum(case when ${leaveRequests.status} = 'pending' then ${leaveRequests.days} end), 0)`,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.orgId, orgId),
        eq(leaveRequests.employeeId, employeeId),
        inArray(leaveRequests.status, ["approved", "pending"]),
        gte(leaveRequests.startDate, `${year}-01-01`),
        lte(leaveRequests.startDate, `${year}-12-31`),
      ),
    )
    .groupBy(leaveRequests.leaveTypeId);
  return new Map(rows.map((r) => [r.leaveTypeId, { approved: Number(r.approved), pending: Number(r.pending) }]));
}

/** Leave approvers: anyone with leave:approve, or the employee's manager. */
async function canDecide(c: Context<AppEnv>, employee: { id: string; managerId: string | null }) {
  const me = await viewerEmployee(c);
  if (me?.id === employee.id) return false; // nobody approves their own leave
  return hasPermission(c, "leave", "approve") || (me !== null && employee.managerId === me.id);
}

export const leaveRoutes = new Hono<AppEnv>()

  /* ---------------- Types and holidays ---------------- */

  .get("/leave/types", requirePermission("leave", "read"), async (c) => {
    const { db } = c.get("deps");
    const rows = await db
      .select()
      .from(leaveTypes)
      .where(and(eq(leaveTypes.orgId, c.get("org").id), isNull(leaveTypes.archivedAt)))
      .orderBy(asc(leaveTypes.name));
    return c.json({ types: rows });
  })

  .post("/leave/types", requirePermission("settings", "manage"), validate("json", leaveTypeInput), async (c) => {
    const { db } = c.get("deps");
    const [row] = await db
      .insert(leaveTypes)
      .values({ ...c.req.valid("json"), orgId: c.get("org").id })
      .returning({ id: leaveTypes.id });
    await audit(c, "leave_type.created", { type: "leave_type", id: row!.id });
    return c.json({ type: row }, 201);
  })

  .patch("/leave/types/:id", requirePermission("settings", "manage"), validate("json", leaveTypeInput.partial()), async (c) => {
    const { db } = c.get("deps");
    const [row] = await db
      .update(leaveTypes)
      .set(c.req.valid("json"))
      .where(and(eq(leaveTypes.orgId, c.get("org").id), eq(leaveTypes.id, c.req.param("id"))))
      .returning({ id: leaveTypes.id });
    if (!row) notFound("Leave type not found");
    await audit(c, "leave_type.updated", { type: "leave_type", id: row.id });
    return c.json({ ok: true });
  })

  .delete("/leave/types/:id", requirePermission("settings", "manage"), async (c) => {
    const { db } = c.get("deps");
    // Archived, not deleted: past requests still reference it.
    const [row] = await db
      .update(leaveTypes)
      .set({ archivedAt: new Date() })
      .where(and(eq(leaveTypes.orgId, c.get("org").id), eq(leaveTypes.id, c.req.param("id"))))
      .returning({ id: leaveTypes.id });
    if (!row) notFound("Leave type not found");
    await audit(c, "leave_type.archived", { type: "leave_type", id: row.id });
    return c.json({ ok: true });
  })

  .get("/holidays", requirePermission("leave", "read"), validate("query", z.object({ year: z.string().regex(/^\d{4}$/).optional() })), async (c) => {
    const { db } = c.get("deps");
    const { year } = c.req.valid("query");
    const rows = await db
      .select()
      .from(holidays)
      .where(
        and(
          eq(holidays.orgId, c.get("org").id),
          year ? and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)) : undefined,
        ),
      )
      .orderBy(asc(holidays.date));
    return c.json({ holidays: rows });
  })

  .post("/holidays", requirePermission("settings", "manage"), validate("json", holidayInput), async (c) => {
    const { db } = c.get("deps");
    const [row] = await db
      .insert(holidays)
      .values({ ...c.req.valid("json"), orgId: c.get("org").id })
      .onConflictDoNothing()
      .returning({ id: holidays.id });
    if (!row) throw new HTTPException(409, { message: "That holiday already exists" });
    await audit(c, "holiday.created", { type: "holiday", id: row.id });
    return c.json({ holiday: row }, 201);
  })

  .delete("/holidays/:id", requirePermission("settings", "manage"), async (c) => {
    const { db } = c.get("deps");
    const [row] = await db
      .delete(holidays)
      .where(and(eq(holidays.orgId, c.get("org").id), eq(holidays.id, c.req.param("id"))))
      .returning({ id: holidays.id });
    if (!row) notFound("Holiday not found");
    await audit(c, "holiday.deleted", { type: "holiday", id: row.id });
    return c.json({ ok: true });
  })

  /* ---------------- Balances ---------------- */

  .get(
    "/leave/balances",
    requirePermission("leave", "read"),
    validate("query", z.object({ employeeId: z.uuid().optional(), year: z.string().regex(/^\d{4}$/).optional() })),
    async (c) => {
      const { db } = c.get("deps");
      const org = c.get("org");
      const q = c.req.valid("query");
      const me = await viewerEmployee(c);
      const employeeId = q.employeeId ?? me?.id;
      if (!employeeId) return c.json({ balances: [] });

      if (employeeId !== me?.id) {
        const [emp] = await db.select({ id: employees.id, managerId: employees.managerId }).from(employees).where(and(eq(employees.orgId, org.id), eq(employees.id, employeeId)));
        if (!emp) notFound("Employee not found");
        if (!(await canDecide(c, emp))) forbid();
      }

      const { timezone } = await orgWorkSettings(db, org.id);
      const year = q.year ?? todayIn(timezone).slice(0, 4);
      const types = await db.select().from(leaveTypes).where(and(eq(leaveTypes.orgId, org.id), isNull(leaveTypes.archivedAt))).orderBy(asc(leaveTypes.name));
      const used = await usedDays(db, org.id, employeeId, year);
      return c.json({
        year,
        balances: types.map((t) => {
          const u = used.get(t.id) ?? { approved: 0, pending: 0 };
          return {
            leaveTypeId: t.id,
            name: t.name,
            color: t.color,
            quota: t.annualQuota,
            approved: u.approved,
            pending: u.pending,
            remaining: t.annualQuota === null ? null : t.annualQuota - u.approved - u.pending,
          };
        }),
      });
    },
  )

  /* ---------------- Requests ---------------- */

  .get(
    "/leave/requests",
    requirePermission("leave", "read"),
    validate(
      "query",
      z.object({
        scope: z.enum(["mine", "approvals", "all"]).default("mine"),
        status: z.enum(LEAVE_STATUSES).optional(),
      }),
    ),
    async (c) => {
      const { scope, status } = c.req.valid("query");
      const { db } = c.get("deps");
      const org = c.get("org");
      const me = await viewerEmployee(c);

      let who;
      if (scope === "mine") {
        if (!me) return c.json({ requests: [] });
        who = eq(leaveRequests.employeeId, me.id);
      } else if (scope === "approvals") {
        // Everything I may decide on: all (approvers) or my direct reports (managers).
        who = hasPermission(c, "leave", "approve")
          ? me
            ? sql`${leaveRequests.employeeId} <> ${me.id}`
            : undefined
          : me
            ? eq(employees.managerId, me.id)
            : sql`false`;
      } else {
        if (!hasPermission(c, "leave", "approve")) forbid();
        who = undefined;
      }

      const rows = await requestQuery(db)
        .where(
          and(
            eq(leaveRequests.orgId, org.id),
            who,
            status ? eq(leaveRequests.status, status) : scope === "approvals" ? eq(leaveRequests.status, "pending") : undefined,
          ),
        )
        .orderBy(scope === "approvals" ? asc(leaveRequests.startDate) : desc(leaveRequests.startDate))
        .limit(300);
      return c.json({ requests: rows });
    },
  )

  .get(
    "/leave/calendar",
    requirePermission("leave", "read"),
    validate("query", z.object({ from: isoDate, to: isoDate })),
    async (c) => {
      const { from, to } = c.req.valid("query");
      const { db } = c.get("deps");
      const org = c.get("org");
      const rows = await requestQuery(db)
        .where(
          and(
            eq(leaveRequests.orgId, org.id),
            eq(leaveRequests.status, "approved"),
            lte(leaveRequests.startDate, to),
            gte(leaveRequests.endDate, from),
          ),
        )
        .orderBy(asc(leaveRequests.startDate));
      // Reasons are private to the employee and approvers.
      const days = await db
        .select()
        .from(holidays)
        .where(and(eq(holidays.orgId, org.id), gte(holidays.date, from), lte(holidays.date, to)))
        .orderBy(asc(holidays.date));
      return c.json({ requests: rows.map(({ reason: _, ...r }) => r), holidays: days });
    },
  )

  .post(
    "/leave/requests",
    requirePermission("leave", "request"),
    validate(
      "json",
      z
        .object({
          employeeId: z.uuid().optional(),
          leaveTypeId: z.uuid(),
          startDate: isoDate,
          endDate: isoDate,
          halfDay: z.enum(HALF_DAY).default("none"),
          reason: z.string().trim().max(1000).nullish(),
        })
        .refine((v) => v.endDate >= v.startDate, { message: "The end date is before the start date", path: ["endDate"] })
        .refine((v) => v.halfDay === "none" || v.startDate === v.endDate, {
          message: "Half days are only for single-day requests",
          path: ["halfDay"],
        }),
    ),
    async (c) => {
      const input = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      const me = await viewerEmployee(c);

      const employeeId = input.employeeId ?? me?.id;
      if (!employeeId) throw new HTTPException(422, { message: "Your account isn't linked to an employee profile yet" });
      if (employeeId !== me?.id && !hasPermission(c, "leave", "approve")) forbid("You can only request leave for yourself");

      const [emp] = await db
        .select({ id: employees.id, fullName: employees.fullName, managerId: employees.managerId, status: employees.status })
        .from(employees)
        .where(and(eq(employees.orgId, org.id), eq(employees.id, employeeId)));
      if (!emp || emp.status === "offboarded") notFound("Employee not found");

      const [type] = await db
        .select()
        .from(leaveTypes)
        .where(and(eq(leaveTypes.orgId, org.id), eq(leaveTypes.id, input.leaveTypeId), isNull(leaveTypes.archivedAt)));
      if (!type) throw new HTTPException(422, { message: "Unknown leave type" });

      const { workWeek } = await orgWorkSettings(db, org.id);
      const hols = await db
        .select({ date: holidays.date })
        .from(holidays)
        .where(
          and(eq(holidays.orgId, org.id), eq(holidays.optional, false), gte(holidays.date, input.startDate), lte(holidays.date, input.endDate)),
        );
      const days = countLeaveDays({
        start: input.startDate,
        end: input.endDate,
        workWeek,
        holidays: new Set(hols.map((h) => h.date)),
        halfDay: input.halfDay,
      });
      if (days <= 0) throw new HTTPException(422, { message: "Those dates don't include any working days" });

      const [overlap] = await db
        .select({ id: leaveRequests.id })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.orgId, org.id),
            eq(leaveRequests.employeeId, employeeId),
            inArray(leaveRequests.status, ["pending", "approved"]),
            lte(leaveRequests.startDate, input.endDate),
            gte(leaveRequests.endDate, input.startDate),
          ),
        )
        .limit(1);
      if (overlap) throw new HTTPException(409, { message: "This overlaps with another leave request" });

      if (type.annualQuota !== null) {
        const used = (await usedDays(db, org.id, employeeId, input.startDate.slice(0, 4))).get(type.id);
        const remaining = type.annualQuota - (used?.approved ?? 0) - (used?.pending ?? 0);
        if (days > remaining) {
          throw new HTTPException(422, { message: `Only ${remaining} day${remaining === 1 ? "" : "s"} of ${type.name} left this year` });
        }
      }

      const [row] = await db
        .insert(leaveRequests)
        .values({
          orgId: org.id,
          employeeId,
          leaveTypeId: type.id,
          startDate: input.startDate,
          endDate: input.endDate,
          halfDay: input.halfDay,
          days,
          reason: input.reason ?? null,
          createdBy: c.get("viewer")!.userId,
        })
        .returning({ id: leaveRequests.id });

      await audit(c, "leave.requested", { type: "leave_request", id: row!.id }, { days, type: type.name });
      await notify(c, await userIdsForEmployees(db, org.id, [emp.managerId]), {
        type: "leave.requested",
        title: `${emp.fullName} requested ${days} day${days === 1 ? "" : "s"} of ${type.name}`,
        body: `${input.startDate} to ${input.endDate}`,
        link: "/people/leave?tab=approvals",
      });
      return c.json({ request: { id: row!.id, days } }, 201);
    },
  )

  .post(
    "/leave/requests/:id/decide",
    validate("json", z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(500).nullish() })),
    async (c) => {
      const { decision, note } = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      const [req] = await requestQuery(db).where(and(eq(leaveRequests.orgId, org.id), eq(leaveRequests.id, c.req.param("id"))));
      if (!req) notFound("Leave request not found");
      if (!(await canDecide(c, { id: req.employeeId, managerId: req.managerId }))) forbid("You can't decide on this request");

      const [updated] = await db
        .update(leaveRequests)
        .set({ status: decision, decidedBy: c.get("viewer")!.userId, decidedAt: new Date(), decisionNote: note ?? null })
        .where(and(eq(leaveRequests.id, req.id), eq(leaveRequests.status, "pending")))
        .returning({ id: leaveRequests.id });
      if (!updated) throw new HTTPException(409, { message: "This request was already decided" });

      await audit(c, `leave.${decision}`, { type: "leave_request", id: req.id }, { note });
      await notify(c, await userIdsForEmployees(db, org.id, [req.employeeId]), {
        type: `leave.${decision}`,
        title: `Your ${req.leaveTypeName} request was ${decision}`,
        body: note ?? `${req.startDate} to ${req.endDate}`,
        link: "/people/leave",
      });
      return c.json({ ok: true });
    },
  )

  .post("/leave/requests/:id/cancel", async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const [req] = await requestQuery(db).where(and(eq(leaveRequests.orgId, org.id), eq(leaveRequests.id, c.req.param("id"))));
    if (!req) notFound("Leave request not found");

    const me = await viewerEmployee(c);
    const own = me?.id === req.employeeId;
    if (!own && !(await canDecide(c, { id: req.employeeId, managerId: req.managerId }))) forbid();

    const { timezone } = await orgWorkSettings(db, org.id);
    // Approved leave can be cancelled until it starts (approvers can always cancel).
    const cancellable =
      req.status === "pending" || (req.status === "approved" && (!own || req.startDate > todayIn(timezone)) );
    if (!cancellable) throw new HTTPException(409, { message: "This request can no longer be cancelled" });

    await db
      .update(leaveRequests)
      .set({ status: "cancelled" })
      .where(and(eq(leaveRequests.id, req.id), or(eq(leaveRequests.status, "pending"), eq(leaveRequests.status, "approved"))));
    await audit(c, "leave.cancelled", { type: "leave_request", id: req.id });
    if (!own) {
      await notify(c, await userIdsForEmployees(db, org.id, [req.employeeId]), {
        type: "leave.cancelled",
        title: `Your ${req.leaveTypeName} request was cancelled`,
        link: "/people/leave",
      });
    }
    return c.json({ ok: true });
  });
