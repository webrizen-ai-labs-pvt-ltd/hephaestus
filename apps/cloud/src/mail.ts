import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { EmailDomain, EmailDomainRecord, EmailDomains, Mailer, MailMessage, SmtpConfig } from "@operant/core";
import nodemailer from "nodemailer";

/** Transactional email through Resend's HTTP API. */
export class ResendMailer implements Mailer {
  readonly enabled = true;

  constructor(
    private readonly apiKey: string,
    readonly from: string,
  ) {}

  async send(m: MailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: m.from ?? this.from, to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

/* ---------------- Sending domains (Resend) ---------------- */

type ResendDomain = {
  id: string;
  name: string;
  status: string;
  records?: { record: string; name: string; type: string; value: string; ttl?: string; status?: string; priority?: number }[];
};

const toDomain = (d: ResendDomain): EmailDomain => ({
  id: d.id,
  name: d.name,
  status: d.status === "verified" ? "verified" : d.status === "failed" ? "failed" : "pending",
  records: (d.records ?? []).map(
    (r): EmailDomainRecord => ({ purpose: r.record, type: r.type, name: r.name, value: r.value, ttl: r.ttl, status: r.status, ...(r.priority != null ? { priority: r.priority } : {}) }),
  ),
});

/** Organizations' own sending domains, verified with DNS records, on the platform's Resend account. */
export class ResendDomains implements EmailDomains {
  constructor(private readonly apiKey: string) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://api.resend.com${path}`, {
      ...init,
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", ...init.headers },
    });
    const body = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) throw new Error(body.message ?? `Resend ${res.status}`);
    return body;
  }

  async create(name: string) {
    return toDomain(await this.call<ResendDomain>("/domains", { method: "POST", body: JSON.stringify({ name }) }));
  }
  async get(id: string) {
    return toDomain(await this.call<ResendDomain>(`/domains/${encodeURIComponent(id)}`));
  }
  async verify(id: string) {
    await this.call(`/domains/${encodeURIComponent(id)}/verify`, { method: "POST" });
    return this.get(id);
  }
  async remove(id: string) {
    await this.call(`/domains/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}

/* ---------------- An organization's own mail server ---------------- */

/** Addresses a customer-supplied SMTP host must never point at (the server's own network). */
export function isPrivateAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

/**
 * Sends through the organization's SMTP server. The host is resolved once and checked, and
 * the connection goes to that checked address (TLS still verifies the real host name), so a
 * hostname can't be used to reach the server's own network.
 */
export function smtpMailer(cfg: SmtpConfig): Mailer {
  return {
    enabled: true,
    async send(m: MailMessage) {
      const addresses = await lookup(cfg.host, { all: true }).catch(() => {
        throw new Error(`Couldn't find the mail server ${cfg.host}`);
      });
      const target = addresses.find((a) => !isPrivateAddress(a.address));
      if (!target || addresses.some((a) => isPrivateAddress(a.address))) throw new Error(`${cfg.host} points to a private address`);
      const transport = nodemailer.createTransport({
        host: target.address,
        port: cfg.port,
        secure: cfg.security === "ssl",
        requireTLS: cfg.security === "starttls",
        auth: { user: cfg.username, pass: cfg.password },
        tls: { servername: cfg.host },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      try {
        await transport.sendMail({ from: m.from, to: m.to, subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { replyTo: m.replyTo } : {}) });
      } finally {
        transport.close();
      }
    },
  };
}
