import { auditEvents } from "@operant/db";
import type { Context } from "hono";
import type { AppEnv } from "./context.ts";

export async function audit(
  c: Context<AppEnv>,
  action: string,
  target?: { type: string; id: string },
  metadata: Record<string, unknown> = {},
) {
  const { db } = c.get("deps");
  await db.insert(auditEvents).values({
    orgId: c.get("org").id,
    actorId: c.get("viewer")?.userId ?? null,
    action,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    metadata,
    ip: c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  });
}
