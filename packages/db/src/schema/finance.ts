import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "@hephaestus/core";
import { orgs } from "./foundation.ts";

/*
 * Amounts are integer paise (bigint, read as JS numbers: safe up to ~₹90 lakh crore).
 * Quotes, invoices and credit notes share one table and line format.
 */

const id = () => uuid("id").primaryKey().$defaultFn(uuidv7);
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date());
const money = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);

export interface BankDetails {
  accountName?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  upiId?: string;
}

export const financeSettings = pgTable("finance_settings", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => orgs.id, { onDelete: "cascade" }),
  legalName: text("legal_name"),
  gstin: text("gstin"),
  pan: text("pan"),
  /** GST state code of the business, e.g. "27" (Maharashtra). */
  stateCode: text("state_code"),
  address: text("address"),
  email: text("email"),
  phone: text("phone"),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  quotePrefix: text("quote_prefix").notNull().default("QT"),
  creditNotePrefix: text("credit_note_prefix").notNull().default("CN"),
  defaultDueDays: integer("default_due_days").notNull().default(15),
  terms: text("terms"),
  notes: text("notes"),
  bank: jsonb("bank").$type<BankDetails>().notNull().default({}),
  roundOff: boolean("round_off").notNull().default(true),
  /** Razorpay keys; secrets are encrypted at rest and never returned to browsers. */
  razorpayKeyId: text("razorpay_key_id"),
  razorpayKeySecretEnc: text("razorpay_key_secret_enc"),
  razorpayWebhookSecretEnc: text("razorpay_webhook_secret_enc"),
  updatedAt: updatedAt(),
}).enableRLS();

export const clients = pgTable(
  "clients",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    gstin: text("gstin"),
    email: text("email"),
    phone: text("phone"),
    billingAddress: text("billing_address"),
    /** Place of supply (GST state code); null for clients abroad. */
    stateCode: text("state_code"),
    country: text("country").notNull().default("IN"),
    currency: text("currency").notNull().default("INR"),
    paymentTermsDays: integer("payment_terms_days"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clients_org_idx").on(t.orgId), uniqueIndex("clients_org_name_key").on(t.orgId, sql`lower(${t.name})`)],
).enableRLS();

export const clientContacts = pgTable(
  "client_contacts",
  {
    id: id(),
    orgId: orgId(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    designation: text("designation"),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [index("client_contacts_client_idx").on(t.clientId)],
).enableRLS();

export const taxRates = pgTable(
  "tax_rates",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    rate: numeric("rate", { precision: 5, scale: 2, mode: "number" }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("tax_rates_org_idx").on(t.orgId)],
).enableRLS();

export const items = pgTable(
  "items",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    description: text("description"),
    /** HSN (goods) or SAC (services) code. */
    hsnSac: text("hsn_sac"),
    unit: text("unit").notNull().default("unit"),
    unitPrice: money("unit_price"),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(18),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("items_org_idx").on(t.orgId)],
).enableRLS();

export const DOCUMENT_KINDS = ["quote", "invoice", "credit_note"] as const;
export const DOCUMENT_STATUSES = ["draft", "sent", "partially_paid", "paid", "accepted", "declined", "void"] as const;
export const SUPPLY_TYPES = ["intra", "inter", "export"] as const;

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    orgId: orgId(),
    kind: text("kind", { enum: DOCUMENT_KINDS }).notNull().default("invoice"),
    /** Assigned when issued, gap-free per financial year (e.g. INV/26-27/0001). */
    number: text("number"),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    projectId: uuid("project_id"),
    milestoneId: uuid("milestone_id"),
    /** Credit note → the invoice it adjusts; invoice → the quote it came from. */
    relatedId: uuid("related_id"),
    status: text("status", { enum: DOCUMENT_STATUSES }).notNull().default("draft"),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    currency: text("currency").notNull().default("INR"),
    placeOfSupply: text("place_of_supply"),
    supplyType: text("supply_type", { enum: SUPPLY_TYPES }).notNull().default("intra"),
    subtotal: money("subtotal"),
    discountTotal: money("discount_total"),
    taxableTotal: money("taxable_total"),
    cgst: money("cgst"),
    sgst: money("sgst"),
    igst: money("igst"),
    roundOff: money("round_off"),
    total: money("total"),
    amountPaid: money("amount_paid"),
    notes: text("notes"),
    terms: text("terms"),
    /** SHA-256 of the client-facing link token. */
    publicTokenHash: text("public_token_hash"),
    paymentLinkId: text("payment_link_id"),
    paymentLinkUrl: text("payment_link_url"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
    recurringId: uuid("recurring_id"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("invoices_org_kind_status_idx").on(t.orgId, t.kind, t.status),
    index("invoices_client_idx").on(t.clientId),
    index("invoices_project_idx").on(t.projectId),
    uniqueIndex("invoices_org_number_key").on(t.orgId, t.kind, t.number).where(sql`${t.number} is not null`),
    uniqueIndex("invoices_public_token_key").on(t.publicTokenHash).where(sql`${t.publicTokenHash} is not null`),
  ],
).enableRLS();

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    orgId: orgId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    itemId: uuid("item_id"),
    description: text("description").notNull(),
    hsnSac: text("hsn_sac"),
    quantity: numeric("quantity", { precision: 12, scale: 3, mode: "number" }).notNull(),
    unit: text("unit"),
    unitPrice: money("unit_price"),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    /** Taxable value of the line, after discount. */
    amount: money("amount"),
    taxAmount: money("tax_amount"),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId, t.position)],
).enableRLS();

export const PAYMENT_METHODS = ["bank_transfer", "upi", "cash", "cheque", "card", "razorpay", "credit_note", "other"] as const;

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orgId: orgId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    amount: money("amount"),
    method: text("method", { enum: PAYMENT_METHODS }).notNull(),
    paidOn: date("paid_on").notNull(),
    reference: text("reference"),
    notes: text("notes"),
    /** Gateway payment id (e.g. Razorpay pay_…); unique so webhooks can't double-count. */
    gatewayPaymentId: text("gateway_payment_id"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_org_paid_idx").on(t.orgId, t.paidOn),
    uniqueIndex("payments_gateway_key").on(t.orgId, t.gatewayPaymentId).where(sql`${t.gatewayPaymentId} is not null`),
  ],
).enableRLS();

export interface RecurringLine {
  itemId?: string | null;
  description: string;
  hsnSac?: string | null;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  discountPct?: number;
  taxRate: number;
}

export const RECURRING_FREQUENCIES = ["monthly", "quarterly", "yearly"] as const;

export const recurringInvoices = pgTable(
  "recurring_invoices",
  {
    id: id(),
    orgId: orgId(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    name: text("name").notNull(),
    frequency: text("frequency", { enum: RECURRING_FREQUENCIES }).notNull().default("monthly"),
    nextIssueDate: date("next_issue_date").notNull(),
    endDate: date("end_date"),
    dueDays: integer("due_days").notNull().default(15),
    lines: jsonb("lines").$type<RecurringLine[]>().notNull().default([]),
    notes: text("notes"),
    /** Issue and email automatically; otherwise a draft is created for review. */
    autoSend: boolean("auto_send").notNull().default(false),
    active: boolean("active").notNull().default(true),
    lastIssuedAt: timestamp("last_issued_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("recurring_invoices_due_idx").on(t.active, t.nextIssueDate)],
).enableRLS();
