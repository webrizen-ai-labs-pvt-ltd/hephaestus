import { describe, expect, it } from "vitest";
import { allPermissions, can, ROLE_PRESETS, uuidv7 } from "./index.ts";

describe("permissions", () => {
  it("checks resource and action", () => {
    expect(can({ task: ["read"] }, "task", "read")).toBe(true);
    expect(can({ task: ["read"] }, "task", "delete")).toBe(false);
    expect(can({}, "invoice", "read")).toBe(false);
  });

  it("gives owners everything", () => {
    expect(can(allPermissions(), "settings", "manage")).toBe(true);
    expect(can(ROLE_PRESETS.owner!, "payment", "refund")).toBe(true);
  });

  it("keeps finance away from plain members", () => {
    expect(can(ROLE_PRESETS.member!, "invoice", "read")).toBe(false);
    expect(can(ROLE_PRESETS.accountant!, "invoice", "send")).toBe(true);
  });
});

describe("uuidv7", () => {
  it("is a valid, time-ordered v7 uuid", async () => {
    const a = uuidv7();
    await new Promise((r) => setTimeout(r, 2));
    const b = uuidv7();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});
