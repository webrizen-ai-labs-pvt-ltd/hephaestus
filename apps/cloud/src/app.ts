import path from "node:path";
import {
  consoleMailer,
  createApi,
  createSecretBox,
  findOrg,
  LocalFileStore,
  localFileRoutes,
  MemoryRealtime,
  reconcileMembers,
  runFinanceJobs,
  type ApiDeps,
  syncViewer,
} from "@operant/api";
import { allPermissions, type FileStore, type Realtime, type Viewer } from "@operant/core";
import { connectPglite, connectPostgres, type Db, members, migrationsFolder, webhookReceipts } from "@operant/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import * as client from "openid-client";
import { Webhook } from "standardwebhooks";
import { z } from "zod";
import { directoryMember, directoryOrg, listAllMembers, toSnapshot } from "./directory.ts";
import type { Env } from "./env.ts";
import { getConfig, identityFromTokens, refreshSession, SCOPES, safeReturnTo, tokensToSession } from "./oidc.ts";
import {
  clearSession,
  deriveKey,
  readSession,
  type SessionData,
  takeTx,
  writeSession,
  writeTx,
} from "./session.ts";
import { ResendMailer } from "./mail.ts";
import { mintSupabaseToken, SupabaseFileStore, SupabaseRealtime } from "./supabase.ts";

interface LoginTx {
  state: string;
  verifier: string;
  returnTo: string;
}

function toViewer(s: SessionData): Viewer {
  return { userId: s.user.id, email: s.user.email, name: s.user.name, image: s.user.image, org: s.org };
}

async function connectDb(env: Env): Promise<Db> {
  if (env.DATABASE_URL) {
    // Migrations run from CI/CLI in production, never on a cold start.
    return (await connectPostgres(env.DATABASE_URL, { migrate: !env.isProd, migrationsFolder })).db;
  }
  console.info(`Using embedded Postgres (PGlite) at ${env.PGLITE_DIR}`);
  return (await connectPglite(env.PGLITE_DIR, migrationsFolder)).db;
}

export async function createCloudApp(env: Env) {
  const key = await deriveKey(env.SESSION_SECRET);
  const secure = env.APP_URL.startsWith("https://");
  const db = await connectDb(env);

  let files: FileStore;
  let localFiles: LocalFileStore | null = null;
  if (env.SUPABASE_URL && env.SUPABASE_SECRET_KEY) {
    files = new SupabaseFileStore(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, env.SUPABASE_STORAGE_BUCKET);
  } else {
    localFiles = new LocalFileStore(path.resolve(env.LOCAL_FILES_DIR), env.SESSION_SECRET, "/api/local-files");
    files = localFiles;
  }
  const realtime: Realtime =
    env.SUPABASE_URL && env.SUPABASE_SECRET_KEY ? new SupabaseRealtime(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY) : new MemoryRealtime();

  /*
   * Viewer resolution runs once per request in the middleware below (which may
   * refresh tokens and rewrite the cookie); the API reads the result from here.
   */
  const viewers = new WeakMap<Request, Viewer | null>();

  const apiDeps: ApiDeps = {
    edition: "cloud",
    db,
    files,
    realtime,
    secrets: createSecretBox(env.ENCRYPTION_KEY ?? env.SESSION_SECRET),
    appUrl: env.APP_URL,
    portalUrl: env.PORTAL_URL,
    mailer: env.RESEND_API_KEY ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM) : consoleMailer,
    resolveViewer: async (req) => viewers.get(req) ?? null,
  };
  const api = createApi(apiDeps);

  const app = new Hono();

  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", ...(env.SUPABASE_URL ? [env.SUPABASE_URL, env.SUPABASE_URL.replace(/^http/, "ws")] : [])],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", new URL(env.WEBRIZEN_SSO_ISSUER).origin],
      },
      referrerPolicy: "strict-origin-when-cross-origin",
      strictTransportSecurity: secure ? "max-age=63072000; includeSubDomains" : false,
    }),
  );

  // Rejects cross-site form/multipart posts (JSON requests are covered by CORS).
  // The client portal is its own site and uploads files too.
  app.use(csrf({ origin: [env.APP_URL, env.PORTAL_URL] }));

  // Resolve (and silently refresh) the session for every request.
  app.use(async (c, next) => {
    let session = await readSession(c, key);
    if (session && session.accessToken && session.expiresAt - 60 < Date.now() / 1000) {
      const renewed = await refreshSession(env, session);
      if (renewed) {
        session = renewed;
        await writeSession(c, renewed, key, secure);
        await syncViewer(db, toViewer(renewed));
      } else {
        session = null;
        clearSession(c);
      }
    }
    viewers.set(c.req.raw, session ? toViewer(session) : null);
    await next();
  });

  /* ---------------- Auth ---------------- */

  app.get("/auth/config", (c) => c.json({ sso: env.ssoConfigured, devAuth: env.devAuth }));

  app.get("/auth/login", async (c) => {
    const returnTo = safeReturnTo(c.req.query("returnTo"));
    if (!env.ssoConfigured) {
      return env.devAuth ? c.redirect(`/auth/dev-login?returnTo=${encodeURIComponent(returnTo)}`) : c.text("SSO not configured", 503);
    }
    const config = await getConfig(env);
    const verifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    await writeTx(c, { state, verifier, returnTo } satisfies LoginTx, key, secure);

    const params: Record<string, string> = {
      redirect_uri: `${env.APP_URL}/auth/callback`,
      scope: SCOPES,
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      state,
    };
    const prompt = c.req.query("prompt");
    // Webrizen SSO supports "login" and "create". Its org picker appears on every sign-in for multi-org users.
    if (prompt === "login" || prompt === "create") params.prompt = prompt;
    return c.redirect(client.buildAuthorizationUrl(config, params).href);
  });

  app.get("/auth/callback", async (c) => {
    const tx = await takeTx<LoginTx>(c, key);
    if (!tx) return c.redirect("/?error=login_expired");
    try {
      const config = await getConfig(env);
      const currentUrl = new URL(c.req.url);
      const callbackUrl = new URL(`${env.APP_URL}/auth/callback${currentUrl.search}`);
      const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: tx.verifier,
        expectedState: tx.state,
      });
      const session = tokensToSession(tokens, await identityFromTokens(config, tokens, ""));
      await writeSession(c, session, key, secure);
      const org = await syncViewer(db, toViewer(session));
      // Best effort: bring the people directory up to date (the nightly job covers misses).
      if (org && session.org) void syncOrgMembers(env, db, org.id, session.org.id);
      return c.redirect(tx.returnTo);
    } catch (err) {
      console.error("Login callback failed", err);
      return c.redirect("/?error=login_failed");
    }
  });

  app.post("/auth/logout", async (c) => {
    const session = await readSession(c, key);
    clearSession(c);
    if (env.ssoConfigured && session?.idToken) {
      const config = await getConfig(env);
      const url = client.buildEndSessionUrl(config, {
        id_token_hint: session.idToken,
        post_logout_redirect_uri: `${env.APP_URL}/signed-out`,
      });
      return c.json({ redirect: url.href });
    }
    return c.json({ redirect: "/signed-out" });
  });

  if (env.devAuth) {
    app.get("/auth/dev-login", async (c) => {
      const session: SessionData = {
        user: { id: "dev-owner", email: "owner@demo.local", name: "Demo Owner", image: null },
        org: {
          id: "dev-org",
          name: "Webrizen Demo Co.",
          slug: "webrizen-demo",
          logo: null,
          roles: ["owner"],
          permissions: allPermissions(),
        },
        expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      };
      await writeSession(c, session, key, secure);
      await syncViewer(db, toViewer(session));
      return c.redirect(safeReturnTo(c.req.query("returnTo")));
    });
  }

  /* ---------------- Supabase token bridge ---------------- */

  app.get("/api/supabase-token", async (c) => {
    const viewer = viewers.get(c.req.raw);
    if (!viewer?.org) return c.json({ error: "Sign in required" }, 401);
    if (!env.SUPABASE_JWT_SECRET || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return c.json({ enabled: false });
    const org = await findOrg(db, viewer.org.id);
    if (!org) return c.json({ error: "Unknown organization" }, 403);
    const { token, expiresIn } = await mintSupabaseToken(env, viewer.userId, org.id);
    c.header("cache-control", "no-store");
    return c.json({ enabled: true, url: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY, token, expiresIn, orgId: org.id });
  });

  /* ---------------- Webrizen SSO webhooks ---------------- */

  const webhookEvent = z.object({
    type: z.string(),
    data: z.object({
      organization: directoryOrg,
      member: directoryMember.partial({ roles: true }).optional(),
    }),
  });

  app.post("/webhooks/webrizen", async (c) => {
    if (!env.WEBRIZEN_WEBHOOK_SECRET) return c.text("Webhooks not configured", 503);
    const body = await c.req.text();
    let event: z.infer<typeof webhookEvent>;
    try {
      const verified = new Webhook(env.WEBRIZEN_WEBHOOK_SECRET).verify(body, {
        "webhook-id": c.req.header("webhook-id") ?? "",
        "webhook-timestamp": c.req.header("webhook-timestamp") ?? "",
        "webhook-signature": c.req.header("webhook-signature") ?? "",
      });
      event = webhookEvent.parse(verified);
    } catch {
      return c.text("Invalid signature", 401);
    }

    const messageId = c.req.header("webhook-id")!;
    const inserted = await db
      .insert(webhookReceipts)
      .values({ id: messageId, source: "webrizen", type: event.type })
      .onConflictDoNothing()
      .returning({ id: webhookReceipts.id });
    if (inserted.length === 0) return c.body(null, 204); // duplicate delivery

    const org = await findOrg(db, event.data.organization.id);
    if (!org) return c.body(null, 204); // an org that hasn't used Operant yet

    const member = event.data.member;
    switch (event.type) {
      case "member.added":
      case "member.updated":
        if (member) await reconcileOne(db, org.id, toSnapshot({ ...member, roles: member.roles ?? [] }));
        break;
      case "member.removed":
        if (member) {
          await db
            .update(members)
            .set({ status: "removed", updatedAt: new Date() })
            .where(and(eq(members.orgId, org.id), eq(members.userId, member.user_id)));
        }
        break;
      case "role.updated":
      case "role.deleted":
        // One event for many members: re-sync the whole org in the background.
        queueMicrotask(() => void syncOrgMembers(env, db, org.id, event.data.organization.id));
        break;
    }
    return c.body(null, 204);
  });

  /* ---------------- Scheduled jobs ---------------- */

  app.post("/api/cron/sync-members", async (c) => {
    if (!env.CRON_SECRET || c.req.header("authorization") !== `Bearer ${env.CRON_SECRET}`) return c.text("Forbidden", 403);
    if (!env.ssoConfigured) return c.json({ skipped: true });
    const rows = await db.query.orgs.findMany({ columns: { id: true, externalId: true } });
    let synced = 0;
    for (const o of rows) {
      if (!o.externalId) continue;
      await syncOrgMembers(env, db, o.id, o.externalId);
      synced++;
    }
    return c.json({ synced });
  });

  app.post("/api/cron/finance", async (c) => {
    if (!env.CRON_SECRET || c.req.header("authorization") !== `Bearer ${env.CRON_SECRET}`) return c.text("Forbidden", 403);
    return c.json(await runFinanceJobs(apiDeps));
  });

  /* ---------------- API ---------------- */

  if (localFiles) app.route("/api/local-files", localFileRoutes(localFiles));
  app.route("/api/v1", api);

  return app;
}

async function reconcileOne(db: Db, orgId: string, m: ReturnType<typeof toSnapshot>) {
  await db
    .insert(members)
    .values({ orgId, ...m })
    .onConflictDoUpdate({
      target: [members.orgId, members.userId],
      set: { email: m.email, name: m.name, image: m.image, roles: m.roles, status: "active", updatedAt: new Date() },
    });
}

async function syncOrgMembers(env: Env, db: Db, orgId: string, externalOrgId: string) {
  try {
    const { members: snapshot } = await listAllMembers(env, externalOrgId);
    await reconcileMembers(db, orgId, snapshot);
  } catch (err) {
    console.error(`Member sync failed for org ${orgId}`, err);
  }
}
