import { type Action, can, type Resource } from "@hephaestus/core";
import { type Db, employees, members, notifications, orgSettings, sequences } from "@hephaestus/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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

/** The viewer's account row in the active org (their id as a chat participant). */
export async function viewerMember(c: Context<AppEnv>) {
  const { db } = c.get("deps");
  const [m] = await db
    .select({ id: members.id, name: members.name, image: members.image })
    .from(members)
    .where(and(eq(members.orgId, c.get("org").id), eq(members.userId, c.get("viewer")!.userId)));
  if (!m) throw new HTTPException(403, { message: "You're not a member of this organization" });
  return m;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export async function notify(
  c: Context<AppEnv>,
  recipients: string[],
  n: { type: string; title: string; body?: string; link?: string },
  opts: { email?: boolean } = {},
) {
  const { db, realtime, mailer } = c.get("deps");
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

  // Important events also go by email, when the edition has a mailer configured.
  if (opts.email && mailer.enabled) {
    const rows = await db
      .select({ email: members.email })
      .from(members)
      .where(and(eq(members.orgId, org.id), inArray(members.userId, to), eq(members.status, "active")));
    const base = c.req.header("origin") ?? new URL(c.req.url).origin;
    const href = n.link ? new URL(n.link, base).href : base;
    const html = `<div style="font-family:system-ui,sans-serif;max-width:520px">
<p style="font-size:16px;font-weight:600">${escapeHtml(n.title)}</p>
${n.body ? `<p style="color:#555">${escapeHtml(n.body)}</p>` : ""}
<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#ff5a1f;color:#121110;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Open in Hephaestus</a></p>
<p style="color:#999;font-size:12px">Webrizen AI Labs Pvt Ltd</p></div>`;
    await Promise.all(
      rows.map((r) =>
        mailer
          .send({ to: r.email, subject: n.title, text: `${n.title}\n\n${n.body ?? ""}\n\nOpen in Hephaestus: ${href}`, html })
          .catch((err) => console.error("Email failed", err)),
      ),
    );
  }
}
