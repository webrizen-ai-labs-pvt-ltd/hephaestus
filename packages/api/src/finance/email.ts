import type { Mailer, MailMessage } from "@operant/core";

/** What happened when we tried to email someone. */
export type MailResult = { sent: true } | { sent: false; reason: "not_configured" | "no_email" | "failed"; error?: string };

export const MAIL_REASON: Record<Exclude<MailResult, { sent: true }>["reason"], string> = {
  not_configured: "Email isn't set up for this workspace yet",
  no_email: "The client has no email address",
  failed: "The email service refused the message",
};

const BRAND = "#F46036";
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** "13 Oct 2026" */
export function mailDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * A plain, client-safe email: greeting, one lead sentence, a small summary table,
 * one button, and a sign-off. Inline styles only (email clients ignore stylesheets).
 */
export function renderEmail(opts: {
  greeting: string;
  lead: string;
  rows?: [string, string][];
  cta?: { label: string; href: string };
  signOff: string;
  footnote?: string;
}) {
  const rows = opts.rows ?? [];
  const html = `<div style="background:#f5f5f5;padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#181d27">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e9eaeb;border-radius:12px;overflow:hidden">
<div style="height:4px;background:${BRAND}"></div>
<div style="padding:28px 28px 8px">
<p style="margin:0 0 14px;font-size:15px">${esc(opts.greeting)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#414651">${esc(opts.lead)}</p>
${
  rows.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 22px;font-size:14px">${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:9px 0;border-top:1px solid #e9eaeb;color:#535862">${esc(k)}</td><td style="padding:9px 0;border-top:1px solid #e9eaeb;text-align:right;font-weight:600">${esc(v)}</td></tr>`,
        )
        .join("")}</table>`
    : ""
}
${
  opts.cta
    ? `<p style="margin:0 0 24px"><a href="${esc(opts.cta.href)}" style="display:inline-block;background:${BRAND};color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${esc(opts.cta.label)}</a></p>`
    : ""
}
<p style="margin:0 0 24px;font-size:15px;line-height:1.5">${esc(opts.signOff).replace(/\n/g, "<br>")}</p>
</div>
<div style="padding:14px 28px;border-top:1px solid #e9eaeb;color:#717680;font-size:12px">${esc(opts.footnote ?? "Sent with Operant by Webrizen")}</div>
</div></div>`;
  const text = [
    opts.greeting,
    "",
    opts.lead,
    ...(rows.length ? ["", ...rows.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(opts.cta ? ["", `${opts.cta.label}: ${opts.cta.href}`] : []),
    "",
    opts.signOff,
  ].join("\n");
  return { html, text };
}

/** Send, never throw: the caller decides what to tell the user. */
export async function deliver(mailer: Mailer, message: MailMessage): Promise<MailResult> {
  if (!mailer.enabled) {
    await mailer.send(message).catch(() => {}); // logs the email in development
    return { sent: false, reason: "not_configured" };
  }
  try {
    await mailer.send(message);
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`Email to ${message.to} failed:`, error);
    return { sent: false, reason: "failed", error };
  }
}
