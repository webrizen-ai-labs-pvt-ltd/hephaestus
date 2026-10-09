import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { EmailDomainRecord } from "@operant/core";
import { orgs } from "./foundation.ts";

export const EMAIL_MODES = ["platform", "domain", "smtp"] as const;

/**
 * How an organization's client emails are sent: from Operant's address with their name
 * (platform), from their own verified domain (domain), or through their mail server (smtp).
 */
export const orgEmailSettings = pgTable(
  "org_email_settings",
  {
    orgId: uuid("org_id")
      .primaryKey()
      .references(() => orgs.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: EMAIL_MODES }).notNull().default("platform"),
    /** Shown as the sender name; defaults to the legal or organization name. */
    fromName: text("from_name"),
    /** Where client replies go; defaults to the billing email. */
    replyTo: text("reply_to"),

    domainName: text("domain_name"),
    domainProviderId: text("domain_provider_id"),
    domainStatus: text("domain_status", { enum: ["pending", "verified", "failed"] }),
    domainRecords: jsonb("domain_records").$type<EmailDomainRecord[]>(),
    domainFromEmail: text("domain_from_email"),
    domainVerifiedAt: timestamp("domain_verified_at", { withTimezone: true }),

    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    smtpSecurity: text("smtp_security", { enum: ["ssl", "starttls"] }),
    smtpUsername: text("smtp_username"),
    /** Encrypted at rest; never returned to browsers. */
    smtpPasswordEnc: text("smtp_password_enc"),
    smtpFromEmail: text("smtp_from_email"),
    smtpVerifiedAt: timestamp("smtp_verified_at", { withTimezone: true }),

    /** The last time their own sending failed (and Operant's address was used instead). */
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  // A domain can only be claimed by one organization.
  (t) => [uniqueIndex("org_email_settings_domain_key").on(sql`lower(${t.domainName})`).where(sql`${t.domainName} is not null`)],
).enableRLS();
