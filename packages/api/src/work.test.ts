import { allPermissions, ROLE_PRESETS } from "@operant/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi, viewer } from "./test-utils.ts";

/* Acme: Olga (owner), Max (manager preset), Mia (member). Globex: Gus. */
const viewers = {
  olga: viewer("olga", "acme", ["owner"], allPermissions()),
  max: viewer("max", "acme", ["manager"], ROLE_PRESETS.manager!),
  mia: viewer("mia", "acme", ["member"], ROLE_PRESETS.member!),
  gus: viewer("gus", "globex", ["owner"], allPermissions()),
};

type Stage = { id: string; name: string; category: string };
type Card = { id: string; number: number; status: string; stageId: string; title: string; assignees: { id: string }[]; blocked: boolean; dueDate: string | null };

let t: Awaited<ReturnType<typeof createTestApi>>;
const emp: Record<string, string> = {};
let projectId = "";
let stages: Stage[] = [];

const stage = (name: string) => stages.find((s) => s.name === name)!.id;

beforeAll(async () => {
  t = await createTestApi(viewers);
  for (const v of Object.keys(viewers)) await t.call(v, "/me");
  await t.call("olga", "/employees/import-members", {});
  await t.call("gus", "/employees/import-members", {});
  const list = await t.call<{ employees: { id: string; workEmail: string }[] }>("olga", "/employees");
  for (const e of list.json.employees) emp[e.workEmail.split("@")[0]!] = e.id;

  const p = await t.call<{ project: { id: string; key: string } }>("olga", "/projects", {
    name: "Website Relaunch",
    leadEmployeeId: emp.max,
    memberIds: [emp.mia],
    startDate: "2026-10-01",
  });
  expect(p.status).toBe(201);
  expect(p.json.project.key).toBe("WR");
  projectId = p.json.project.id;
  stages = (await t.call<{ stages: Stage[] }>("olga", `/projects/${projectId}`)).json.stages;
}, 60_000);

afterAll(async () => t?.close());

describe("projects", () => {
  it("creates default stages and picks a free key", async () => {
    expect(stages.map((s) => s.name)).toEqual(["Backlog", "To do", "In progress", "In review", "Done"]);
    const again = await t.call<{ project: { key: string } }>("olga", "/projects", { name: "Website Revamp" });
    expect(again.json.project.key).toBe("WR2");
  });

  it("lets only permitted roles create projects", async () => {
    expect((await t.call("mia", "/projects", { name: "Side quest" })).status).toBe(403);
    expect((await t.call("max", "/projects", { name: "Hiring drive" })).status).toBe(201);
  });

  it("keeps organizations apart", async () => {
    expect((await t.call("gus", `/projects/${projectId}`)).status).toBe(404);
    expect((await t.call("gus", "/tasks", { title: "x", projectId })).status).toBe(404);
  });
});

describe("tasks", () => {
  let first = "";

  it("numbers tasks per project and puts them in the first stage", async () => {
    const a = await t.call<{ task: { id: string; number: number } }>("mia", "/tasks", { title: "Wireframes", projectId });
    const b = await t.call<{ task: { id: string; number: number } }>("mia", "/tasks", { title: "Copy", projectId });
    expect([a.json.task.number, b.json.task.number]).toEqual([1, 2]);
    first = a.json.task.id;
    const detail = await t.call<{ task: Card }>("mia", `/tasks/${first}`);
    expect(detail.json.task.stageId).toBe(stage("Backlog"));
  });

  it("follows the stage's category when moved", async () => {
    await t.call("mia", `/tasks/${first}`, { stageId: stage("In progress") }, "PATCH");
    const d = await t.call<{ task: Card; activity: { type: string; data: Record<string, unknown> }[] }>("mia", `/tasks/${first}`);
    expect(d.json.task.status).toBe("in_progress");
    expect(d.json.activity[0]?.data).toHaveProperty("stage");
  });

  it("lets members take tasks but not hand them to others", async () => {
    expect((await t.call("mia", `/tasks/${first}`, { assigneeIds: [emp.mia] }, "PATCH")).status).toBe(200);
    expect((await t.call("mia", `/tasks/${first}`, { assigneeIds: [emp.mia, emp.max] }, "PATCH")).status).toBe(403);
    expect((await t.call("max", `/tasks/${first}`, { assigneeIds: [emp.mia, emp.max] }, "PATCH")).status).toBe(200);
  });

  it("notifies new assignees, but not people assigning themselves", async () => {
    await t.call("olga", "/tasks", { title: "Hero banner", projectId, assigneeIds: [emp.max] });
    const notes = await t.call<{ notifications: { title: string }[] }>("max", "/notifications");
    expect(notes.json.notifications.some((n) => n.title === 'Olga assigned you "Hero banner"')).toBe(true);
    expect(notes.json.notifications.some((n) => n.title.includes("Wireframes"))).toBe(false);
  });

  it("shows assigned work in My work", async () => {
    const my = await t.call<{ tasks: Card[] }>("max", "/work/my");
    expect(my.json.tasks.map((x) => x.title)).toContain("Wireframes");
  });

  it("supports one level of subtasks", async () => {
    const sub = await t.call<{ task: { id: string } }>("mia", "/tasks", { title: "Mobile layout", parentId: first });
    expect(sub.status).toBe(201);
    expect((await t.call("mia", "/tasks", { title: "Too deep", parentId: sub.json.task.id })).status).toBe(422);
    const list = await t.call<{ tasks: (Card & { subtasks: { total: number } })[] }>("mia", `/tasks?projectId=${projectId}`);
    expect(list.json.tasks.find((x) => x.id === first)?.subtasks.total).toBe(1);
  });

  it("rejects stages from another project", async () => {
    const other = await t.call<{ projects: { id: string; key: string }[] }>("olga", "/projects");
    const otherId = other.json.projects.find((p) => p.key === "WR2")!.id;
    const otherStages = (await t.call<{ stages: Stage[] }>("olga", `/projects/${otherId}`)).json.stages;
    expect((await t.call("mia", `/tasks/${first}`, { stageId: otherStages[0]!.id }, "PATCH")).status).toBe(422);
  });
});

describe("dependencies", () => {
  it("blocks completion until blockers are done and rejects cycles", async () => {
    const a = (await t.call<{ task: { id: string } }>("max", "/tasks", { title: "Design sign-off", projectId })).json.task.id;
    const b = (await t.call<{ task: { id: string } }>("max", "/tasks", { title: "Build pages", projectId })).json.task.id;
    expect((await t.call("max", `/tasks/${b}/dependencies`, { blockedById: a })).status).toBe(201);
    expect((await t.call("max", `/tasks/${a}/dependencies`, { blockedById: b })).status).toBe(422);

    const card = (await t.call<{ task: Card }>("max", `/tasks/${b}`)).json.task;
    expect(card.blocked).toBe(true);
    expect((await t.call("max", `/tasks/${b}`, { stageId: stage("Done") }, "PATCH")).status).toBe(409);
    await t.call("max", `/tasks/${a}`, { stageId: stage("Done") }, "PATCH");
    expect((await t.call("max", `/tasks/${b}`, { stageId: stage("Done") }, "PATCH")).status).toBe(200);
  });
});

describe("recurring tasks", () => {
  it("creates the next occurrence when completed", async () => {
    const r = await t.call<{ task: { id: string } }>("max", "/tasks", {
      title: "Weekly report",
      projectId,
      dueDate: "2026-10-02",
      recurrence: { freq: "weekly", interval: 1 },
      assigneeIds: [emp.max],
    });
    const done = await t.call<{ nextTaskId: string }>("max", `/tasks/${r.json.task.id}`, { status: "done" }, "PATCH");
    expect(done.json.nextTaskId).toBeTruthy();
    const next = await t.call<{ task: Card & { recurrence: unknown } }>("max", `/tasks/${done.json.nextTaskId}`);
    expect(next.json.task.dueDate).toBe("2026-10-09");
    expect(next.json.task.status).toBe("todo");
    expect(next.json.task.assignees.map((a) => a.id)).toEqual([emp.max]);
    expect(next.json.task.recurrence).toEqual({ freq: "weekly", interval: 1 });
  });
});

describe("personal tasks", () => {
  it("belong to their creator and use status directly", async () => {
    const r = await t.call<{ task: { id: string } }>("mia", "/tasks", { title: "Renew ID card" });
    const d = await t.call<{ task: Card }>("mia", `/tasks/${r.json.task.id}`);
    expect(d.json.task.assignees.map((a) => a.id)).toEqual([emp.mia]);
    await t.call("mia", `/tasks/${r.json.task.id}`, { status: "done" }, "PATCH");
    expect((await t.call<{ task: Card }>("mia", `/tasks/${r.json.task.id}`)).json.task.status).toBe("done");
  });

  it("can only be deleted by their creator or an admin", async () => {
    const r = await t.call<{ task: { id: string } }>("max", "/tasks", { title: "Max's note" });
    expect((await t.call("mia", `/tasks/${r.json.task.id}`, undefined, "DELETE")).status).toBe(403);
    expect((await t.call("max", `/tasks/${r.json.task.id}`, undefined, "DELETE")).status).toBe(200);
  });
});

describe("onboarding tasks", () => {
  it("ticks the onboarding step when its task is completed", async () => {
    await t.call("olga", `/employees/${emp.mia}`, { managerId: emp.max }, "PATCH");
    const tpl = (await t.call<{ templates: { id: string }[] }>("olga", "/onboarding/templates")).json.templates[0]!.id;
    await t.call("olga", "/onboarding/runs", { employeeId: emp.mia, templateId: tpl, startDate: "2026-10-01" });

    const my = await t.call<{ tasks: (Card & { source: string })[] }>("mia", "/work/my");
    const onboardingTask = my.json.tasks.find((x) => x.source === "onboarding")!;
    expect(onboardingTask).toBeTruthy();
    await t.call("mia", `/tasks/${onboardingTask.id}`, { status: "done" }, "PATCH");

    const runs = await t.call<{ runs: { items: { title: string; doneAt: string | null }[] }[] }>("olga", `/onboarding/runs?employeeId=${emp.mia}`);
    const doneSteps = runs.json.runs[0]!.items.filter((i) => i.doneAt);
    expect(doneSteps).toHaveLength(1);
    expect(onboardingTask.title.startsWith(doneSteps[0]!.title)).toBe(true);
  });
});

describe("templates", () => {
  it("copies stages, milestones and tasks into a new project", async () => {
    await t.call("olga", `/projects/${projectId}/milestones`, { name: "Launch", dueDate: "2026-10-31" });
    const copy = await t.call<{ project: { id: string } }>("olga", "/projects", {
      name: "Website for Globex",
      templateProjectId: projectId,
      startDate: "2026-11-01",
    });
    const detail = await t.call<{ stages: Stage[]; milestones: { name: string; dueDate: string }[] }>("olga", `/projects/${copy.json.project.id}`);
    expect(detail.json.stages).toHaveLength(5);
    expect(detail.json.milestones[0]).toMatchObject({ name: "Launch", dueDate: "2026-12-01" });
    const copied = await t.call<{ tasks: Card[] }>("olga", `/tasks?projectId=${copy.json.project.id}`);
    expect(copied.json.tasks.length).toBeGreaterThan(3);
    expect(copied.json.tasks.every((x) => x.stageId === detail.json.stages[0]!.id && x.assignees.length === 0)).toBe(true);
    // Numbering continues after the copied tasks.
    const fresh = await t.call<{ task: { number: number } }>("olga", "/tasks", { title: "New", projectId: copy.json.project.id });
    expect(fresh.json.task.number).toBe(copied.json.tasks.length + 1);
  });
});

describe("workload", () => {
  it("counts open tasks and leave per person per week", async () => {
    const w = await t.call<{ weeks: string[]; people: { id: string; weeks: { tasks: number }[] }[] }>("olga", "/work/workload?weeks=4");
    expect(w.json.weeks).toHaveLength(4);
    expect(w.json.people.find((p) => p.id === emp.max)).toBeTruthy();
  });
});
