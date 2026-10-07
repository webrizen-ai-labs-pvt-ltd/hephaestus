import { type Action, can, type Resource } from "@operant/core";
import { members, orgs } from "@operant/db";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./context.ts";
import { syncViewer } from "./sync.ts";

/**
 * Requires a signed-in viewer with an organization and resolves our org row.
 * Creates the org/membership on first sight, and blocks members that the
 * identity provider has removed (webhook) even if their session is still valid.
 */
export const requireOrg = createMiddleware<AppEnv>(async (c, next) => {
  const viewer = c.get("viewer");
  if (!viewer) throw new HTTPException(401, { message: "Sign in required" });
  if (!viewer.org) throw new HTTPException(403, { message: "No organization selected" });

  const { db } = c.get("deps");
  const [row] = await db
    .select({ id: orgs.id, name: orgs.name, slug: orgs.slug, status: members.status })
    .from(orgs)
    .leftJoin(members, and(eq(members.orgId, orgs.id), eq(members.userId, viewer.userId)))
    .where(eq(orgs.externalId, viewer.org.id))
    .limit(1);

  if (row?.status === "removed") throw new HTTPException(403, { message: "You no longer have access to this organization" });

  const org = row?.status === "active" ? { id: row.id, name: row.name, slug: row.slug } : await syncViewer(db, viewer);
  if (!org) throw new HTTPException(403, { message: "No organization selected" });
  c.set("org", org);
  await next();
});

export function requirePermission<R extends Resource>(resource: R, action: Action<R>) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const perms = c.get("viewer")?.org?.permissions ?? {};
    if (!can(perms, resource, action)) {
      throw new HTTPException(403, { message: `Missing permission ${resource}:${action}` });
    }
    await next();
  });
}
