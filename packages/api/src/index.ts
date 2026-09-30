import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ApiDeps, AppEnv } from "./context.ts";
import { requireOrg } from "./middleware.ts";
import { coreRoutes } from "./routes/core.ts";
import { fileRoutes } from "./routes/files.ts";
import { employeeRoutes } from "./routes/people/employees.ts";
import { leaveRoutes } from "./routes/people/leave.ts";
import { onboardingRoutes } from "./routes/people/onboarding.ts";
import { structureRoutes } from "./routes/people/structure.ts";

/** People pillar: every route needs a signed-in member of an organization. */
const people = new Hono<AppEnv>()
  .use(requireOrg)
  .route("/", employeeRoutes)
  .route("/", structureRoutes)
  .route("/", leaveRoutes)
  .route("/", onboardingRoutes);

export type { ActiveOrg, ApiDeps, AppEnv } from "./context.ts";
export { audit } from "./audit.ts";
export { requireOrg, requirePermission } from "./middleware.ts";
export { findOrg, type MemberSnapshot, reconcileMembers, syncViewer } from "./sync.ts";
export { validate } from "./validate.ts";
export { LocalFileStore, localFileRoutes } from "./adapters/local-files.ts";
export { consoleMailer, noopRealtime } from "./adapters/noop.ts";

/**
 * The edition-agnostic API, mounted at /api/v1. Each edition wraps it with its
 * own auth routes and adapters.
 */
export function createApi(deps: ApiDeps) {
  const app = new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set("deps", deps);
      c.set("viewer", await deps.resolveViewer(c.req.raw));
      await next();
    })
    .get("/health", (c) => c.json({ ok: true, edition: deps.edition }))
    .route("/", coreRoutes)
    .route("/", fileRoutes)
    .route("/", people);

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.res ?? c.json({ error: err.message }, err.status);
    }
    console.error(err);
    return c.json({ error: "Something went wrong" }, 500);
  });

  return app;
}

export type ApiApp = ReturnType<typeof createApi>;
