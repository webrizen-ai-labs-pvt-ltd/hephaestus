import { allPermissions, ROLE_PRESETS } from "@operant/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi, viewer } from "./test-utils.ts";

/*
 * Acme: Hana (HR owner), Manny (manager), Priya (member, reports to Manny),
 * Sam (member, reports to Manny). Globex: Gus (owner) for isolation checks.
 */
const viewers = {
  hana: viewer("hana", "acme", ["owner"], allPermissions()),
  manny: viewer("manny", "acme", ["member"], ROLE_PRESETS.member!),
  priya: viewer("priya", "acme", ["member"], ROLE_PRESETS.member!),
  sam: viewer("sam", "acme", ["member"], ROLE_PRESETS.member!),
  gus: viewer("gus", "globex", ["owner"], allPermissions()),
};

let t: Awaited<ReturnType<typeof createTestApi>>;
const ids: Record<string, string> = {};
let casual = "";
let unpaid = "";

beforeAll(async () => {
  t = await createTestApi(viewers);
  for (const v of Object.keys(viewers)) await t.call(v, "/me");

  // HR imports everyone who has signed in, then sets reporting lines.
  const imported = await t.call<{ created: number }>("hana", "/employees/import-members", {});
  expect(imported.json.created).toBe(4);
  const list = await t.call<{ employees: { id: string; workEmail: string }[] }>("hana", "/employees");
  for (const e of list.json.employees) ids[e.workEmail.split("@")[0]!] = e.id;
  for (const who of ["priya", "sam"]) {
    expect((await t.call("hana", `/employees/${ids[who]}`, { managerId: ids.manny }, "PATCH")).status).toBe(200);
  }

  const types = await t.call<{ types: { id: string; name: string }[] }>("hana", "/leave/types");
  casual = types.json.types.find((x) => x.name === "Casual leave")!.id;
  unpaid = types.json.types.find((x) => x.name === "Unpaid leave")!.id;
}, 60_000);

afterAll(async () => t?.close());

describe("employees", () => {
  it("numbers employees without gaps", async () => {
    const res = await t.call<{ employee: { employeeCode: string } }>("hana", "/employees", { fullName: "Nora New", workEmail: "nora@acme.test" });
    expect(res.status).toBe(201);
    expect(res.json.employee.employeeCode).toBe("EMP-0005");
  });

  it("blocks reporting loops", async () => {
    const res = await t.call<{ error: string }>("hana", `/employees/${ids.manny}`, { managerId: ids.priya }, "PATCH");
    expect(res.status).toBe(422);
    expect(res.json.error).toMatch(/loop/);
  });

  it("only lets HR create or edit employees", async () => {
    expect((await t.call("priya", "/employees", { fullName: "X" })).status).toBe(403);
    expect((await t.call("priya", `/employees/${ids.sam}`, { jobTitle: "CEO" }, "PATCH")).status).toBe(403);
  });

  it("hides private fields from colleagues but shows them to the person", async () => {
    await t.call("hana", `/employees/${ids.sam}`, { phone: "+91 98765 43210" }, "PATCH");
    const asPriya = await t.call<{ employee: { phone: string | null } }>("priya", `/employees/${ids.sam}`);
    const asSam = await t.call<{ employee: { phone: string | null } }>("sam", `/employees/${ids.sam}`);
    expect(asPriya.json.employee.phone).toBeNull();
    expect(asSam.json.employee.phone).toBe("+91 98765 43210");
  });

  it("keeps organizations apart", async () => {
    expect((await t.call("gus", `/employees/${ids.sam}`)).status).toBe(404);
    const list = await t.call<{ employees: unknown[] }>("gus", "/employees");
    expect(list.json.employees).toHaveLength(0); // Globex has no employees yet, and none of Acme's leak in
    expect((await t.call("gus", `/employees/${ids.sam}`, { jobTitle: "x" }, "PATCH")).status).toBe(404);
  });
});

describe("departments", () => {
  it("prevents a department from sitting inside itself", async () => {
    const eng = await t.call<{ department: { id: string } }>("hana", "/departments", { name: "Engineering" });
    const web = await t.call<{ department: { id: string } }>("hana", "/departments", { name: "Web", parentId: eng.json.department.id });
    const res = await t.call("hana", `/departments/${eng.json.department.id}`, { parentId: web.json.department.id }, "PATCH");
    expect(res.status).toBe(422);
  });

  it("rejects duplicate names", async () => {
    expect((await t.call("hana", "/departments", { name: "engineering" })).status).toBe(409);
  });
});

describe("leave", () => {
  // Mon 5 Oct → Wed 7 Oct 2026: 3 working days.
  it("counts working days and notifies the manager", async () => {
    const res = await t.call<{ request: { id: string; days: number } }>("priya", "/leave/requests", {
      leaveTypeId: casual,
      startDate: "2026-10-05",
      endDate: "2026-10-07",
      reason: "Family function",
    });
    expect(res.status).toBe(201);
    expect(res.json.request.days).toBe(3);
    const notes = await t.call<{ notifications: { title: string }[] }>("manny", "/notifications");
    expect(notes.json.notifications[0]?.title).toMatch(/Priya requested 3 days/);
  });

  it("rejects overlapping requests", async () => {
    const res = await t.call("priya", "/leave/requests", { leaveTypeId: casual, startDate: "2026-10-07", endDate: "2026-10-08" });
    expect(res.status).toBe(409);
  });

  it("rejects ranges with no working days", async () => {
    // Sat 10 → Sun 11 Oct
    const res = await t.call("priya", "/leave/requests", { leaveTypeId: casual, startDate: "2026-10-10", endDate: "2026-10-11" });
    expect(res.status).toBe(422);
  });

  it("skips public holidays", async () => {
    // Thu 1 → Fri 2 Oct; 2 Oct is Gandhi Jayanti (seeded).
    const res = await t.call<{ request: { days: number } }>("sam", "/leave/requests", { leaveTypeId: unpaid, startDate: "2026-10-01", endDate: "2026-10-02" });
    expect(res.json.request.days).toBe(1);
  });

  it("enforces the yearly balance", async () => {
    // 3 used of 12; 12 more working days is too many.
    const res = await t.call<{ error: string }>("priya", "/leave/requests", { leaveTypeId: casual, startDate: "2026-11-02", endDate: "2026-11-17" });
    expect(res.status).toBe(422);
    expect(res.json.error).toMatch(/Only 9 days/);
  });

  it("lets the manager approve, but not colleagues or the requester", async () => {
    const mine = await t.call<{ requests: { id: string }[] }>("priya", "/leave/requests?scope=mine");
    const id = mine.json.requests.find(() => true)!.id;

    expect((await t.call("sam", `/leave/requests/${id}/decide`, { decision: "approved" })).status).toBe(403);
    expect((await t.call("priya", `/leave/requests/${id}/decide`, { decision: "approved" })).status).toBe(403);

    const queue = await t.call<{ requests: { id: string }[] }>("manny", "/leave/requests?scope=approvals");
    expect(queue.json.requests.map((r) => r.id)).toContain(id);
    expect((await t.call("manny", `/leave/requests/${id}/decide`, { decision: "approved", note: "Enjoy!" })).status).toBe(200);
    expect((await t.call("manny", `/leave/requests/${id}/decide`, { decision: "rejected" })).status).toBe(409);

    const balances = await t.call<{ balances: { name: string; approved: number; remaining: number }[] }>("priya", "/leave/balances?year=2026");
    const c = balances.json.balances.find((b) => b.name === "Casual leave")!;
    expect(c.approved).toBe(3);
    expect(c.remaining).toBe(9);
  });

  it("hides reasons on the shared calendar", async () => {
    const cal = await t.call<{ requests: Record<string, unknown>[] }>("sam", "/leave/calendar?from=2026-10-01&to=2026-10-31");
    expect(cal.json.requests.length).toBeGreaterThan(0);
    expect(cal.json.requests[0]).not.toHaveProperty("reason");
  });

  it("stops people seeing everyone's requests without approval rights", async () => {
    expect((await t.call("sam", "/leave/requests?scope=all")).status).toBe(403);
  });
});

describe("onboarding", () => {
  it("assigns steps to the joiner and manager, and completes the run", async () => {
    const templates = await t.call<{ templates: { id: string; items: unknown[] }[] }>("hana", "/onboarding/templates");
    const tpl = templates.json.templates[0]!;
    const start = await t.call<{ run: { id: string } }>("hana", "/onboarding/runs", { employeeId: ids.sam, templateId: tpl.id, startDate: "2026-10-05" });
    expect(start.status).toBe(201);

    const samItems = await t.call<{ items: { id: string }[] }>("sam", "/onboarding/my-items");
    const mannyItems = await t.call<{ items: { id: string }[] }>("manny", "/onboarding/my-items");
    expect(samItems.json.items.length + mannyItems.json.items.length).toBe(tpl.items.length);

    // Sam can't tick Manny's steps.
    expect((await t.call("sam", `/onboarding/items/${mannyItems.json.items[0]!.id}`, { done: true }, "PATCH")).status).toBe(403);

    const profile = await t.call<{ employee: { status: string } }>("hana", `/employees/${ids.sam}`);
    expect(profile.json.employee.status).toBe("onboarding");

    for (const i of samItems.json.items) await t.call("sam", `/onboarding/items/${i.id}`, { done: true }, "PATCH");
    let last: { json: { runCompleted: boolean } } | undefined;
    for (const i of mannyItems.json.items) last = await t.call("manny", `/onboarding/items/${i.id}`, { done: true }, "PATCH");
    expect(last?.json.runCompleted).toBe(true);

    const after = await t.call<{ employee: { status: string } }>("hana", `/employees/${ids.sam}`);
    expect(after.json.employee.status).toBe("active");
  });
});

describe("offboarding", () => {
  it("moves direct reports up to the next manager", async () => {
    await t.call("hana", `/employees/${ids.manny}`, { managerId: ids.hana }, "PATCH");
    expect((await t.call("hana", `/employees/${ids.manny}/offboard`, { exitDate: "2026-12-31" })).status).toBe(200);
    const priya = await t.call<{ employee: { managerId: string } }>("hana", `/employees/${ids.priya}`);
    expect(priya.json.employee.managerId).toBe(ids.hana);
  });
});
