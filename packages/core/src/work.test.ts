import { describe, expect, it } from "vitest";
import { nextOccurrence, positionBetween, projectKeyFrom } from "./work.ts";

describe("nextOccurrence", () => {
  it("steps daily and weekly", () => {
    expect(nextOccurrence("2026-10-01", { freq: "daily", interval: 1 })).toBe("2026-10-02");
    expect(nextOccurrence("2026-10-01", { freq: "weekly", interval: 2 })).toBe("2026-10-15");
  });

  it("keeps the day of month, clamped to short months", () => {
    expect(nextOccurrence("2026-01-15", { freq: "monthly", interval: 1 })).toBe("2026-02-15");
    expect(nextOccurrence("2026-01-31", { freq: "monthly", interval: 1 })).toBe("2026-02-28");
    expect(nextOccurrence("2026-11-30", { freq: "monthly", interval: 3 })).toBe("2027-02-28");
  });
});

describe("positionBetween", () => {
  it("places cards between, before and after neighbours", () => {
    expect(positionBetween(null, null)).toBe(1024);
    expect(positionBetween(1024, 2048)).toBe(1536);
    expect(positionBetween(null, 1024)).toBe(0);
    expect(positionBetween(2048, null)).toBe(3072);
  });
});

describe("projectKeyFrom", () => {
  it("builds short codes", () => {
    expect(projectKeyFrom("Website Relaunch")).toBe("WR");
    expect(projectKeyFrom("Payroll")).toBe("PAY");
    expect(projectKeyFrom("Q4 sales push for Mumbai")).toBe("QSPF");
    expect(projectKeyFrom("!!")).toBe("PRJ");
  });
});
