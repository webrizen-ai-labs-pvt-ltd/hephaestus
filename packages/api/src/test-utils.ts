import type { EmailDomains, Mailer, MailMessage, PermissionSet, SmtpConfig, Viewer } from "@operant/core";
import { connectPglite, type Db, migrationsFolder } from "@operant/db";
import type { DirectoryInviter } from "./context.ts";
import { consoleMailer, createApi, noopRealtime } from "./index.ts";
import { createSecretBox } from "./secrets.ts";

export function viewer(userId: string, orgId: string, roles: string[], permissions: PermissionSet, email = `${userId}@${orgId}.test`): Viewer {
  return {
    userId,
    email,
    name: userId[0]!.toUpperCase() + userId.slice(1),
    image: null,
    org: { id: orgId, name: orgId, slug: orgId, logo: null, roles, permissions },
  };
}

/** The real API on an in-memory Postgres; pick the viewer per request by name. */
export async function createTestApi(
  viewers: Record<string, Viewer>,
  opts: { mailer?: Mailer; directory?: DirectoryInviter; emailDomains?: EmailDomains; smtp?: (c: SmtpConfig) => Mailer } = {},
) {
  const conn = await connectPglite(undefined, migrationsFolder);
  const app = createApi({
    edition: "cloud",
    db: conn.db,
    files: {
      put: async (key, body, contentType) => ({ key, size: body.byteLength, contentType }),
      getUrl: async (k) => `/f/${k}`,
      delete: async () => {},
    },
    realtime: noopRealtime,
    mailer: opts.mailer ?? consoleMailer,
    directory: opts.directory,
    emailDomains: opts.emailDomains,
    smtp: opts.smtp,
    secrets: createSecretBox("test-secret"),
    appUrl: "http://localhost:5173",
    resolveViewer: async (req) => viewers[req.headers.get("x-test-viewer") ?? ""] ?? null,
  });

  async function call<T = unknown>(who: string | null, path: string, body?: unknown, method?: string) {
    const res = await app.request(path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { ...(who ? { "x-test-viewer": who } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as T;
    return { status: res.status, json };
  }

  return { app, db: conn.db as Db, call, close: conn.close };
}

/** A mailer that keeps what it sends, for tests that read emailed codes and links. */
export function captureMailer() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = { enabled: true, from: "test@example.com", send: async (m) => void sent.push(m) };
  return { mailer, sent };
}
