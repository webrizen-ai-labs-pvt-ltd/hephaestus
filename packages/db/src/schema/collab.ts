import { sql } from "drizzle-orm";
import { boolean, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "@operant/core";
import { members, orgs } from "./foundation.ts";

const id = () => uuid("id").primaryKey().$defaultFn(uuidv7);
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/*
 * Chat participants are sign-in accounts (`members`), not employees: only
 * people who can log in can read and write messages.
 */

export const CHANNEL_KINDS = ["public", "private", "dm"] as const;

export const channels = pgTable(
  "channels",
  {
    id: id(),
    orgId: orgId(),
    kind: text("kind", { enum: CHANNEL_KINDS }).notNull(),
    /** Null for direct messages (named after the people in them). */
    name: text("name"),
    description: text("description"),
    /** Sorted member ids, so each group of people has exactly one DM. */
    dmKey: text("dm_key"),
    /** Everyone joins default channels automatically (e.g. #general). */
    isDefault: boolean("is_default").notNull().default(false),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("channels_org_idx").on(t.orgId),
    uniqueIndex("channels_org_name_key").on(t.orgId, sql`lower(${t.name})`).where(sql`${t.name} is not null`),
    uniqueIndex("channels_org_dm_key").on(t.orgId, t.dmKey).where(sql`${t.dmKey} is not null`),
  ],
).enableRLS();

export const channelMembers = pgTable(
  "channel_members",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    orgId: orgId(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.memberId] }), index("channel_members_member_idx").on(t.memberId)],
).enableRLS();

/** Comment threads attached to records in other pillars (a task, a project, …). */
export const threads = pgTable(
  "threads",
  {
    id: id(),
    orgId: orgId(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("threads_subject_key").on(t.orgId, t.subjectType, t.subjectId)],
).enableRLS();

export const messages = pgTable(
  "messages",
  {
    id: id(),
    orgId: orgId(),
    /** Exactly one of channelId / threadId is set. */
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => threads.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => members.id, { onDelete: "set null" }),
    /** Plain text; mentions are stored as @[member:<uuid>] tokens. */
    body: text("body").notNull(),
    mentions: uuid("mentions").array().notNull().default(sql`'{}'::uuid[]`),
    isDecision: boolean("is_decision").notNull().default(false),
    decisionBy: uuid("decision_by").references(() => members.id, { onDelete: "set null" }),
    decisionAt: timestamp("decision_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_channel_idx").on(t.channelId, t.createdAt),
    index("messages_thread_idx").on(t.threadId, t.createdAt),
    index("messages_decision_idx").on(t.orgId, t.isDecision),
    index("messages_mentions_idx").using("gin", t.mentions),
  ],
).enableRLS();

export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    orgId: orgId(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.memberId, t.emoji] })],
).enableRLS();
