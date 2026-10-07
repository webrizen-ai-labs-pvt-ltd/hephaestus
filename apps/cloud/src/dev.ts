import { serve } from "@hono/node-server";
import { createCloudApp } from "./app.ts";
import { loadEnv } from "./env.ts";

const env = loadEnv({
  // A throwaway secret keeps first-run local development zero-config.
  SESSION_SECRET: "local-development-only-secret-change-me-please",
  DEV_AUTH: "true",
  ...process.env,
});

const app = await createCloudApp(env);
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, () => {
  console.info(`Operant cloud API on http://localhost:${port}`);
  console.info(env.ssoConfigured ? "Sign-in: Webrizen SSO" : "Sign-in: local demo account (SSO not configured)");
});
