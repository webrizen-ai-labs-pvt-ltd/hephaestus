import { allPermissions, type EmailDomain, type EmailDomains, type Mailer, type MailMessage, ROLE_PRESETS, type SmtpConfig } from "@operant/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureMailer, createTestApi, viewer } from "./test-utils.ts";

/* Acme: Fia (owner), Ace (accountant). Globex: Gus. */
const viewers = {
  fia: viewer("fia", "acme", ["owner"], allPermissions()),
  ace: viewer("ace", "acme", ["accountant"], ROLE_PRESETS.accountant!),
  gus: viewer("gus", "globex", ["owner"], allPermissions()),
};

const platform = captureMailer();
// Stand-ins for Resend's domain API and for organizations' mail servers.
const domains = new Map<string, EmailDomain>();
let nextId = 1;
const emailDomains: EmailDomains = {
  async create(name) {
    const d: EmailDomain = { id: `dom_${nextId++}`, name, status: "pending", records: [{ purpose: "DKIM", type: "TXT", name: `resend._domainkey.${name}`, value: "p=MIGf…" }] };
    domains.set(d.id, d);
    return d;
  },
  async get(id) {
    return domains.get(id)!;
  },
  async verify(id) {
    return domains.get(id)!;
  },
  async remove(id) {
    domains.delete(id);
  },
};
const smtpSent: (MailMessage & { via: SmtpConfig })[] = [];
let smtpDown = false;
const smtp = (cfg: SmtpConfig): Mailer => ({
  enabled: true,
  async send(m) {
    if (cfg.password !== "right-password" || smtpDown) throw new Error("535 Authentication failed");
    smtpSent.push({ ...m, via: cfg });
  },
});

let t: Awaited<ReturnType<typeof createTestApi>>;
type View = { mode: string; from: string; domain: { status: string; records: unknown[] } | null; smtp: { host: string } | null; lastError: { message: string } | null };

beforeAll(async () => {
  t = await createTestApi(viewers, { mailer: platform.mailer, emailDomains, smtp });
  for (const v of Object.keys(viewers)) await t.call(v, "/me");
  await t.call("fia", "/finance/settings", { legalName: "Acme Studio LLP", email: "accounts@acme.test" }, "PATCH");
}, 60_000);

afterAll(async () => t?.close());

describe("organization email", () => {
  it("starts with the organization's name on Operant's address, replies to its billing email", async () => {
    const v = await t.call<View>("fia", "/email-settings");
    expect(v.json.mode).toBe("platform");
    expect(v.json.from).toBe('"Acme Studio LLP" <test@example.com>');
    await t.call("fia", "/email-settings/test", {});
    expect(platform.sent.at(-1)).toMatchObject({ to: "fia@acme.test", from: '"Acme Studio LLP" <test@example.com>', replyTo: "accounts@acme.test" });
  });

  it("is managed by admins only", async () => {
    expect((await t.call("ace", "/email-settings")).status).toBe(200);
    expect((await t.call("ace", "/email-settings", { fromName: "X" }, "PATCH")).status).toBe(403);
  });

  it("sends from a verified domain, and only once it's verified", async () => {
    expect((await t.call("fia", "/email-settings/domain", { domain: "acme.test", fromEmail: "billing@other.test" })).status).toBe(422);
    const added = await t.call<View>("fia", "/email-settings/domain", { domain: "acme.test", fromEmail: "billing@acme.test" });
    expect(added.status).toBe(201);
    expect(added.json.domain).toMatchObject({ status: "pending", records: [expect.anything()] });
    expect((await t.call("fia", "/email-settings", { mode: "domain" }, "PATCH")).status).toBe(409);

    // Another organization can't claim the same domain.
    expect((await t.call("gus", "/email-settings/domain", { domain: "acme.test", fromEmail: "x@acme.test" })).status).toBe(409);

    [...domains.values()].find((d) => d.name === "acme.test")!.status = "verified";
    const v = await t.call<View>("fia", "/email-settings/domain/verify", {});
    expect(v.json.mode).toBe("domain");
    expect(v.json.from).toBe('"Acme Studio LLP" <billing@acme.test>');
    await t.call("fia", "/email-settings/test", {});
    expect(platform.sent.at(-1)!.from).toBe('"Acme Studio LLP" <billing@acme.test>');
  });

  it("connects a mail server only after a test email goes through it", async () => {
    const body = { host: "smtp.acme.test", port: 587, security: "starttls", username: "billing@acme.test", fromEmail: "billing@acme.test" };
    expect((await t.call("fia", "/email-settings/smtp", { ...body, port: 8080, password: "x" }, "PUT")).status).toBe(400);
    const bad = await t.call<{ error: string }>("fia", "/email-settings/smtp", { ...body, password: "wrong" }, "PUT");
    expect(bad.status).toBe(422);
    expect(bad.json.error).toContain("535");
    expect((await t.call<View>("fia", "/email-settings")).json.smtp).toBeNull();

    const ok = await t.call<View>("fia", "/email-settings/smtp", { ...body, password: "right-password" }, "PUT");
    expect(ok.json.mode).toBe("smtp");
    expect(JSON.stringify(ok.json)).not.toContain("right-password");
    expect(smtpSent.at(-1)).toMatchObject({ to: "fia@acme.test", from: '"Acme Studio LLP" <billing@acme.test>' });

    // Client emails now go through it, and the password is kept for next time.
    await t.call("fia", "/email-settings/test", {});
    expect(smtpSent.at(-1)!.subject).toBe("Test email from Acme Studio LLP");
  });

  it("falls back to Operant's address if the mail server fails, and says so", async () => {
    smtpDown = true;
    const before = platform.sent.length;
    const r = await t.call<{ sent: boolean; via: string }>("fia", "/email-settings/test", {});
    expect(r.json).toMatchObject({ sent: true, via: "platform" });
    expect(platform.sent.length).toBe(before + 1);
    expect((await t.call<View>("fia", "/email-settings")).json.lastError?.message).toContain("535");
    smtpDown = false;
  });

  it("goes back to the domain when the mail server is disconnected", async () => {
    const v = await t.call<View>("fia", "/email-settings/smtp", undefined, "DELETE");
    expect(v.json.mode).toBe("domain");
    const gone = await t.call<View>("fia", "/email-settings/domain", undefined, "DELETE");
    expect(gone.json.mode).toBe("platform");
  });
});
