import { departments, employees, members, teamMembers, teams } from "@hephaestus/db";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { audit } from "../../audit.ts";
import type { AppEnv } from "../../context.ts";
import { notFound } from "../../helpers.ts";
import { requirePermission } from "../../middleware.ts";
import { validate } from "../../validate.ts";

const color = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a hex colour").nullish();

const departmentInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  description: z.string().trim().max(500).nullish(),
  parentId: z.uuid().nullish(),
  headEmployeeId: z.uuid().nullish(),
  color,
});

const teamInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  description: z.string().trim().max(500).nullish(),
  leadEmployeeId: z.uuid().nullish(),
});

function uniqueViolation(err: unknown) {
  const code = (err as { code?: string; cause?: { code?: string } })?.cause?.code ?? (err as { code?: string })?.code;
  return code === "23505";
}

async function assertEmployeesInOrg(db: AppEnv["Variables"]["deps"]["db"], orgId: string, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (list.length === 0) return;
  const [row] = await db
    .select({ n: count() })
    .from(employees)
    .where(and(eq(employees.orgId, orgId), inArray(employees.id, list)));
  if ((row?.n ?? 0) !== list.length) throw new HTTPException(422, { message: "Unknown employee" });
}

export const structureRoutes = new Hono<AppEnv>()

  /* ---------------- Departments ---------------- */

  .get("/departments", requirePermission("department", "read"), async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const rows = await db
      .select({
        id: departments.id,
        name: departments.name,
        description: departments.description,
        parentId: departments.parentId,
        headEmployeeId: departments.headEmployeeId,
        headName: sql<string | null>`(select full_name from employees h where h.id = ${departments.headEmployeeId})`,
        color: departments.color,
        headcount: count(employees.id),
      })
      .from(departments)
      .leftJoin(employees, and(eq(employees.departmentId, departments.id), ne(employees.status, "offboarded")))
      .where(eq(departments.orgId, org.id))
      .groupBy(departments.id)
      .orderBy(asc(departments.name));
    return c.json({ departments: rows });
  })

  .post("/departments", requirePermission("department", "manage"), validate("json", departmentInput), async (c) => {
    const input = c.req.valid("json");
    const { db } = c.get("deps");
    const org = c.get("org");
    await assertEmployeesInOrg(db, org.id, [input.headEmployeeId]);
    if (input.parentId) {
      const [p] = await db.select({ id: departments.id }).from(departments).where(and(eq(departments.id, input.parentId), eq(departments.orgId, org.id)));
      if (!p) throw new HTTPException(422, { message: "Unknown parent department" });
    }
    try {
      const [row] = await db.insert(departments).values({ ...input, orgId: org.id }).returning({ id: departments.id });
      await audit(c, "department.created", { type: "department", id: row!.id }, { name: input.name });
      return c.json({ department: row }, 201);
    } catch (err) {
      if (uniqueViolation(err)) throw new HTTPException(409, { message: "A department with that name already exists" });
      throw err;
    }
  })

  .patch("/departments/:id", requirePermission("department", "manage"), validate("json", departmentInput.partial()), async (c) => {
    const input = c.req.valid("json");
    const { db } = c.get("deps");
    const org = c.get("org");
    const id = c.req.param("id");
    await assertEmployeesInOrg(db, org.id, [input.headEmployeeId]);
    if (input.parentId) {
      // The new parent must not be this department or one of its descendants.
      const all = await db.select({ id: departments.id, parentId: departments.parentId }).from(departments).where(eq(departments.orgId, org.id));
      const parentOf = new Map(all.map((d) => [d.id, d.parentId]));
      if (!parentOf.has(input.parentId)) throw new HTTPException(422, { message: "Unknown parent department" });
      for (let cur: string | null | undefined = input.parentId; cur; cur = parentOf.get(cur)) {
        if (cur === id) throw new HTTPException(422, { message: "A department can't sit inside itself" });
      }
    }
    try {
      const [row] = await db
        .update(departments)
        .set(input)
        .where(and(eq(departments.orgId, org.id), eq(departments.id, id)))
        .returning({ id: departments.id });
      if (!row) notFound("Department not found");
    } catch (err) {
      if (uniqueViolation(err)) throw new HTTPException(409, { message: "A department with that name already exists" });
      throw err;
    }
    await audit(c, "department.updated", { type: "department", id }, { fields: Object.keys(input) });
    return c.json({ ok: true });
  })

  .delete("/departments/:id", requirePermission("department", "manage"), async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const id = c.req.param("id");
    // Employees and sub-departments are kept; their department link is cleared.
    const [row] = await db
      .delete(departments)
      .where(and(eq(departments.orgId, org.id), eq(departments.id, id)))
      .returning({ id: departments.id, name: departments.name });
    if (!row) notFound("Department not found");
    await audit(c, "department.deleted", { type: "department", id }, { name: row.name });
    return c.json({ ok: true });
  })

  /* ---------------- Teams ---------------- */

  .get("/teams", requirePermission("department", "read"), async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const list = await db
      .select({
        id: teams.id,
        name: teams.name,
        description: teams.description,
        leadEmployeeId: teams.leadEmployeeId,
      })
      .from(teams)
      .where(eq(teams.orgId, org.id))
      .orderBy(asc(teams.name));
    const people = await db
      .select({
        teamId: teamMembers.teamId,
        id: employees.id,
        fullName: employees.fullName,
        jobTitle: employees.jobTitle,
        image: members.image,
      })
      .from(teamMembers)
      .innerJoin(employees, eq(employees.id, teamMembers.employeeId))
      .leftJoin(members, eq(members.id, employees.memberId))
      .where(and(eq(teamMembers.orgId, org.id), ne(employees.status, "offboarded")))
      .orderBy(asc(employees.fullName));
    return c.json({
      teams: list.map((t) => ({ ...t, members: people.filter((p) => p.teamId === t.id).map(({ teamId: _, ...p }) => p) })),
    });
  })

  .post(
    "/teams",
    requirePermission("department", "manage"),
    validate("json", teamInput.extend({ memberIds: z.array(z.uuid()).max(500).default([]) })),
    async (c) => {
      const { memberIds, ...input } = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      await assertEmployeesInOrg(db, org.id, [input.leadEmployeeId, ...memberIds]);
      const id = await db.transaction(async (tx) => {
        const [row] = await tx.insert(teams).values({ ...input, orgId: org.id }).returning({ id: teams.id });
        if (memberIds.length) {
          await tx.insert(teamMembers).values([...new Set(memberIds)].map((employeeId) => ({ teamId: row!.id, employeeId, orgId: org.id })));
        }
        return row!.id;
      });
      await audit(c, "team.created", { type: "team", id }, { name: input.name, members: memberIds.length });
      return c.json({ team: { id } }, 201);
    },
  )

  .patch(
    "/teams/:id",
    requirePermission("department", "manage"),
    validate("json", teamInput.partial().extend({ memberIds: z.array(z.uuid()).max(500).optional() })),
    async (c) => {
      const { memberIds, ...input } = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      const id = c.req.param("id");
      await assertEmployeesInOrg(db, org.id, [input.leadEmployeeId, ...(memberIds ?? [])]);
      await db.transaction(async (tx) => {
        const [row] = await tx
          .update(teams)
          .set({ ...input, updatedAt: new Date() })
          .where(and(eq(teams.orgId, org.id), eq(teams.id, id)))
          .returning({ id: teams.id });
        if (!row) notFound("Team not found");
        if (memberIds) {
          await tx.delete(teamMembers).where(eq(teamMembers.teamId, id));
          if (memberIds.length) {
            await tx.insert(teamMembers).values([...new Set(memberIds)].map((employeeId) => ({ teamId: id, employeeId, orgId: org.id })));
          }
        }
      });
      await audit(c, "team.updated", { type: "team", id }, { fields: Object.keys(input), members: memberIds?.length });
      return c.json({ ok: true });
    },
  )

  .delete("/teams/:id", requirePermission("department", "manage"), async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const id = c.req.param("id");
    const [row] = await db.delete(teams).where(and(eq(teams.orgId, org.id), eq(teams.id, id))).returning({ name: teams.name });
    if (!row) notFound("Team not found");
    await audit(c, "team.deleted", { type: "team", id }, { name: row.name });
    return c.json({ ok: true });
  });
