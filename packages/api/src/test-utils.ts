import type { PermissionSet, Viewer } from "@hephaestus/core";
import { connectPglite, type Db, migrationsFolder } from "@hephaestus/db";
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
export async function createTestApi(viewers: Record<string, Viewer>) {
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
    mailer: consoleMailer,
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
