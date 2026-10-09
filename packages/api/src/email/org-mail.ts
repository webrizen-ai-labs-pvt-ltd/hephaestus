import type { MailMessage } from "@operant/core";
import { type Db, financeSettings, orgEmailSettings, orgs } from "@operant/db";
import { eq } from "drizzle-orm";
import type { ApiDeps } from "../context.ts";
import { deliver, type MailResult } from "../finance/email.ts";

/*
 * Client emails (invoices, reminders, portal messages and codes) go out in the
 * organization's name. Depending on its email settings they're sent:
 *   platform: from Operant's address, with the organization's name and reply-to;
 *   domain:   from an address on the organization's own, verified domain;
 *   smtp:     through the organization's own mail server.
 * If their own setup fails, the email still goes, from Operant's address, and the
 * failure is recorded so Settings → Email can show it.
 */

export type OrgEmailSettings = typeof orgEmailSettings.$inferSelect;

export async function loadEmailSettings(db: Db, orgId: string): Promise<OrgEmailSettings | null> {
  const [row] = await db.select().from(orgEmailSettings).where(eq(orgEmailSettings.orgId, orgId));
  return row ?? null;
}

/** "Operant <no-reply@webrizen.com>" → "no-reply@webrizen.com". */
export function platformAddress(deps: ApiDeps) {
  const from = deps.mailer.from ?? "";
  return from.match(/<([^>]+)>/)?.[1] ?? (from.includes("@") ? from.trim() : "no-reply@operant.local");
}

/** A display name that's safe inside a From header. */
export const formatFrom = (name: string, address: string) => `"${name.replace(/["\\\r\n<>]/g, "").trim().slice(0, 80)}" <${address}>`;

/** Who the organization's emails come from, and where replies go, as things stand. */
export async function orgSender(deps: ApiDeps, orgId: string) {
  const { db } = deps;
  const s = await loadEmailSettings(db, orgId);
  const [fin] = await db.select({ legalName: financeSettings.legalName, email: financeSettings.email }).from(financeSettings).where(eq(financeSettings.orgId, orgId));
  const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId));
  const name = s?.fromName || fin?.legalName || org?.name || "Operant";
  const replyTo = s?.replyTo || fin?.email || null;
  const platform = { mode: "platform" as const, from: formatFrom(name, platformAddress(deps)), address: platformAddress(deps) };

  if (s?.mode === "smtp" && s.smtpVerifiedAt && s.smtpHost && s.smtpPort && s.smtpUsername && s.smtpPasswordEnc && s.smtpFromEmail && deps.smtp) {
    return { name, replyTo, platform, own: { mode: "smtp" as const, from: formatFrom(name, s.smtpFromEmail), address: s.smtpFromEmail }, settings: s };
  }
  if (s?.mode === "domain" && s.domainStatus === "verified" && s.domainFromEmail) {
    return { name, replyTo, platform, own: { mode: "domain" as const, from: formatFrom(name, s.domainFromEmail), address: s.domainFromEmail }, settings: s };
  }
  return { name, replyTo, platform, own: null, settings: s };
}

/** Send a client email as the organization. Never throws. */
export async function sendAsOrg(deps: ApiDeps, orgId: string, message: MailMessage): Promise<MailResult & { via?: "platform" | "domain" | "smtp" }> {
  const sender = await orgSender(deps, orgId);
  // The organization's own reply-to setting wins over whatever the caller suggests.
  const msg = { ...message, replyTo: sender.replyTo ?? message.replyTo };

  if (sender.own?.mode === "smtp") {
    const s = sender.settings!;
    const mailer = deps.smtp!({
      host: s.smtpHost!,
      port: s.smtpPort!,
      security: s.smtpSecurity ?? "starttls",
      username: s.smtpUsername!,
      password: await deps.secrets.decrypt(s.smtpPasswordEnc!),
    });
    const result = await deliver(mailer, { ...msg, from: sender.own.from });
    if (result.sent) return { ...result, via: "smtp" };
    await recordFailure(deps.db, orgId, `Your mail server: ${result.reason === "failed" ? result.error : result.reason}`);
    // Fall through: better from Operant's address than not at all.
  } else if (sender.own?.mode === "domain") {
    const result = await deliver(deps.mailer, { ...msg, from: sender.own.from });
    if (result.sent || result.reason === "not_configured") return { ...result, via: "domain" };
    await recordFailure(deps.db, orgId, `Your domain: ${result.error ?? "sending failed"}`);
  }
  const result = await deliver(deps.mailer, { ...msg, from: sender.platform.from });
  return { ...result, via: "platform" };
}

async function recordFailure(db: Db, orgId: string, error: string) {
  await db.update(orgEmailSettings).set({ lastError: error.slice(0, 500), lastErrorAt: new Date() }).where(eq(orgEmailSettings.orgId, orgId));
}
