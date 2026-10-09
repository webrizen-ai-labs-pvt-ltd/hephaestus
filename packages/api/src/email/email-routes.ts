import { can } from "@operant/core";
import { orgEmailSettings } from "@operant/db";
import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { audit } from "../audit.ts";
import type { AppEnv } from "../context.ts";
import { deliver, MAIL_REASON, renderEmail } from "../finance/email.ts";
import { forbid } from "../helpers.ts";
import { requirePermission } from "../middleware.ts";
import { validate } from "../validate.ts";
import { formatFrom, loadEmailSettings, orgSender, sendAsOrg } from "./org-mail.ts";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address"));
const domainName = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a domain like sharmaco.in");
/** The usual mail submission ports; anything else is almost always a mistake (or an attempt to reach something else). */
const SMTP_PORTS = [25, 465, 587, 2525] as const;

async function upsert(c: Context<AppEnv>, values: Partial<typeof orgEmailSettings.$inferInsert>) {
  const orgId = c.get("org").id;
  await c
    .get("deps")
    .db.insert(orgEmailSettings)
    .values({ orgId, ...values })
    .onConflictDoUpdate({ target: orgEmailSettings.orgId, set: values });
}

/** What the settings page needs; secrets never leave the server. */
async function view(c: Context<AppEnv>) {
  const deps = c.get("deps");
  const sender = await orgSender(deps, c.get("org").id);
  const s = sender.settings;
  return {
    mode: sender.own?.mode ?? "platform",
    chosenMode: s?.mode ?? "platform",
    fromName: s?.fromName ?? null,
    replyTo: s?.replyTo ?? null,
    defaults: { name: sender.name, replyTo: sender.replyTo },
    /** What clients see in the From line right now. */
    from: sender.own?.from ?? sender.platform.from,
    platform: { from: sender.platform.from, enabled: deps.mailer.enabled },
    domainsAvailable: Boolean(deps.emailDomains),
    smtpAvailable: Boolean(deps.smtp),
    domain: s?.domainName
      ? { name: s.domainName, fromEmail: s.domainFromEmail, status: s.domainStatus, records: s.domainRecords ?? [], verifiedAt: s.domainVerifiedAt }
      : null,
    smtp: s?.smtpHost
      ? { host: s.smtpHost, port: s.smtpPort, security: s.smtpSecurity, username: s.smtpUsername, fromEmail: s.smtpFromEmail, verifiedAt: s.smtpVerifiedAt }
      : null,
    lastError: s?.lastError ? { message: s.lastError, at: s.lastErrorAt } : null,
  };
}

export const emailRoutes = new Hono<AppEnv>()

  .get("/email-settings", async (c) => {
    const p = c.get("viewer")?.org?.permissions ?? {};
    if (!can(p, "settings", "manage") && !can(p, "invoice", "read")) forbid();
    return c.json(await view(c));
  })

  .patch(
    "/email-settings",
    requirePermission("settings", "manage"),
    validate(
      "json",
      z.object({
        fromName: z.string().trim().max(80).nullish(),
        replyTo: email.nullish().or(z.literal("").transform(() => null)),
        mode: z.enum(["platform", "domain", "smtp"]).optional(),
      }),
    ),
    async (c) => {
      const input = c.req.valid("json");
      const s = await loadEmailSettings(c.get("deps").db, c.get("org").id);
      if (input.mode === "domain" && s?.domainStatus !== "verified") throw new HTTPException(409, { message: "Verify your domain first" });
      if (input.mode === "smtp" && !s?.smtpVerifiedAt) throw new HTTPException(409, { message: "Connect your mail server first" });
      await upsert(c, { ...(input.fromName !== undefined ? { fromName: input.fromName || null } : {}), ...(input.replyTo !== undefined ? { replyTo: input.replyTo } : {}), ...(input.mode ? { mode: input.mode } : {}) });
      await audit(c, "email.settings_updated", { type: "org", id: c.get("org").id }, { fields: Object.keys(input), mode: input.mode });
      return c.json(await view(c));
    },
  )

  /* ---------------- Your domain ---------------- */

  .post(
    "/email-settings/domain",
    requirePermission("settings", "manage"),
    validate("json", z.object({ domain: domainName, fromEmail: email })),
    async (c) => {
      const { emailDomains, db } = c.get("deps");
      if (!emailDomains) throw new HTTPException(501, { message: "Sending from your own domain isn't available here. Use your mail server instead." });
      const { domain, fromEmail } = c.req.valid("json");
      if (!fromEmail.endsWith(`@${domain}`)) throw new HTTPException(422, { message: `The sending address must be on ${domain}` });
      const s = await loadEmailSettings(db, c.get("org").id);
      if (s?.domainProviderId) throw new HTTPException(409, { message: "Remove your current domain first" });

      let created;
      try {
        created = await emailDomains.create(domain);
      } catch (err) {
        throw new HTTPException(422, { message: `Couldn't add ${domain}: ${err instanceof Error ? err.message : String(err)}` });
      }
      try {
        await upsert(c, { domainName: domain, domainProviderId: created.id, domainStatus: created.status, domainRecords: created.records, domainFromEmail: fromEmail, domainVerifiedAt: created.status === "verified" ? new Date() : null });
      } catch (err) {
        // Another organization already claimed this domain.
        await emailDomains.remove(created.id).catch(() => {});
        if ((err as { cause?: { code?: string } })?.cause?.code === "23505" || (err as { code?: string })?.code === "23505") {
          throw new HTTPException(409, { message: `${domain} is already used by another organization` });
        }
        throw err;
      }
      await audit(c, "email.domain_added", { type: "org", id: c.get("org").id }, { domain });
      return c.json(await view(c), 201);
    },
  )

  /** Look for the DNS records again. Switches to the domain once it's verified. */
  .post("/email-settings/domain/verify", requirePermission("settings", "manage"), async (c) => {
    const { emailDomains, db } = c.get("deps");
    const s = await loadEmailSettings(db, c.get("org").id);
    if (!emailDomains || !s?.domainProviderId) throw new HTTPException(404, { message: "Add a domain first" });
    let d;
    try {
      d = await emailDomains.verify(s.domainProviderId);
    } catch (err) {
      throw new HTTPException(502, { message: `The email service couldn't check: ${err instanceof Error ? err.message : String(err)}` });
    }
    const newlyVerified = d.status === "verified" && s.domainStatus !== "verified";
    await upsert(c, {
      domainStatus: d.status,
      domainRecords: d.records,
      domainVerifiedAt: d.status === "verified" ? (s.domainVerifiedAt ?? new Date()) : null,
      ...(newlyVerified && s.mode === "platform" ? { mode: "domain" as const, lastError: null, lastErrorAt: null } : {}),
    });
    if (newlyVerified) await audit(c, "email.domain_verified", { type: "org", id: c.get("org").id }, { domain: s.domainName });
    return c.json(await view(c));
  })

  .delete("/email-settings/domain", requirePermission("settings", "manage"), async (c) => {
    const { emailDomains, db } = c.get("deps");
    const s = await loadEmailSettings(db, c.get("org").id);
    if (s?.domainProviderId && emailDomains) await emailDomains.remove(s.domainProviderId).catch(() => {});
    await upsert(c, {
      domainName: null,
      domainProviderId: null,
      domainStatus: null,
      domainRecords: null,
      domainFromEmail: null,
      domainVerifiedAt: null,
      ...(s?.mode === "domain" ? { mode: "platform" as const } : {}),
    });
    await audit(c, "email.domain_removed", { type: "org", id: c.get("org").id }, { domain: s?.domainName });
    return c.json(await view(c));
  })

  /* ---------------- Your mail server ---------------- */

  /** Saved only after a test email goes through it, so a typo never takes over sending. */
  .put(
    "/email-settings/smtp",
    requirePermission("settings", "manage"),
    validate(
      "json",
      z.object({
        host: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter the server name, like smtp.gmail.com"),
        port: z.number().int().refine((p) => (SMTP_PORTS as readonly number[]).includes(p), "Use port 465, 587, 25 or 2525"),
        security: z.enum(["ssl", "starttls"]),
        username: z.string().trim().min(1, "Enter the username").max(254),
        /** Leave out to keep the saved password. */
        password: z.string().min(1).max(500).optional(),
        fromEmail: email,
      }),
    ),
    async (c) => {
      const deps = c.get("deps");
      if (!deps.smtp) throw new HTTPException(501, { message: "Connecting a mail server isn't available here." });
      const input = c.req.valid("json");
      const s = await loadEmailSettings(deps.db, c.get("org").id);
      const password = input.password ?? (s?.smtpPasswordEnc ? await deps.secrets.decrypt(s.smtpPasswordEnc) : null);
      if (!password) throw new HTTPException(422, { message: "Enter the password (or app password)" });

      const viewer = c.get("viewer")!;
      if (!viewer.email) throw new HTTPException(422, { message: "Your account has no email address to send the test to" });
      const sender = await orgSender(deps, c.get("org").id);
      const { html, text } = renderEmail({
        greeting: "Hello,",
        lead: `This test came through ${input.host} as ${input.fromEmail}. From now on, ${sender.name}'s emails to clients are sent this way.`,
        signOff: "Operant",
      });
      const mailer = deps.smtp({ host: input.host, port: input.port, security: input.security, username: input.username, password });
      const result = await deliver(mailer, { to: viewer.email, subject: `Mail server connected for ${sender.name}`, html, text, from: formatFrom(sender.name, input.fromEmail) });
      if (!result.sent) {
        throw new HTTPException(422, { message: `Your mail server didn't accept the test email: ${result.reason === "failed" ? result.error : MAIL_REASON[result.reason]}` });
      }
      await upsert(c, {
        smtpHost: input.host,
        smtpPort: input.port,
        smtpSecurity: input.security,
        smtpUsername: input.username,
        smtpPasswordEnc: await deps.secrets.encrypt(password),
        smtpFromEmail: input.fromEmail,
        smtpVerifiedAt: new Date(),
        mode: "smtp",
        lastError: null,
        lastErrorAt: null,
      });
      await audit(c, "email.smtp_connected", { type: "org", id: c.get("org").id }, { host: input.host, from: input.fromEmail });
      return c.json(await view(c));
    },
  )

  .delete("/email-settings/smtp", requirePermission("settings", "manage"), async (c) => {
    const s = await loadEmailSettings(c.get("deps").db, c.get("org").id);
    await upsert(c, {
      smtpHost: null,
      smtpPort: null,
      smtpSecurity: null,
      smtpUsername: null,
      smtpPasswordEnc: null,
      smtpFromEmail: null,
      smtpVerifiedAt: null,
      ...(s?.mode === "smtp" ? { mode: s.domainStatus === "verified" ? ("domain" as const) : ("platform" as const) } : {}),
    });
    await audit(c, "email.smtp_disconnected", { type: "org", id: c.get("org").id });
    return c.json(await view(c));
  })

  /** Send a test email to yourself, the way clients' emails go right now. */
  .post("/email-settings/test", requirePermission("settings", "manage"), async (c) => {
    const deps = c.get("deps");
    const viewer = c.get("viewer")!;
    if (!viewer.email) throw new HTTPException(422, { message: "Your account has no email address to send the test to" });
    const sender = await orgSender(deps, c.get("org").id);
    const { html, text } = renderEmail({
      greeting: "Hello,",
      lead: `This is how ${sender.name}'s emails reach clients: invoices, reminders and portal messages come from this sender, and replies go to ${sender.replyTo ?? "the sender"}.`,
      signOff: sender.name,
    });
    const result = await sendAsOrg(deps, c.get("org").id, { to: viewer.email, subject: `Test email from ${sender.name}`, html, text });
    return c.json({ to: viewer.email, sent: result.sent, via: result.via, message: result.sent ? null : MAIL_REASON[result.reason] + (result.error ? `: ${result.error}` : "") });
  });
