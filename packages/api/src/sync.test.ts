import type { Viewer } from "@operant/core";
import { connectPglite, type Db, members, migrationsFolder } from "@operant/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reconcileMembers, syncViewer } from "./sync.ts";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  const conn = await connectPglite(undefined, migrationsFolder);
  db = conn.db;
  close = conn.close;
});
afterAll(() => close());

const viewer: Viewer = {
  userId: "u-owner",
  email: "owner@x.test",
  name: "Owner",
  image: null,
  org: { id: "ext-org", name: "Acme", slug: "acme", logo: null, roles: ["owner"], permissions: {} },
};

const statusOf = async (userId: string) => (await db.select({ s: members.status }).from(members).where(eq(members.userId, userId)))[0]?.s;

describe("reconcileMembers", () => {
  it("keeps everyone in the snapshot active and removes the rest", async () => {
    const org = (await syncViewer(db, viewer))!;
    await reconcileMembers(db, org.id, [{ userId: "u-gone", email: "g@x.test", name: "Gone", image: null, roles: ["member"] }]);
    await reconcileMembers(db, org.id, [
      { userId: "u-owner", email: "owner@x.test", name: "Owner", image: null, roles: ["owner"] },
      { userId: "u-two", email: "two@x.test", name: "Two", image: null, roles: ["member"] },
    ]);
    expect(await statusOf("u-owner")).toBe("active");
    expect(await statusOf("u-two")).toBe("active");
    expect(await statusOf("u-gone")).toBe("removed");
  });
});
