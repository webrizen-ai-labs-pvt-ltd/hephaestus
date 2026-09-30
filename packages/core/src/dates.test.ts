import { describe, expect, it } from "vitest";
import { addDays, countLeaveDays, isIsoDate, isoWeekday, todayIn } from "./dates.ts";

const monFri = [1, 2, 3, 4, 5];

describe("dates", () => {
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-10-01")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("01-10-2026")).toBe(false);
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("uses ISO weekdays", () => {
    expect(isoWeekday("2026-10-05")).toBe(1); // Monday
    expect(isoWeekday("2026-10-04")).toBe(7); // Sunday
  });

  it("gives today's date in the org's time zone", () => {
    // 20:00 UTC on 30 Sep is already 1 Oct in India.
    expect(todayIn("Asia/Kolkata", new Date("2026-09-30T20:00:00Z"))).toBe("2026-10-01");
  });
});

describe("countLeaveDays", () => {
  it("skips weekends", () => {
    // Fri 2 Oct → Mon 5 Oct 2026
    expect(countLeaveDays({ start: "2026-10-02", end: "2026-10-05", workWeek: monFri, holidays: new Set() })).toBe(2);
  });

  it("skips holidays", () => {
    // Gandhi Jayanti, Fri 2 Oct
    expect(
      countLeaveDays({ start: "2026-10-01", end: "2026-10-02", workWeek: monFri, holidays: new Set(["2026-10-02"]) }),
    ).toBe(1);
  });

  it("supports six-day work weeks", () => {
    expect(countLeaveDays({ start: "2026-10-05", end: "2026-10-11", workWeek: [1, 2, 3, 4, 5, 6], holidays: new Set() })).toBe(6);
  });

  it("counts half days only for single working days", () => {
    expect(countLeaveDays({ start: "2026-10-05", end: "2026-10-05", workWeek: monFri, holidays: new Set(), halfDay: "first_half" })).toBe(0.5);
    expect(countLeaveDays({ start: "2026-10-04", end: "2026-10-04", workWeek: monFri, holidays: new Set(), halfDay: "first_half" })).toBe(0);
  });

  it("returns zero for reversed ranges", () => {
    expect(countLeaveDays({ start: "2026-10-05", end: "2026-10-01", workWeek: monFri, holidays: new Set() })).toBe(0);
  });
});
