import { extractMentions, previewText, QUICK_REACTIONS } from "@operant/core";
import {
  attachments,
  channelMembers,
  channels,
  clients,
  invoices,
  members,
  messageReactions,
  messages,
  projects,
  taskAssignees,
  tasks,
  threads,
} from "@operant/db";
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { audit } from "../audit.ts";
import type { AppEnv } from "../context.ts";
import { forbid, hasPermission, notFound, notify, userIdsForEmployees, viewerMember } from "../helpers.ts";
import { validate } from "../validate.ts";

type DbT = AppEnv["Variables"]["deps"]["db"];
type Ctx = Context<AppEnv>;
type Channel = typeof channels.$inferSelect;

const PAGE = 50;
const body = z.string().trim().min(1, "Write a message").max(10_000);

/* ---------------- Access ---------------- */

async function loadChannel(c: Ctx, id: string) {
  const { db } = c.get("deps");
  const [ch] = await db.select().from(channels).where(and(eq(channels.orgId, c.get("org").id), eq(channels.id, id)));
  if (!ch) notFound("Channel not found");
  return ch;
}

async function isChannelMember(db: DbT, channelId: string, memberId: string) {
  const [m] = await db
    .select({ id: channelMembers.memberId })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.memberId, memberId)));
  return Boolean(m);
}

/** Public channels are open to everyone with channel:read; private ones and DMs to their members. */
async function assertCanRead(c: Ctx, ch: Channel, memberId: string) {
  if (!hasPermission(c, "channel", "read")) forbid();
  if (ch.kind === "public") return;
  if (!(await isChannelMember(c.get("deps").db, ch.id, memberId))) notFound("Channel not found");
}

/** Comment threads can hang off records the viewer can read. */
const SUBJECTS = {
  task: { resource: "task" as const, table: tasks },
  project: { resource: "project" as const, table: projects },
  invoice: { resource: "invoice" as const, table: invoices },
  client: { resource: "client" as const, table: clients },
};
type SubjectType = keyof typeof SUBJECTS;

async function assertSubject(c: Ctx, type: SubjectType, id: string) {
  const s = SUBJECTS[type];
  if (!hasPermission(c, s.resource, "read")) forbid();
  const { db } = c.get("deps");
  const [row] = await db.select({ id: s.table.id }).from(s.table).where(and(eq(s.table.orgId, c.get("org").id), eq(s.table.id, id)));
  if (!row) notFound();
}

async function threadFor(db: DbT, orgId: string, type: string, id: string, create: boolean): Promise<typeof threads.$inferSelect | null> {
  const [t] = await db.select().from(threads).where(and(eq(threads.orgId, orgId), eq(threads.subjectType, type), eq(threads.subjectId, id)));
  if (t || !create) return t ?? null;
  const [created] = await db
    .insert(threads)
    .values({ orgId, subjectType: type, subjectId: id })
    .onConflictDoNothing()
    .returning();
  return created ?? (await threadFor(db, orgId, type, id, false));
}

/* ---------------- Message DTOs ---------------- */

const author = alias(members, "author");
const decider = alias(members, "decider");

async function hydrateMessages(db: DbT, orgId: string, viewerMemberId: string, rows: (typeof messages.$inferSelect)[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const people = new Set<string>();
  for (const r of rows) {
    if (r.authorId) people.add(r.authorId);
    if (r.decisionBy) people.add(r.decisionBy);
    for (const m of r.mentions) people.add(m);
  }
  const [who, reactions, files] = await Promise.all([
    people.size
      ? db
          .select({ id: members.id, name: members.name, image: members.image })
          .from(members)
          .where(and(eq(members.orgId, orgId), inArray(members.id, [...people])))
      : Promise.resolve([]),
    db
      .select({ messageId: messageReactions.messageId, emoji: messageReactions.emoji, memberId: messageReactions.memberId })
      .from(messageReactions)
      .where(inArray(messageReactions.messageId, ids))
      .orderBy(asc(messageReactions.createdAt)),
    db
      .select({ ownerId: attachments.ownerId, id: attachments.id, name: attachments.name, size: attachments.size, contentType: attachments.contentType })
      .from(attachments)
      .where(and(eq(attachments.orgId, orgId), eq(attachments.ownerType, "message"), inArray(attachments.ownerId, ids), isNull(attachments.deletedAt))),
  ]);
  const byId = new Map(who.map((p) => [p.id, p]));
  return rows.map((r) => {
    const deleted = Boolean(r.deletedAt);
    const grouped = new Map<string, { emoji: string; count: number; mine: boolean; names: string[] }>();
    for (const x of reactions.filter((x) => x.messageId === r.id)) {
      const g = grouped.get(x.emoji) ?? { emoji: x.emoji, count: 0, mine: false, names: [] };
      g.count++;
      g.mine ||= x.memberId === viewerMemberId;
      g.names.push(byId.get(x.memberId)?.name ?? "Someone");
      grouped.set(x.emoji, g);
    }
    return {
      id: r.id,
      channelId: r.channelId,
      threadId: r.threadId,
      author: r.authorId ? (byId.get(r.authorId) ?? { id: r.authorId, name: "Former member", image: null }) : null,
      body: deleted ? "" : r.body,
      mentions: deleted ? [] : r.mentions.map((m) => ({ id: m, name: byId.get(m)?.name ?? "someone" })),
      isDecision: r.isDecision && !deleted,
      decisionBy: r.decisionBy ? (byId.get(r.decisionBy)?.name ?? null) : null,
      decisionAt: r.decisionAt,
      editedAt: r.editedAt,
      deleted,
      createdAt: r.createdAt,
      reactions: deleted ? [] : [...grouped.values()],
      attachments: deleted ? [] : files.filter((f) => f.ownerId === r.id).map(({ ownerId: _, ...f }) => f),
    };
  });
}

/** Valid mentions only: members of this org (and, for private spaces, of the channel). */
async function resolveMentions(db: DbT, orgId: string, text: string, ch?: Channel) {
  const ids = extractMentions(text);
  if (!ids.length) return [];
  const rows = await db
    .select({ id: members.id, userId: members.userId, name: members.name })
    .from(members)
    .where(and(eq(members.orgId, orgId), inArray(members.id, ids), eq(members.status, "active")));
  if (ch && ch.kind !== "public") {
    const inside = new Set(
      (await db.select({ id: channelMembers.memberId }).from(channelMembers).where(eq(channelMembers.channelId, ch.id))).map((r) => r.id),
    );
    return rows.filter((r) => inside.has(r.id));
  }
  return rows;
}

async function namesFor(db: DbT, orgId: string, ids: string[]) {
  if (!ids.length) return {};
  const rows = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.orgId, orgId), inArray(members.id, ids)));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

function channelLabel(ch: Channel, dmNames?: string) {
  return ch.kind === "dm" ? (dmNames ?? "Direct message") : `#${ch.name}`;
}

async function publish(c: Ctx, scope: string, type: string, payload: Record<string, unknown>) {
  await c.get("deps").realtime.publish({ channel: `org:${c.get("org").id}:${scope}`, type, payload });
}

/** Ensure the viewer is in every default channel (e.g. #general). */
async function joinDefaults(db: DbT, orgId: string, memberId: string) {
  let defaults = await db.select({ id: channels.id }).from(channels).where(and(eq(channels.orgId, orgId), eq(channels.isDefault, true), isNull(channels.archivedAt)));
  if (!defaults.length) {
    // Every organization starts with #general.
    await db
      .insert(channels)
      .values({ orgId, kind: "public", name: "general", description: "Company-wide updates and chat", isDefault: true })
      .onConflictDoNothing();
    defaults = await db.select({ id: channels.id }).from(channels).where(and(eq(channels.orgId, orgId), eq(channels.isDefault, true)));
  }
  await db
    .insert(channelMembers)
    .values(defaults.map((d) => ({ channelId: d.id, memberId, orgId })))
    .onConflictDoNothing();
}

/* ---------------- Routes ---------------- */

export const collabRoutes = new Hono<AppEnv>()

  .get("/collab/channels", async (c) => {
    if (!hasPermission(c, "channel", "read")) forbid();
    const { db } = c.get("deps");
    const org = c.get("org");
    const me = await viewerMember(c);
    await joinDefaults(db, org.id, me.id);

    const mine = await db
      .select({ channel: channels, lastReadAt: channelMembers.lastReadAt })
      .from(channelMembers)
      .innerJoin(channels, eq(channels.id, channelMembers.channelId))
      .where(and(eq(channelMembers.memberId, me.id), isNull(channels.archivedAt)));
    const myIds = mine.map((m) => m.channel.id);

    const unread = myIds.length
      ? await db
          .select({ channelId: messages.channelId, n: sql<number>`count(*)`.mapWith(Number), mentions: sql<number>`count(*) filter (where ${me.id} = any(${messages.mentions}))`.mapWith(Number) })
          .from(messages)
          .innerJoin(channelMembers, and(eq(channelMembers.channelId, messages.channelId), eq(channelMembers.memberId, me.id)))
          .where(and(inArray(messages.channelId, myIds), gt(messages.createdAt, channelMembers.lastReadAt), isNull(messages.deletedAt), or(isNull(messages.authorId), ne(messages.authorId, me.id))))
          .groupBy(messages.channelId)
      : [];
    const latest = myIds.length
      ? await db
          .select({ channelId: messages.channelId, at: sql<string>`max(${messages.createdAt})` })
          .from(messages)
          .where(inArray(messages.channelId, myIds))
          .groupBy(messages.channelId)
      : [];

    // Direct messages are named after the other people in them.
    const dmIds = mine.filter((m) => m.channel.kind === "dm").map((m) => m.channel.id);
    const dmPeople = dmIds.length
      ? await db
          .select({ channelId: channelMembers.channelId, id: members.id, name: members.name, image: members.image })
          .from(channelMembers)
          .innerJoin(members, eq(members.id, channelMembers.memberId))
          .where(and(inArray(channelMembers.channelId, dmIds), ne(channelMembers.memberId, me.id)))
      : [];

    const browse = await db
      .select({ id: channels.id, name: channels.name, description: channels.description })
      .from(channels)
      .where(
        and(
          eq(channels.orgId, org.id),
          eq(channels.kind, "public"),
          isNull(channels.archivedAt),
          myIds.length ? sql`${channels.id} <> all(${sql.param(myIds)}::uuid[])` : undefined,
        ),
      )
      .orderBy(asc(channels.name));

    return c.json({
      me: me.id,
      channels: mine
        .map((m) => {
          const people = dmPeople.filter((p) => p.channelId === m.channel.id).map(({ channelId: _, ...p }) => p);
          const u = unread.find((x) => x.channelId === m.channel.id);
          return {
            id: m.channel.id,
            kind: m.channel.kind,
            name: m.channel.kind === "dm" ? people.map((p) => p.name).join(", ") || "Just you" : m.channel.name,
            description: m.channel.description,
            isDefault: m.channel.isDefault,
            people,
            unread: u?.n ?? 0,
            mentions: u?.mentions ?? 0,
            lastMessageAt: latest.find((x) => x.channelId === m.channel.id)?.at ?? m.channel.createdAt,
          };
        })
        .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt))),
      browse,
    });
  })

  .post(
    "/collab/channels",
    validate(
      "json",
      z.object({
        name: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9][a-z0-9-_]{0,39}$/, "Use lowercase letters, numbers and dashes"),
        description: z.string().trim().max(300).nullish(),
        kind: z.enum(["public", "private"]).default("public"),
        memberIds: z.array(z.uuid()).max(500).default([]),
      }),
    ),
    async (c) => {
      if (!hasPermission(c, "channel", "create")) forbid();
      const input = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      const me = await viewerMember(c);
      const ids = [...new Set([me.id, ...input.memberIds])];
      const valid = await db.select({ id: members.id }).from(members).where(and(eq(members.orgId, org.id), inArray(members.id, ids)));
      if (valid.length !== ids.length) throw new HTTPException(422, { message: "Unknown member" });
      try {
        const [ch] = await db
          .insert(channels)
          .values({ orgId: org.id, kind: input.kind, name: input.name, description: input.description ?? null, createdBy: me.id })
          .returning();
        await db.insert(channelMembers).values(ids.map((memberId) => ({ channelId: ch!.id, memberId, orgId: org.id })));
        await audit(c, "channel.created", { type: "channel", id: ch!.id }, { name: input.name, kind: input.kind });
        return c.json({ channel: { id: ch!.id } }, 201);
      } catch (err) {
        const code = (err as { cause?: { code?: string }; code?: string }).cause?.code ?? (err as { code?: string }).code;
        if (code === "23505") throw new HTTPException(409, { message: `#${input.name} already exists` });
        throw err;
      }
    },
  )

  .post("/collab/dms", validate("json", z.object({ memberIds: z.array(z.uuid()).min(1).max(8) })), async (c) => {
    if (!hasPermission(c, "channel", "read")) forbid();
    const { db } = c.get("deps");
    const org = c.get("org");
    const me = await viewerMember(c);
    const ids = [...new Set([me.id, ...c.req.valid("json").memberIds])].sort();
    const valid = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.orgId, org.id), inArray(members.id, ids), eq(members.status, "active")));
    if (valid.length !== ids.length) throw new HTTPException(422, { message: "Unknown member" });
    const dmKey = ids.join(",");
    const [existing] = await db.select({ id: channels.id }).from(channels).where(and(eq(channels.orgId, org.id), eq(channels.dmKey, dmKey)));
    if (existing) return c.json({ channel: existing });
    const [ch] = await db.insert(channels).values({ orgId: org.id, kind: "dm", dmKey, createdBy: me.id }).onConflictDoNothing().returning({ id: channels.id });
    const channel = ch ?? (await db.select({ id: channels.id }).from(channels).where(and(eq(channels.orgId, org.id), eq(channels.dmKey, dmKey))))[0]!;
    await db.insert(channelMembers).values(ids.map((memberId) => ({ channelId: channel.id, memberId, orgId: org.id }))).onConflictDoNothing();
    return c.json({ channel }, 201);
  })

  .get("/collab/channels/:id", async (c) => {
    const { db } = c.get("deps");
    const ch = await loadChannel(c, c.req.param("id"));
    const me = await viewerMember(c);
    await assertCanRead(c, ch, me.id);
    const people = await db
      .select({ id: members.id, name: members.name, image: members.image })
      .from(channelMembers)
      .innerJoin(members, eq(members.id, channelMembers.memberId))
      .where(eq(channelMembers.channelId, ch.id))
      .orderBy(asc(members.name));
    const joined = people.some((p) => p.id === me.id);
    return c.json({
      channel: {
        id: ch.id,
        kind: ch.kind,
        name: ch.kind === "dm" ? people.filter((p) => p.id !== me.id).map((p) => p.name).join(", ") || "Just you" : ch.name,
        description: ch.description,
        isDefault: ch.isDefault,
        archived: Boolean(ch.archivedAt),
      },
      members: people,
      joined,
      canManage: ch.kind !== "dm" && (hasPermission(c, "channel", "manage") || ch.createdBy === me.id),
    });
  })

  .patch(
    "/collab/channels/:id",
    validate("json", z.object({ description: z.string().trim().max(300).nullable(), archived: z.boolean(), memberIds: z.array(z.uuid()).max(500) }).partial()),
    async (c) => {
      const input = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      const ch = await loadChannel(c, c.req.param("id"));
      const me = await viewerMember(c);
      if (ch.kind === "dm" || !(hasPermission(c, "channel", "manage") || ch.createdBy === me.id)) forbid();
      if (input.archived && ch.isDefault) throw new HTTPException(409, { message: "The default channel can't be archived" });
      await db
        .update(channels)
        .set({
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
        })
        .where(eq(channels.id, ch.id));
      if (input.memberIds && ch.kind === "private") {
        const ids = [...new Set([...input.memberIds, me.id])];
        const valid = await db.select({ id: members.id }).from(members).where(and(eq(members.orgId, org.id), inArray(members.id, ids)));
        if (valid.length !== ids.length) throw new HTTPException(422, { message: "Unknown member" });
        await db.delete(channelMembers).where(and(eq(channelMembers.channelId, ch.id), sql`${channelMembers.memberId} <> all(${sql.param(ids)}::uuid[])`));
        await db.insert(channelMembers).values(ids.map((memberId) => ({ channelId: ch.id, memberId, orgId: org.id }))).onConflictDoNothing();
      }
      if (input.memberIds) await publish(c, `channel:${ch.id}`, "channel.members", { channelId: ch.id });
      await audit(c, input.archived ? "channel.archived" : "channel.updated", { type: "channel", id: ch.id });
      return c.json({ ok: true });
    },
  )

  .post("/collab/channels/:id/join", async (c) => {
    const { db } = c.get("deps");
    const ch = await loadChannel(c, c.req.param("id"));
    if (ch.kind !== "public" || ch.archivedAt) forbid("You can only join open channels");
    if (!hasPermission(c, "channel", "read")) forbid();
    const me = await viewerMember(c);
    await db.insert(channelMembers).values({ channelId: ch.id, memberId: me.id, orgId: c.get("org").id }).onConflictDoNothing();
    return c.json({ ok: true });
  })

  .post("/collab/channels/:id/leave", async (c) => {
    const { db } = c.get("deps");
    const ch = await loadChannel(c, c.req.param("id"));
    if (ch.isDefault) throw new HTTPException(409, { message: "Everyone stays in the default channel" });
    const me = await viewerMember(c);
    await db.delete(channelMembers).where(and(eq(channelMembers.channelId, ch.id), eq(channelMembers.memberId, me.id)));
    return c.json({ ok: true });
  })

  .post("/collab/channels/:id/read", async (c) => {
    const { db } = c.get("deps");
    const me = await viewerMember(c);
    await db
      .update(channelMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(channelMembers.channelId, c.req.param("id")), eq(channelMembers.memberId, me.id)));
    return c.json({ ok: true });
  })

  .get(
    "/collab/channels/:id/messages",
    validate("query", z.object({ before: z.iso.datetime({ offset: true }).optional() })),
    async (c) => {
      const { before } = c.req.valid("query");
      const { db } = c.get("deps");
      const ch = await loadChannel(c, c.req.param("id"));
      const me = await viewerMember(c);
      await assertCanRead(c, ch, me.id);
      const rows = await db
        .select()
        .from(messages)
        .where(and(eq(messages.channelId, ch.id), before ? lt(messages.createdAt, new Date(before)) : undefined))
        .orderBy(desc(messages.createdAt))
        .limit(PAGE + 1);
      const page = rows.slice(0, PAGE).reverse();
      return c.json({ messages: await hydrateMessages(db, c.get("org").id, me.id, page), hasMore: rows.length > PAGE });
    },
  )

  .post("/collab/channels/:id/messages", validate("json", z.object({ body })), async (c) => {
    const text = c.req.valid("json").body;
    const { db } = c.get("deps");
    const org = c.get("org");
    const ch = await loadChannel(c, c.req.param("id"));
    if (ch.archivedAt) throw new HTTPException(409, { message: "This channel is archived" });
    const me = await viewerMember(c);
    await assertCanRead(c, ch, me.id);
    // Posting in an open channel joins it.
    await db.insert(channelMembers).values({ channelId: ch.id, memberId: me.id, orgId: org.id }).onConflictDoNothing();

    const mentioned = await resolveMentions(db, org.id, text, ch);
    const [msg] = await db
      .insert(messages)
      .values({ orgId: org.id, channelId: ch.id, authorId: me.id, body: text, mentions: mentioned.map((m) => m.id) })
      .returning();
    await db.update(channelMembers).set({ lastReadAt: new Date() }).where(and(eq(channelMembers.channelId, ch.id), eq(channelMembers.memberId, me.id)));

    const names = Object.fromEntries(mentioned.map((m) => [m.id, m.name]));
    const preview = previewText(text, names);
    const link = `/collab/c/${ch.id}`;
    if (ch.kind === "dm") {
      const others = await db
        .select({ userId: members.userId })
        .from(channelMembers)
        .innerJoin(members, eq(members.id, channelMembers.memberId))
        .where(and(eq(channelMembers.channelId, ch.id), ne(channelMembers.memberId, me.id)));
      await notify(c, others.map((o) => o.userId), { type: "message.dm", title: `${me.name} sent you a message`, body: preview, link }, { email: true });
    } else if (mentioned.length) {
      await notify(c, mentioned.map((m) => m.userId), { type: "message.mention", title: `${me.name} mentioned you in ${channelLabel(ch)}`, body: preview, link }, { email: true });
    }
    await publish(c, `channel:${ch.id}`, "message.created", { channelId: ch.id, messageId: msg!.id });
    const [dto] = await hydrateMessages(db, org.id, me.id, [msg!]);
    return c.json({ message: dto }, 201);
  })

  /* ---------------- Threads on records ---------------- */

  .get("/collab/threads/:type/:id", async (c) => {
    const type = c.req.param("type") as SubjectType;
    if (!(type in SUBJECTS)) notFound();
    const id = c.req.param("id");
    await assertSubject(c, type, id);
    const { db } = c.get("deps");
    const me = await viewerMember(c);
    const t = await threadFor(db, c.get("org").id, type, id, false);
    if (!t) return c.json({ messages: [] });
    const rows = await db.select().from(messages).where(eq(messages.threadId, t.id)).orderBy(asc(messages.createdAt)).limit(500);
    return c.json({ messages: await hydrateMessages(db, c.get("org").id, me.id, rows) });
  })

  .post("/collab/threads/:type/:id", validate("json", z.object({ body })), async (c) => {
    const type = c.req.param("type") as SubjectType;
    if (!(type in SUBJECTS)) notFound();
    const subjectId = c.req.param("id");
    await assertSubject(c, type, subjectId);
    const text = c.req.valid("json").body;
    const { db } = c.get("deps");
    const org = c.get("org");
    const me = await viewerMember(c);
    const t = (await threadFor(db, org.id, type, subjectId, true))!;
    const mentioned = await resolveMentions(db, org.id, text);
    const [msg] = await db
      .insert(messages)
      .values({ orgId: org.id, threadId: t.id, authorId: me.id, body: text, mentions: mentioned.map((m) => m.id) })
      .returning();

    // Who hears about it: people mentioned, earlier commenters, and the record's owners.
    let title = "";
    let link = "";
    const followers = new Set<string>();
    if (type === "task") {
      const [task] = await db.select({ title: tasks.title, projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, subjectId));
      title = task!.title;
      link = task!.projectId ? `/work/projects/${task!.projectId}?task=${subjectId}` : `/work?task=${subjectId}`;
      const assignees = await db.select({ id: taskAssignees.employeeId }).from(taskAssignees).where(eq(taskAssignees.taskId, subjectId));
      for (const u of await userIdsForEmployees(db, org.id, assignees.map((a) => a.id))) followers.add(u);
    } else if (type === "project") {
      const [p] = await db.select({ name: projects.name, lead: projects.leadEmployeeId }).from(projects).where(eq(projects.id, subjectId));
      title = p!.name;
      link = `/work/projects/${subjectId}?view=discussion`;
      for (const u of await userIdsForEmployees(db, org.id, [p!.lead])) followers.add(u);
    } else if (type === "invoice") {
      const [inv] = await db.select({ number: invoices.number, createdBy: invoices.createdBy }).from(invoices).where(eq(invoices.id, subjectId));
      title = inv!.number ?? "a draft";
      link = `/finance/invoices/${subjectId}`;
      if (inv!.createdBy && inv!.createdBy !== "system" && inv!.createdBy !== "razorpay") followers.add(inv!.createdBy);
    } else {
      const [cl] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, subjectId));
      title = cl!.name;
      link = `/finance/clients/${subjectId}`;
    }
    const earlier = await db
      .selectDistinct({ userId: members.userId })
      .from(messages)
      .innerJoin(members, eq(members.id, messages.authorId))
      .where(and(eq(messages.threadId, t.id), ne(messages.id, msg!.id)));
    for (const e of earlier) followers.add(e.userId);

    const preview = previewText(text, Object.fromEntries(mentioned.map((m) => [m.id, m.name])));
    const mentionedUsers = new Set(mentioned.map((m) => m.userId));
    await notify(c, [...mentionedUsers], { type: "comment.mention", title: `${me.name} mentioned you on "${title}"`, body: preview, link }, { email: true });
    await notify(c, [...followers].filter((u) => !mentionedUsers.has(u)), { type: "comment.created", title: `${me.name} commented on "${title}"`, body: preview, link });
    await publish(c, `thread:${type}:${subjectId}`, "message.created", { subjectType: type, subjectId, messageId: msg!.id });

    const [dto] = await hydrateMessages(db, org.id, me.id, [msg!]);
    return c.json({ message: dto }, 201);
  })

  /* ---------------- Messages ---------------- */

  .patch("/collab/messages/:id", validate("json", z.object({ body })), async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const me = await viewerMember(c);
    const [msg] = await db.select().from(messages).where(and(eq(messages.orgId, org.id), eq(messages.id, c.req.param("id"))));
    if (!msg || msg.deletedAt) notFound("Message not found");
    if (msg.authorId !== me.id) forbid("You can only edit your own messages");
    const text = c.req.valid("json").body;
    const ch = msg.channelId ? await loadChannel(c, msg.channelId) : undefined;
    const mentioned = await resolveMentions(db, org.id, text, ch);
    await db.update(messages).set({ body: text, mentions: mentioned.map((m) => m.id), editedAt: new Date() }).where(eq(messages.id, msg.id));
    // Newly mentioned people hear about it; already-mentioned ones don't get a second ping.
    const added = mentioned.filter((m) => !msg.mentions.includes(m.id));
    if (added.length) {
      await notify(c, added.map((m) => m.userId), { type: "message.mention", title: `${me.name} mentioned you`, body: previewText(text, Object.fromEntries(mentioned.map((m) => [m.id, m.name]))), link: ch ? `/collab/c/${ch.id}` : undefined });
    }
    await publishMessageChange(c, msg, "message.updated");
    return c.json({ ok: true });
  })

  .delete("/collab/messages/:id", async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const me = await viewerMember(c);
    const [msg] = await db.select().from(messages).where(and(eq(messages.orgId, org.id), eq(messages.id, c.req.param("id"))));
    if (!msg || msg.deletedAt) notFound("Message not found");
    if (msg.authorId !== me.id && !hasPermission(c, "channel", "manage")) forbid("You can only delete your own messages");
    await db.update(messages).set({ deletedAt: new Date(), isDecision: false }).where(eq(messages.id, msg.id));
    if (msg.authorId !== me.id) await audit(c, "message.deleted", { type: "message", id: msg.id });
    await publishMessageChange(c, msg, "message.deleted");
    return c.json({ ok: true });
  })

  .post("/collab/messages/:id/reactions", validate("json", z.object({ emoji: z.enum(QUICK_REACTIONS) })), async (c) => {
    const { emoji } = c.req.valid("json");
    const { db } = c.get("deps");
    const org = c.get("org");
    const me = await viewerMember(c);
    const msg = await readableMessage(c, c.req.param("id"), me.id);
    const removed = await db
      .delete(messageReactions)
      .where(and(eq(messageReactions.messageId, msg.id), eq(messageReactions.memberId, me.id), eq(messageReactions.emoji, emoji)))
      .returning({ emoji: messageReactions.emoji });
    if (!removed.length) await db.insert(messageReactions).values({ messageId: msg.id, memberId: me.id, emoji, orgId: org.id });
    await publishMessageChange(c, msg, "message.updated");
    return c.json({ reacted: !removed.length });
  })

  .post("/collab/messages/:id/decision", validate("json", z.object({ isDecision: z.boolean() })), async (c) => {
    const { isDecision } = c.req.valid("json");
    const { db } = c.get("deps");
    const me = await viewerMember(c);
    const msg = await readableMessage(c, c.req.param("id"), me.id);
    await db
      .update(messages)
      .set(isDecision ? { isDecision: true, decisionBy: me.id, decisionAt: new Date() } : { isDecision: false, decisionBy: null, decisionAt: null })
      .where(eq(messages.id, msg.id));
    await audit(c, isDecision ? "decision.marked" : "decision.unmarked", { type: "message", id: msg.id });
    await publishMessageChange(c, msg, "message.updated");
    return c.json({ ok: true });
  })

  /* ---------------- Cross-cutting views ---------------- */

  .get("/collab/decisions", async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const me = await viewerMember(c);
    const rows = await db
      .select({ message: messages })
      .from(messages)
      .leftJoin(channels, eq(channels.id, messages.channelId))
      .where(
        and(
          eq(messages.orgId, org.id),
          eq(messages.isDecision, true),
          isNull(messages.deletedAt),
          // Decisions from threads, public channels, and spaces the viewer belongs to.
          or(
            isNull(messages.channelId),
            eq(channels.kind, "public"),
            sql`exists (select 1 from channel_members cm where cm.channel_id = ${messages.channelId} and cm.member_id = ${me.id})`,
          ),
        ),
      )
      .orderBy(desc(messages.decisionAt))
      .limit(100);
    return c.json({ decisions: await withContext(db, org.id, me.id, rows.map((r) => r.message)) });
  })

  .get("/collab/mentions", async (c) => {
    const { db } = c.get("deps");
    const org = c.get("org");
    const me = await viewerMember(c);
    const rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.orgId, org.id), sql`${me.id} = any(${messages.mentions})`, isNull(messages.deletedAt)))
      .orderBy(desc(messages.createdAt))
      .limit(100);
    return c.json({ mentions: await withContext(db, org.id, me.id, rows) });
  });

/** Messages plus where they were posted (channel name or the record a thread hangs off). */
async function withContext(db: DbT, orgId: string, meId: string, rows: (typeof messages.$inferSelect)[]) {
  const dtos = await hydrateMessages(db, orgId, meId, rows);
  const channelIds = [...new Set(rows.map((r) => r.channelId).filter(Boolean))] as string[];
  const threadIds = [...new Set(rows.map((r) => r.threadId).filter(Boolean))] as string[];
  const chs = channelIds.length ? await db.select().from(channels).where(inArray(channels.id, channelIds)) : [];
  const ths = threadIds.length ? await db.select().from(threads).where(inArray(threads.id, threadIds)) : [];
  const taskIds = ths.filter((t) => t.subjectType === "task").map((t) => t.subjectId);
  const projectIds = ths.filter((t) => t.subjectType === "project").map((t) => t.subjectId);
  const taskRows = taskIds.length ? await db.select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId }).from(tasks).where(inArray(tasks.id, taskIds)) : [];
  const projectRows = projectIds.length ? await db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, projectIds)) : [];
  const dmNames: Record<string, string> = {};
  for (const ch of chs.filter((x) => x.kind === "dm")) {
    const ids = (ch.dmKey ?? "").split(",").filter((id) => id && id !== meId);
    dmNames[ch.id] = Object.values(await namesFor(db, orgId, ids)).join(", ");
  }
  return dtos.map((d) => {
    if (d.channelId) {
      const ch = chs.find((x) => x.id === d.channelId)!;
      return { ...d, context: { kind: "channel" as const, label: channelLabel(ch, dmNames[ch.id]), link: `/collab/c/${ch.id}` } };
    }
    const t = ths.find((x) => x.id === d.threadId)!;
    if (t.subjectType === "task") {
      const task = taskRows.find((x) => x.id === t.subjectId);
      return { ...d, context: { kind: "task" as const, label: task?.title ?? "A task", link: task?.projectId ? `/work/projects/${task.projectId}?task=${t.subjectId}` : `/work?task=${t.subjectId}` } };
    }
    const p = projectRows.find((x) => x.id === t.subjectId);
    return { ...d, context: { kind: "project" as const, label: p?.name ?? "A project", link: `/work/projects/${t.subjectId}?view=discussion` } };
  });
}

/** A message the viewer may see (for reactions, decisions and attachments). */
export async function readableMessage(c: Ctx, id: string, memberId: string) {
  const { db } = c.get("deps");
  const [msg] = await db.select().from(messages).where(and(eq(messages.orgId, c.get("org").id), eq(messages.id, id)));
  if (!msg || msg.deletedAt) notFound("Message not found");
  if (msg.channelId) await assertCanRead(c, await loadChannel(c, msg.channelId), memberId);
  else {
    const [t] = await db.select().from(threads).where(eq(threads.id, msg.threadId!));
    await assertSubject(c, t!.subjectType as SubjectType, t!.subjectId);
  }
  return msg;
}

async function publishMessageChange(c: Ctx, msg: typeof messages.$inferSelect, type: string) {
  if (msg.channelId) return publish(c, `channel:${msg.channelId}`, type, { channelId: msg.channelId, messageId: msg.id });
  const [t] = await c.get("deps").db.select().from(threads).where(eq(threads.id, msg.threadId!));
  if (t) await publish(c, `thread:${t.subjectType}:${t.subjectId}`, type, { subjectType: t.subjectType, subjectId: t.subjectId, messageId: msg.id });
}
