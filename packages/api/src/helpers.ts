import { type Action, can, type Resource } from "@hephaestus/core";
import { type Db, employees, members, notifications, orgSettings, sequences } from "@hephaestus/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./context.ts";

/** Next value of a gap-free per-org counter (atomic upsert). */
export async function nextSequence(db: Db, orgId: string, key: string): Promise<number> {
  const [row] = await db
    .insert(sequences)
    .values({ orgId, key, nextValue: 2 })
    .onConflictDoUpdate({ target: [sequences.orgId, sequences.key], set: { nextValue: sql`${sequences.nextValue} + 1` } })
    .returning({ value: sql<number>`${sequences.nextValue} - 1` });
  return Number(row!.value);
}

export function hasPermission<R extends Resource>(c: Context<AppEnv>, resource: R, action: Action<R>) {
  return can(c.get("viewer")?.org?.permissions ?? {}, resource, action);
}

export function forbid(message = "You don't have permission to do that"): never {
  throw new HTTPException(403, { message });
}

export function notFound(message = "Not found"): never {
  throw new HTTPException(404, { message });
}

export async function orgWorkSettings(db: Db, orgId: string) {
  const [s] = await db
    .select({ workWeek: orgSettings.workWeek, timezone: orgSettings.timezone })
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId));
  return { workWeek: s?.workWeek ?? [1, 2, 3, 4, 5], timezone: s?.timezone ?? "Asia/Kolkata" };
}

/**
 * The viewer's own employee record. If none is linked yet but an employee has
 * the viewer's work email, link it (so HR can add people before they sign in).
 */
export async function viewerEmployee(c: Context<AppEnv>) {
  const { db } = c.get("deps");
  const org = c.get("org");
  const viewer = c.get("viewer")!;
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.orgId, org.id), eq(members.userId, viewer.userId)));
  if (!member) return null;

  const [linked] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.orgId, org.id), eq(employees.memberId, member.id)));
  if (linked) return linked;

  if (!viewer.email) return null;
  const [byEmail] = await db
    .update(employees)
    .set({ memberId: member.id })
    .where(
      and(
        eq(employees.orgId, org.id),
        isNull(employees.memberId),
        sql`lower(${employees.workEmail}) = lower(${viewer.email})`,
      ),
    )
    .returning();
  return byEmail ?? null;
}

/** Sign-in account ids for employees (for notifications). */
export async function userIdsForEmployees(db: Db, orgId: string, employeeIds: (string | null | undefined)[]) {
  const ids = [...new Set(employeeIds.filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return [];
  const rows = await db
    .select({ userId: members.userId })
    .from(employees)
    .innerJoin(members, eq(members.id, employees.memberId))
    .where(and(eq(employees.orgId, orgId), sql`${employees.id} = any(${sql.param(ids)}::uuid[])`));
  return rows.map((r) => r.userId);
}

export async function notify(
  c: Context<AppEnv>,
  recipients: string[],
  n: { type: string; title: string; body?: string; link?: string },
) {
  const { db, realtime } = c.get("deps");
  const org = c.get("org");
  const self = c.get("viewer")?.userId;
  const to = [...new Set(recipients)].filter((r) => r !== self);
  if (to.length === 0) return;
  await db.insert(notifications).values(to.map((recipientId) => ({ orgId: org.id, recipientId, ...n })));
  await Promise.all(
    to.map((userId) =>
      realtime.publish({ channel: `org:${org.id}:user:${userId}`, type: "notification", payload: { type: n.type } }),
    ),
  );
}
