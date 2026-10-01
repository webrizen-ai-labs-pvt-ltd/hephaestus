import type { Mailer, MailMessage } from "@hephaestus/core";

/** Transactional email through Resend's HTTP API. */
export class ResendMailer implements Mailer {
  readonly enabled = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(m: MailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}
