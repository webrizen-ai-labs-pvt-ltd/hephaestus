import { allPermissions, mentionToken, ROLE_PRESETS } from "@hephaestus/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi, viewer } from "./test-utils.ts";

/* Acme: Ada (owner), Ben and Cy (members). Globex: Gus. */
const viewers = {
  ada: viewer("ada", "acme", ["owner"], allPermissions()),
  ben: viewer("ben", "acme", ["member"], ROLE_PRESETS.member!),
  cy: viewer("cy", "acme", ["member"], ROLE_PRESETS.member!),
  gus: viewer("gus", "globex", ["owner"], allPermissions()),
};

type Channel = { id: string; name: string; kind: string; unread: number; mentions: number };
type Msg = { id: string; body: string; deleted: boolean; isDecision: boolean; reactions: { emoji: string; count: number; mine: boolean }[]; mentions: { id: string }[] };

let t: Awaited<ReturnType<typeof createTestApi>>;
const member: Record<string, string> = {};
let general = "";

const notes = async (who: string) => (await t.call<{ notifications: { type: string; title: string }[] }>(who, "/notifications")).json.notifications;

beforeAll(async () => {
  t = await createTestApi(viewers);
  for (const v of Object.keys(viewers)) await t.call(v, "/me");
  const m = await t.call<{ members: { id: string; userId: string }[] }>("ada", "/members");
  for (const x of m.json.members) member[x.userId] = x.id;
}, 60_000);

afterAll(async () => t?.close());

describe("channels", () => {
  it("everyone lands in #general", async () => {
    const res = await t.call<{ channels: Channel[] }>("ben", "/collab/channels");
    general = res.json.channels.find((c) => c.name === "general")!.id;
    expect(general).toBeTruthy();
  });

  it("counts unread messages and mentions, and clears them on read", async () => {
    await t.call("ada", `/collab/channels/${general}/messages`, { body: `Welcome ${mentionToken(member.ben!)}!` });
    await t.call("ada", `/collab/channels/${general}/messages`, { body: "Standup at 10" });
    const ben = (await t.call<{ channels: Channel[] }>("ben", "/collab/channels")).json.channels.find((c) => c.id === general)!;
    expect(ben).toMatchObject({ unread: 2, mentions: 1 });
    expect((await notes("ben"))[0]?.title).toBe("Ada mentioned you in #general");
    // Authors don't get unread counts for their own messages.
    expect((await t.call<{ channels: Channel[] }>("ada", "/collab/channels")).json.channels.find((c) => c.id === general)!.unread).toBe(0);

    await t.call("ben", `/collab/channels/${general}/read`, {});
    expect((await t.call<{ channels: Channel[] }>("ben", "/collab/channels")).json.channels.find((c) => c.id === general)!.unread).toBe(0);
  });

  it("rejects duplicate channel names", async () => {
    expect((await t.call("ben", "/collab/channels", { name: "design" })).status).toBe(201);
    expect((await t.call("cy", "/collab/channels", { name: "Design" })).status).toBe(409);
  });

  it("lets people browse and join open channels", async () => {
    const cy = await t.call<{ browse: { name: string; id: string }[] }>("cy", "/collab/channels");
    const design = cy.json.browse.find((b) => b.name === "design")!;
    expect(design).toBeTruthy();
    expect((await t.call("cy", `/collab/channels/${design.id}/join`, {})).status).toBe(200);
  });
});

describe("private channels", () => {
  let secret = "";

  it("are invisible to non-members", async () => {
    const r = await t.call<{ channel: { id: string } }>("ada", "/collab/channels", { name: "leadership", kind: "private", memberIds: [member.ben] });
    secret = r.json.channel.id;
    await t.call("ada", `/collab/channels/${secret}/messages`, { body: "Budget talk" });
    expect((await t.call("cy", `/collab/channels/${secret}/messages`)).status).toBe(404);
    expect((await t.call("cy", `/collab/channels/${secret}/join`, {})).status).toBe(403);
    expect((await t.call("ben", `/collab/channels/${secret}/messages`)).status).toBe(200);
    const browse = (await t.call<{ browse: { id: string }[] }>("cy", "/collab/channels")).json.browse;
    expect(browse.some((b) => b.id === secret)).toBe(false);
  });

  it("ignores mentions of people outside the channel", async () => {
    const r = await t.call<{ message: Msg }>("ada", `/collab/channels/${secret}/messages`, { body: `Loop in ${mentionToken(member.cy!)}?` });
    expect(r.json.message.mentions).toEqual([]);
    expect((await notes("cy")).some((n) => n.title.includes("leadership"))).toBe(false);
  });

  it("keeps decisions from private channels away from non-members", async () => {
    const msgs = await t.call<{ messages: Msg[] }>("ada", `/collab/channels/${secret}/messages`);
    await t.call("ada", `/collab/messages/${msgs.json.messages[0]!.id}/decision`, { isDecision: true });
    const forBen = await t.call<{ decisions: unknown[] }>("ben", "/collab/decisions");
    const forCy = await t.call<{ decisions: unknown[] }>("cy", "/collab/decisions");
    expect(forBen.json.decisions).toHaveLength(1);
    expect(forCy.json.decisions).toHaveLength(0);
    expect((await t.call("cy", `/collab/messages/${msgs.json.messages[0]!.id}/reactions`, { emoji: "👍" })).status).toBe(404);
  });

  it("protects attachments of private messages", async () => {
    const msgs = await t.call<{ messages: Msg[] }>("ada", `/collab/channels/${secret}/messages`);
    const id = msgs.json.messages[0]!.id;
    expect((await t.call("cy", `/attachments?ownerType=message&ownerId=${id}`)).status).toBe(404);
    expect((await t.call("ben", `/attachments?ownerType=message&ownerId=${id}`)).status).toBe(200);
  });
});

describe("direct messages", () => {
  it("reuses the same conversation and notifies the other person", async () => {
    const a = await t.call<{ channel: { id: string } }>("ben", "/collab/dms", { memberIds: [member.cy] });
    const b = await t.call<{ channel: { id: string } }>("cy", "/collab/dms", { memberIds: [member.ben] });
    expect(a.json.channel.id).toBe(b.json.channel.id);
    await t.call("ben", `/collab/channels/${a.json.channel.id}/messages`, { body: "Lunch?" });
    expect((await notes("cy"))[0]).toMatchObject({ type: "message.dm", title: "Ben sent you a message" });
    expect((await t.call("ada", `/collab/channels/${a.json.channel.id}/messages`)).status).toBe(404);
  });
});

describe("messages", () => {
  it("only lets authors edit, and hides deleted text", async () => {
    const r = await t.call<{ message: Msg }>("ben", `/collab/channels/${general}/messages`, { body: "typo hree" });
    const id = r.json.message.id;
    expect((await t.call("cy", `/collab/messages/${id}`, { body: "hacked" }, "PATCH")).status).toBe(403);
    expect((await t.call("ben", `/collab/messages/${id}`, { body: "typo here" }, "PATCH")).status).toBe(200);
    expect((await t.call("cy", `/collab/messages/${id}`, undefined, "DELETE")).status).toBe(403);
    expect((await t.call("ben", `/collab/messages/${id}`, undefined, "DELETE")).status).toBe(200);
    const list = await t.call<{ messages: Msg[] }>("cy", `/collab/channels/${general}/messages`);
    expect(list.json.messages.find((m) => m.id === id)).toMatchObject({ deleted: true, body: "" });
  });

  it("toggles reactions", async () => {
    const r = await t.call<{ message: Msg }>("ada", `/collab/channels/${general}/messages`, { body: "Shipped!" });
    const id = r.json.message.id;
    await t.call("ben", `/collab/messages/${id}/reactions`, { emoji: "🎉" });
    await t.call("cy", `/collab/messages/${id}/reactions`, { emoji: "🎉" });
    await t.call("cy", `/collab/messages/${id}/reactions`, { emoji: "🎉" });
    const m = (await t.call<{ messages: Msg[] }>("ben", `/collab/channels/${general}/messages`)).json.messages.find((x) => x.id === id)!;
    expect(m.reactions).toEqual([expect.objectContaining({ emoji: "🎉", count: 1, mine: true })]);
    expect((await t.call("ben", `/collab/messages/${id}/reactions`, { emoji: "💩" })).status).toBe(400);
  });

  it("keeps organizations apart", async () => {
    expect((await t.call("gus", `/collab/channels/${general}/messages`)).status).toBe(404);
    expect((await t.call("gus", `/collab/channels/${general}/messages`, { body: "hi" })).status).toBe(404);
  });
});

describe("comments on tasks", () => {
  it("notify assignees and mentioned people, and need task access", async () => {
    await t.call("ada", "/employees/import-members", {});
    const emps = (await t.call<{ employees: { id: string; workEmail: string }[] }>("ada", "/employees")).json.employees;
    const benEmp = emps.find((e) => e.workEmail.startsWith("ben"))!.id;
    const task = (await t.call<{ task: { id: string } }>("ada", "/tasks", { title: "Fix invoice PDF", assigneeIds: [benEmp] })).json.task.id;

    const r = await t.call("ada", `/collab/threads/task/${task}`, { body: `Can you check this, ${mentionToken(member.cy!)}?` });
    expect(r.status).toBe(201);
    expect((await notes("ben"))[0]).toMatchObject({ type: "comment.created", title: 'Ada commented on "Fix invoice PDF"' });
    expect((await notes("cy"))[0]).toMatchObject({ type: "comment.mention" });

    const list = await t.call<{ messages: Msg[] }>("cy", `/collab/threads/task/${task}`);
    expect(list.json.messages).toHaveLength(1);
    expect((await t.call("gus", `/collab/threads/task/${task}`)).status).toBe(404);
    expect((await t.call("ada", `/collab/threads/invoice/${task}`)).status).toBe(404);
  });

  it("collects mentions across channels and threads", async () => {
    const res = await t.call<{ mentions: { context: { kind: string } }[] }>("cy", "/collab/mentions");
    expect(res.json.mentions.map((m) => m.context.kind)).toContain("task");
  });
});
