import type { RealtimeEvent } from "@hephaestus/core";
import { channelMembers, channels } from "@hephaestus/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../context.ts";
import { notFound, viewerMember } from "../helpers.ts";

/**
 * Live events over Server-Sent Events, for editions with an in-process event
 * bus (local development, the offline edition). Each connection only receives
 * its own org's events, its own notifications, and channels it can read.
 */
export const eventRoutes = new Hono<AppEnv>().get("/events", async (c) => {
  const { realtime, db } = c.get("deps");
  if (!realtime.subscribe) notFound("Live events are delivered another way in this edition");
  const org = c.get("org");
  const me = await viewerMember(c);
  const userId = c.get("viewer")!.userId;
  const prefix = `org:${org.id}:`;
  const channelAccess = new Map<string, boolean>();

  const allowed = async (e: RealtimeEvent) => {
    if (!e.channel.startsWith(prefix)) return false;
    const scope = e.channel.slice(prefix.length);
    if (scope.startsWith("user:")) return scope === `user:${userId}`;
    if (scope.startsWith("channel:")) {
      const id = scope.slice("channel:".length);
      if (!channelAccess.has(id)) {
        const [ch] = await db.select({ kind: channels.kind }).from(channels).where(and(eq(channels.id, id), eq(channels.orgId, org.id)));
        const member = ch && ch.kind !== "public"
          ? (await db.select({ m: channelMembers.memberId }).from(channelMembers).where(and(eq(channelMembers.channelId, id), eq(channelMembers.memberId, me.id)))).length > 0
          : true;
        channelAccess.set(id, Boolean(ch) && member);
      }
      return channelAccess.get(id)!;
    }
    return true;
  };

  return streamSSE(c, async (stream) => {
    const queue: RealtimeEvent[] = [];
    let wake: (() => void) | null = null;
    const unsubscribe = realtime.subscribe!((e) => {
      queue.push(e);
      wake?.();
    });
    stream.onAbort(() => {
      unsubscribe();
      wake?.();
    });
    await stream.writeSSE({ event: "ready", data: "{}" });

    let lastPing = Date.now();
    while (!stream.aborted) {
      if (!queue.length) {
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, 25_000);
        });
        wake = null;
      }
      while (queue.length) {
        const e = queue.shift()!;
        if (await allowed(e)) {
          // Membership can change at any time; re-check private channels on their next event.
          if (e.type === "channel.members") channelAccess.clear();
          await stream.writeSSE({ event: "message", data: JSON.stringify({ scope: e.channel.slice(prefix.length), type: e.type, payload: e.payload }) });
        }
      }
      if (Date.now() - lastPing > 20_000) {
        await stream.writeSSE({ event: "ping", data: "{}" });
        lastPing = Date.now();
      }
    }
    unsubscribe();
  });
});
