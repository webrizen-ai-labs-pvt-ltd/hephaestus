import { allPermissions, ROLE_PRESETS, type Viewer } from "@hephaestus/core";
import { connectPglite, type Db, members, migrationsFolder } from "@hephaestus/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consoleMailer, createApi, noopRealtime } from "./index.ts";

/*
 * Runs the real API against an in-memory Postgres (PGlite). Viewers are chosen
 * per request with an `x-test-viewer` header.
 */

const viewers: Record<string, Viewer> = {
  aliceOwner: {
    userId: "alice",
    email: "alice@acme.test",
    name: "Alice",
    image: null,
    org: { id: "sso-acme", name: "Acme", slug: "acme", logo: null, roles: ["owner"], permissions: allPermissions() },
  },
  bobMember: {
    userId: "bob",
    email: "bob@acme.test",
    name: "Bob",
    image: null,
    org: { id: "sso-acme", name: "Acme", slug: "acme", logo: null, roles: ["member"], permissions: ROLE_PRESETS.member! },
  },
  carolOther: {
    userId: "carol",
    email: "carol@globex.test",
    name: "Carol",
    image: null,
    org: { id: "sso-globex", name: "Globex", slug: "globex", logo: null, roles: ["owner"], permissions: allPermissions() },
  },
  noOrg: { userId: "dave", email: "dave@x.test", name: "Dave", image: null, org: null },
};

let close: () => Promise<void>;
let db: Db;
let app: ReturnType<typeof createApi>;

const call = (who: keyof typeof viewers | null, path: string, init: RequestInit = {}) =>
  app.request(path, { ...init, headers: { ...(who ? { "x-test-viewer": who } : {}), ...(init.headers ?? {}) } });

beforeAll(async () => {
  const conn = await connectPglite(undefined, migrationsFolder);
  close = conn.close;
  db = conn.db;
  app = createApi({
    edition: "cloud",
    db: conn.db,
    files: { put: async (key, body, contentType) => ({ key, size: body.byteLength, contentType }), getUrl: async (k) => `/f/${k}`, delete: async () => {} },
    realtime: noopRealtime,
    mailer: consoleMailer,
    resolveViewer: async (req) => viewers[req.headers.get("x-test-viewer") ?? ""] ?? null,
  });
  // Each viewer's first request creates their org and membership.
  for (const v of ["aliceOwner", "bobMember", "carolOther"] as const) await call(v, "/me");
}, 60_000);

afterAll(async () => close?.());

describe("auth", () => {
  it("rejects anonymous requests", async () => {
    expect((await call(null, "/me")).status).toBe(401);
  });

  it("rejects users without an organization", async () => {
    expect((await call("noOrg", "/me")).status).toBe(403);
  });
});

describe("tenant isolation", () => {
  it("lists only members of the viewer's own organization", async () => {
    const acme = (await (await call("aliceOwner", "/members")).json()) as { members: { userId: string }[] };
    const globex = (await (await call("carolOther", "/members")).json()) as { members: { userId: string }[] };
    expect(acme.members.map((m) => m.userId).sort()).toEqual(["alice", "bob"]);
    expect(globex.members.map((m) => m.userId)).toEqual(["carol"]);
  });

  it("keeps settings changes inside one organization", async () => {
    const res = await call("aliceOwner", "/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terms: { project: { one: "Case", many: "Cases" } } }),
    });
    expect(res.status).toBe(200);
    const acme = (await (await call("bobMember", "/me")).json()) as { settings: { terms: { project: { one: string } } } };
    const globex = (await (await call("carolOther", "/me")).json()) as { settings: { terms: { project: { one: string } } } };
    expect(acme.settings.terms.project.one).toBe("Case");
    expect(globex.settings.terms.project.one).toBe("Project");
  });

  it("hides other organizations' audit events", async () => {
    const globex = (await (await call("carolOther", "/audit")).json()) as { events: unknown[] };
    expect(globex.events).toHaveLength(0);
  });
});

describe("permissions", () => {
  it("blocks settings changes without settings:manage", async () => {
    const res = await call("bobMember", "/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "USD" }),
    });
    expect(res.status).toBe(403);
  });

  it("blocks the audit log without audit:read", async () => {
    expect((await call("bobMember", "/audit")).status).toBe(403);
  });

  it("validates input", async () => {
    const res = await call("aliceOwner", "/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "RUPEES" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("membership", () => {
  it("blocks a member removed by the identity provider, even with a live session", async () => {
    expect((await call("bobMember", "/me")).status).toBe(200);
    await db.update(members).set({ status: "removed" }).where(eq(members.userId, "bob"));
    expect((await call("bobMember", "/me")).status).toBe(403);
    await db.update(members).set({ status: "active" }).where(eq(members.userId, "bob"));
  });
});

describe("files", () => {
  it("rejects script-capable file types", async () => {
    const form = new FormData();
    form.set("file", new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));
    form.set("ownerType", "task");
    form.set("ownerId", "t1");
    expect((await call("aliceOwner", "/files", { method: "POST", body: form })).status).toBe(415);
  });
});
