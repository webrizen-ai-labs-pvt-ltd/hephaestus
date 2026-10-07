import { addDays, can, isoWeekday, todayIn } from "@operant/core";
import {
  auditEvents,
  channelMembers,
  employees,
  holidays,
  invoices,
  leaveRequests,
  members,
  messages,
  milestones,
  notifications,
  onboardingItems,
  orgSettings,
  payments,
  projects,
  taskAssignees,
  tasks,
} from "@operant/db";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../context.ts";
import { orgWorkSettings, viewerEmployee } from "../helpers.ts";
import { effectiveDueDate } from "../finance/installments.ts";

/**
 * Everything the home screen needs in one round trip: the viewer's day,
 * what needs their attention, a pulse per pillar, what's coming up and what
 * just happened. Every section respects the viewer's permissions.
 */
export const homeRoutes = new Hono<AppEnv>().get("/home", async (c) => {
  const { db } = c.get("deps");
  const org = c.get("org");
  const viewer = c.get("viewer")!;
  const perms = viewer.org?.permissions ?? {};
  const { timezone, workWeek } = await orgWorkSettings(db, org.id);
  const today = todayIn(timezone);
  const monday = addDays(today, 1 - isoWeekday(today));
  const sunday = addDays(monday, 6);
  const in14 = addDays(today, 14);
  const me = await viewerEmployee(c);
  const [member] = await db.select({ id: members.id }).from(members).where(and(eq(members.orgId, org.id), eq(members.userId, viewer.userId)));

  /* ---------------- My day ---------------- */

  const myTasks = me
    ? await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
          projectId: tasks.projectId,
          number: tasks.number,
          projectKey: projects.key,
          projectName: projects.name,
          projectColor: projects.color,
          source: tasks.source,
        })
        .from(tasks)
        .innerJoin(taskAssignees, and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.employeeId, me.id)))
        .leftJoin(projects, eq(projects.id, tasks.projectId))
        .where(and(eq(tasks.orgId, org.id), ne(tasks.status, "done"), or(isNull(tasks.projectId), ne(projects.status, "archived"))))
        .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.createdAt))
        .limit(200)
    : [];
  const buckets = { overdue: 0, today: 0, week: 0, later: 0, noDate: 0 };
  for (const t of myTasks) {
    if (!t.dueDate) buckets.noDate++;
    else if (t.dueDate < today) buckets.overdue++;
    else if (t.dueDate === today) buckets.today++;
    else if (t.dueDate <= sunday) buckets.week++;
    else buckets.later++;
  }
  const [doneThisWeek] = me
    ? await db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(tasks)
        .innerJoin(taskAssignees, and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.employeeId, me.id)))
        .where(and(eq(tasks.orgId, org.id), eq(tasks.status, "done"), gte(tasks.completedAt, new Date(`${monday}T00:00:00Z`))))
    : [{ n: 0 }];

  /* ---------------- Needs attention ---------------- */

  const attention: { kind: string; count: number; title: string; detail?: string; link: string; amount?: number }[] = [];

  if (me || can(perms, "leave", "approve")) {
    const rows = await db
      .select({ id: leaveRequests.id, name: employees.fullName, days: leaveRequests.days, start: leaveRequests.startDate })
      .from(leaveRequests)
      .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .where(
        and(
          eq(leaveRequests.orgId, org.id),
          eq(leaveRequests.status, "pending"),
          me ? ne(leaveRequests.employeeId, me.id) : undefined,
          can(perms, "leave", "approve") ? undefined : me ? eq(employees.managerId, me.id) : sql`false`,
        ),
      )
      .orderBy(asc(leaveRequests.startDate));
    if (rows.length) {
      attention.push({
        kind: "leave",
        count: rows.length,
        title: rows.length === 1 ? `${rows[0]!.name} asked for ${Number(rows[0]!.days)} day${Number(rows[0]!.days) === 1 ? "" : "s"} off` : `${rows.length} leave requests to review`,
        detail: rows.length > 1 ? rows.slice(0, 3).map((r) => r.name.split(" ")[0]).join(", ") : `From ${rows[0]!.start}`,
        link: "/people/leave?tab=approvals",
      });
    }
  }

  if (can(perms, "invoice", "read")) {
    const [cur] = await db.select({ currency: orgSettings.currency }).from(orgSettings).where(eq(orgSettings.orgId, org.id));
    const [od] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number), amount: sql<number>`coalesce(sum(${invoices.total} - ${invoices.amountPaid}), 0)`.mapWith(Number) })
      .from(invoices)
      .where(
        and(
          eq(invoices.orgId, org.id),
          eq(invoices.kind, "invoice"),
          eq(invoices.currency, cur?.currency ?? "INR"),
          inArray(invoices.status, ["sent", "partially_paid"]),
          sql`${effectiveDueDate} < ${today}`,
        ),
      );
    if (od?.n) attention.push({ kind: "overdue_invoices", count: od.n, title: `${od.n} invoice${od.n === 1 ? " is" : "s are"} overdue`, amount: od.amount, link: "/finance/invoices", detail: "Send a reminder or record a payment" });
    const [drafts] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), eq(invoices.kind, "invoice"), eq(invoices.status, "draft")));
    if (drafts?.n) attention.push({ kind: "draft_invoices", count: drafts.n, title: `${drafts.n} draft invoice${drafts.n === 1 ? "" : "s"} ready to send`, link: "/finance/invoices", detail: "Review and issue" });
  }

  if (me) {
    const [steps] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(onboardingItems)
      .where(and(eq(onboardingItems.orgId, org.id), eq(onboardingItems.assigneeEmployeeId, me.id), isNull(onboardingItems.doneAt)));
    if (steps?.n) attention.push({ kind: "onboarding", count: steps.n, title: `${steps.n} onboarding step${steps.n === 1 ? "" : "s"} assigned to you`, link: "/people/onboarding", detail: "Help a new joiner settle in" });
  }

  const [mentions] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(notifications)
    .where(and(eq(notifications.orgId, org.id), eq(notifications.recipientId, viewer.userId), isNull(notifications.readAt), sql`${notifications.type} like '%mention%'`));
  if (mentions?.n) attention.push({ kind: "mentions", count: mentions.n, title: `${mentions.n} unread mention${mentions.n === 1 ? "" : "s"}`, link: "/collab/mentions", detail: "People are waiting on you" });

  const [unreadNotes] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(notifications)
    .where(and(eq(notifications.orgId, org.id), eq(notifications.recipientId, viewer.userId), isNull(notifications.readAt)));

  const [unreadChat] = member
    ? await db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(messages)
        .innerJoin(channelMembers, and(eq(channelMembers.channelId, messages.channelId), eq(channelMembers.memberId, member.id)))
        .where(and(gt(messages.createdAt, channelMembers.lastReadAt), isNull(messages.deletedAt), or(isNull(messages.authorId), ne(messages.authorId, member.id))))
    : [{ n: 0 }];

  /* ---------------- Pulse per pillar ---------------- */

  const [head] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number), joiners: sql<number>`count(*) filter (where ${employees.joinDate} >= ${`${today.slice(0, 7)}-01`})`.mapWith(Number) })
    .from(employees)
    .where(and(eq(employees.orgId, org.id), ne(employees.status, "offboarded")));
  const away = await db
    .select({ id: employees.id, name: employees.fullName, image: members.image, until: leaveRequests.endDate })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .leftJoin(members, eq(members.id, employees.memberId))
    .where(and(eq(leaveRequests.orgId, org.id), eq(leaveRequests.status, "approved"), lte(leaveRequests.startDate, today), gte(leaveRequests.endDate, today)));

  const [workCounts] = await db
    .select({
      open: sql<number>`count(*) filter (where ${tasks.status} <> 'done')`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${tasks.status} <> 'done' and ${tasks.dueDate} < ${today})`.mapWith(Number),
      inProgress: sql<number>`count(*) filter (where ${tasks.status} in ('in_progress', 'review'))`.mapWith(Number),
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.orgId, org.id), isNull(tasks.parentId), or(isNull(tasks.projectId), ne(projects.status, "archived"))));
  // Tasks completed per day across the team, last 14 days.
  const velocityRows = await db
    .select({ day: sql<string>`to_char(${tasks.completedAt} at time zone ${timezone}, 'YYYY-MM-DD')`, n: sql<number>`count(*)`.mapWith(Number) })
    .from(tasks)
    .where(and(eq(tasks.orgId, org.id), eq(tasks.status, "done"), gte(tasks.completedAt, new Date(`${addDays(today, -13)}T00:00:00Z`))))
    .groupBy(sql`1`);
  const velocity = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i - 13);
    return { day: d, done: velocityRows.find((v) => v.day === d)?.n ?? 0 };
  });
  const activeProjects = can(perms, "project", "read")
    ? await db
        .select({
          id: projects.id,
          name: projects.name,
          key: projects.key,
          color: projects.color,
          dueDate: projects.dueDate,
          total: sql<number>`count(${tasks.id}) filter (where ${tasks.parentId} is null)`.mapWith(Number),
          done: sql<number>`count(${tasks.id}) filter (where ${tasks.parentId} is null and ${tasks.status} = 'done')`.mapWith(Number),
          overdue: sql<number>`count(${tasks.id}) filter (where ${tasks.parentId} is null and ${tasks.status} <> 'done' and ${tasks.dueDate} < ${today})`.mapWith(Number),
        })
        .from(projects)
        .leftJoin(tasks, eq(tasks.projectId, projects.id))
        .where(and(eq(projects.orgId, org.id), eq(projects.status, "active")))
        .groupBy(projects.id)
        .orderBy(sql`${projects.dueDate} asc nulls last`)
        .limit(4)
    : [];

  let finance: null | { outstanding: number; overdue: number; collectedThisMonth: number; collectedLastMonth: number; monthly: { month: string; amount: number }[]; currency: string } = null;
  if (can(perms, "invoice", "read") || can(perms, "report", "read_finance")) {
    const [cur] = await db.select({ currency: orgSettings.currency }).from(orgSettings).where(eq(orgSettings.orgId, org.id));
    const currency = cur?.currency ?? "INR";
    const [o] = await db
      .select({
        outstanding: sql<number>`coalesce(sum(${invoices.total} - ${invoices.amountPaid}), 0)`.mapWith(Number),
        overdue: sql<number>`coalesce(sum(${invoices.total} - ${invoices.amountPaid}) filter (where ${effectiveDueDate} < ${today}), 0)`.mapWith(Number),
      })
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), eq(invoices.kind, "invoice"), eq(invoices.currency, currency), inArray(invoices.status, ["sent", "partially_paid"])));
    const [y, m] = today.split("-").map(Number) as [number, number];
    const start6 = new Date(Date.UTC(y, m - 6, 1)).toISOString().slice(0, 10);
    const rows = await db
      .select({ month: sql<string>`to_char(${payments.paidOn}, 'YYYY-MM')`, amount: sql<number>`sum(${payments.amount})`.mapWith(Number) })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.orgId, org.id), eq(invoices.currency, currency), isNull(payments.voidedAt), ne(payments.method, "credit_note"), gte(payments.paidOn, start6)))
      .groupBy(sql`1`);
    const monthly = Array.from({ length: 6 }, (_, i) => {
      const month = new Date(Date.UTC(y, m - 6 + i, 1)).toISOString().slice(0, 7);
      return { month, amount: rows.find((r) => r.month === month)?.amount ?? 0 };
    });
    finance = {
      currency,
      outstanding: o?.outstanding ?? 0,
      overdue: o?.overdue ?? 0,
      collectedThisMonth: monthly[5]!.amount,
      collectedLastMonth: monthly[4]!.amount,
      monthly,
    };
  }

  /* ---------------- Coming up (next 14 days) ---------------- */

  const upcoming: { date: string; kind: "holiday" | "milestone" | "leave" | "task"; title: string; detail?: string; link?: string; color?: string }[] = [];
  for (const h of await db.select().from(holidays).where(and(eq(holidays.orgId, org.id), gte(holidays.date, today), lte(holidays.date, in14))).orderBy(asc(holidays.date))) {
    upcoming.push({ date: h.date, kind: "holiday", title: h.name, detail: h.optional ? "Optional holiday" : "Holiday" });
  }
  if (can(perms, "project", "read")) {
    const ms = await db
      .select({ id: milestones.id, name: milestones.name, dueDate: milestones.dueDate, projectId: projects.id, projectName: projects.name, color: projects.color })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .where(and(eq(milestones.orgId, org.id), isNull(milestones.completedAt), gte(milestones.dueDate, today), lte(milestones.dueDate, in14), ne(projects.status, "archived")));
    for (const m of ms) upcoming.push({ date: m.dueDate!, kind: "milestone", title: m.name, detail: m.projectName, link: `/work/projects/${m.projectId}?view=milestones`, color: m.color });
  }
  const leaves = await db
    .select({ name: employees.fullName, start: leaveRequests.startDate, end: leaveRequests.endDate })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .where(and(eq(leaveRequests.orgId, org.id), eq(leaveRequests.status, "approved"), gt(leaveRequests.startDate, today), lte(leaveRequests.startDate, in14)));
  for (const l of leaves) upcoming.push({ date: l.start, kind: "leave", title: `${l.name} is away`, detail: l.start === l.end ? "1 day" : `until ${new Date(`${l.end}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`, link: "/people/leave?tab=calendar" });
  for (const t of myTasks.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= in14).slice(0, 6)) {
    upcoming.push({ date: t.dueDate!, kind: "task", title: t.title, detail: t.projectName ?? "Personal", link: t.projectId ? `/work/projects/${t.projectId}?task=${t.id}` : `/work?task=${t.id}`, color: t.projectColor ?? undefined });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  /* ---------------- Recent activity ---------------- */

  const activityRows = await db
        .select({ id: auditEvents.id, action: auditEvents.action, actorId: auditEvents.actorId, targetType: auditEvents.targetType, metadata: auditEvents.metadata, createdAt: auditEvents.createdAt, actorName: members.name, actorImage: members.image })
        .from(auditEvents)
        .leftJoin(members, and(eq(members.orgId, auditEvents.orgId), eq(members.userId, auditEvents.actorId)))
        .where(
          and(
            eq(auditEvents.orgId, org.id),
            // A safe, public subset: what got made or finished, never settings or money details for people without access.
            inArray(auditEvents.action, [
              "employee.created",
              "project.created",
              "milestone.completed",
              "onboarding.started",
              "leave.approved",
              "channel.created",
              "decision.marked",
              ...(can(perms, "invoice", "read") ? ["invoice.issued", "payment.recorded", "client.created"] : []),
            ]),
          ),
        )
        .orderBy(desc(auditEvents.createdAt))
        .limit(12);

  return c.json({
    today,
    workWeek,
    me: me ? { employeeId: me.id, name: me.fullName } : null,
    day: { buckets, tasks: myTasks.slice(0, 8), openTotal: myTasks.length, doneThisWeek: doneThisWeek?.n ?? 0 },
    attention,
    counts: { notifications: unreadNotes?.n ?? 0, chat: unreadChat?.n ?? 0, myOpenTasks: myTasks.length, attention: attention.reduce((s, a) => s + a.count, 0) },
    people: { headcount: head?.n ?? 0, joinersThisMonth: head?.joiners ?? 0, away },
    work: { ...workCounts, velocity, projects: activeProjects },
    finance,
    upcoming: upcoming.slice(0, 10),
    activity: activityRows.map(({ metadata, ...a }) => ({ ...a, metadata: pickPublic(metadata) })),
  });
});

/** Only harmless descriptive fields from audit metadata reach the home feed. */
function pickPublic(m: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ["name", "title", "milestone", "number", "template", "kind", "amount", "method"]) if (k in m) out[k] = m[k];
  return out;
}
