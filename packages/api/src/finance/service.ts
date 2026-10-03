import {
  addDays,
  computeTotals,
  documentNumber,
  formatMoney,
  supplyTypeFor,
  type SupplyType,
} from "@hephaestus/core";
import {
  clients,
  type Db,
  financeSettings,
  invoiceLines,
  invoices,
  orgSettings,
  orgs,
  payments,
  recurringInvoices,
  type RecurringLine,
} from "@hephaestus/db";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { ApiDeps } from "../context.ts";
import { nextSequence } from "../helpers.ts";
import { sha256Hex } from "../secrets.ts";
import { deliver, mailDate, type MailResult, renderEmail } from "./email.ts";

export type Settings = typeof financeSettings.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type LineIn = RecurringLine;

export async function loadSettings(db: Db, orgId: string): Promise<Settings> {
  const [s] = await db.select().from(financeSettings).where(eq(financeSettings.orgId, orgId));
  if (s) return s;
  const [created] = await db.insert(financeSettings).values({ orgId }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(financeSettings).where(eq(financeSettings.orgId, orgId)))[0]!;
}

export async function loadClient(db: Db, orgId: string, clientId: string) {
  const [c] = await db.select().from(clients).where(and(eq(clients.orgId, orgId), eq(clients.id, clientId)));
  if (!c) throw new HTTPException(422, { message: "Unknown client" });
  return c;
}

/** Supply type and place of supply for a client, from the seller's state. */
export function placeOfSupplyFor(settings: Settings, client: typeof clients.$inferSelect) {
  const supplyType: SupplyType = supplyTypeFor(settings.stateCode, client.stateCode, client.country);
  return { supplyType, placeOfSupply: supplyType === "export" ? null : (client.stateCode ?? settings.stateCode) };
}

/** Replace a document's lines and recompute its totals (server is the source of truth). */
/**
 * Store a document's lines and totals. A seller without a GSTIN isn't GST-registered and can't charge
 * GST, so their lines are always saved at 0%.
 */
export async function writeLines(
  db: Db,
  orgId: string,
  invoiceId: string,
  input: LineIn[],
  supplyType: SupplyType,
  seller: { roundOff: boolean; gstin: string | null },
) {
  const roundOff = seller.roundOff;
  const lines = seller.gstin ? input : input.map((l) => ({ ...l, taxRate: 0 }));
  const totals = computeTotals(
    lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct ?? 0, taxRate: l.taxRate })),
    supplyType,
    { roundOff },
  );
  await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  if (lines.length) {
    await db.insert(invoiceLines).values(
      lines.map((l, i) => ({
        orgId,
        invoiceId,
        position: i,
        itemId: l.itemId ?? null,
        description: l.description,
        hsnSac: l.hsnSac ?? null,
        quantity: l.quantity,
        unit: l.unit ?? null,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct ?? 0,
        taxRate: supplyType === "export" ? 0 : l.taxRate,
        amount: totals.lines[i]!.taxable,
        taxAmount: totals.lines[i]!.tax,
      })),
    );
  }
  await db
    .update(invoices)
    .set({
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxableTotal: totals.taxableTotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      roundOff: totals.roundOff,
      total: totals.total,
    })
    .where(eq(invoices.id, invoiceId));
  return totals;
}

const PREFIX = { quote: "quotePrefix", invoice: "invoicePrefix", credit_note: "creditNotePrefix" } as const;

/** The client-facing link token for a document: stable, so every email carries the same link. */
export const linkToken = (deps: ApiDeps, invoiceId: string) => deps.secrets.sign(`invoice-link:${invoiceId}`);

/**
 * Issue a draft: give it its gap-free number for the financial year and
 * enable its client link. Returns the link token (only its hash is stored).
 */
export async function issue(deps: ApiDeps, inv: Invoice, settings: Settings) {
  const { db } = deps;
  if (inv.status !== "draft") throw new HTTPException(409, { message: "This document has already been issued" });
  if (inv.total <= 0 && inv.kind !== "credit_note") throw new HTTPException(422, { message: "Add at least one line with an amount" });
  const fy = documentNumber("X", inv.issueDate, 1).split("/")[1]!;
  const seq = await nextSequence(db, inv.orgId, `${inv.kind}:${fy}`);
  const number = documentNumber(settings[PREFIX[inv.kind]], inv.issueDate, seq);
  const token = await linkToken(deps, inv.id);
  await db
    .update(invoices)
    .set({ number, status: "sent", sentAt: new Date(), publicTokenHash: await sha256Hex(token) })
    .where(eq(invoices.id, inv.id));
  return { number, token };
}

/** Recalculate amount paid and status from the payments that aren't voided. */
export async function refreshPaid(db: Db, invoiceId: string) {
  const [row] = await db
    .select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), isNull(payments.voidedAt)));
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv || inv.status === "void" || inv.status === "draft") return;
  const paid = row?.paid ?? 0;
  const status = paid >= inv.total ? "paid" : paid > 0 ? "partially_paid" : "sent";
  await db
    .update(invoices)
    .set({ amountPaid: paid, status, paidAt: status === "paid" ? (inv.paidAt ?? new Date()) : null })
    .where(eq(invoices.id, invoiceId));
}

export const docLabel = (kind: Invoice["kind"]) => ({ quote: "Quote", invoice: "Invoice", credit_note: "Credit note" })[kind];

/**
 * Email the client a link to the document. Replies go to the business's own address.
 * Never throws: returns what happened so the caller can tell the user.
 */
export async function emailClient(deps: ApiDeps, settings: Settings, orgName: string, inv: Invoice, token: string, kind: "issued" | "reminder"): Promise<MailResult> {
  const [client] = await deps.db.select().from(clients).where(eq(clients.id, inv.clientId));
  if (!client?.email) return { sent: false, reason: "no_email" };
  const seller = settings.legalName ?? orgName;
  const link = `${deps.appUrl.replace(/\/$/, "")}/i/${token}`;
  const label = docLabel(inv.kind);
  const balance = formatMoney(inv.total - inv.amountPaid, inv.currency);
  const overdue = kind === "reminder" && inv.dueDate && inv.dueDate < new Date().toISOString().slice(0, 10);
  const subject = kind === "reminder" ? `Reminder: ${label.toLowerCase()} ${inv.number} for ${balance} ${overdue ? "is overdue" : "is due"}` : `${label} ${inv.number} from ${seller}`;
  const lead =
    kind === "reminder"
      ? `A friendly reminder that ${label.toLowerCase()} ${inv.number} ${overdue ? `was due on ${mailDate(inv.dueDate)}` : `is due on ${mailDate(inv.dueDate)}`}. If you've already paid, thank you, and please ignore this email.`
      : `${seller} has sent you ${label.toLowerCase()} ${inv.number}.${inv.kind === "invoice" ? " You can view it and pay online using the button below." : ""}`;
  const rows: [string, string][] = [
    [label, inv.number ?? "Draft"],
    ["Date", mailDate(inv.issueDate)],
    ...(inv.dueDate && inv.kind !== "credit_note" ? [[inv.kind === "quote" ? "Valid until" : "Due", mailDate(inv.dueDate)] as [string, string]] : []),
    [kind === "reminder" || inv.amountPaid ? "Balance due" : "Amount", kind === "reminder" || inv.amountPaid ? balance : formatMoney(inv.total, inv.currency)],
  ];
  const { html, text } = renderEmail({
    greeting: `Hello ${client.name},`,
    lead,
    rows,
    cta: { label: `View ${label.toLowerCase()}${inv.kind === "invoice" ? " and pay" : ""}`, href: link },
    signOff: `Thank you,\n${seller}`,
    footnote: settings.email ? `Questions? Just reply to this email to reach ${seller}.` : undefined,
  });
  return deliver(deps.mailer, { to: client.email, subject, html, text, replyTo: settings.email });
}

/* ---------------- Razorpay ---------------- */

/** Creates (or reuses) a Razorpay payment link for the invoice's balance. */
export async function createPaymentLink(deps: ApiDeps, inv: Invoice, settings: Settings) {
  if (!settings.razorpayKeyId || !settings.razorpayKeySecretEnc) {
    throw new HTTPException(422, { message: "Connect Razorpay in Finance settings first" });
  }
  if (inv.kind !== "invoice" || inv.status === "draft" || inv.status === "void" || inv.status === "paid") {
    throw new HTTPException(409, { message: "Payment links are for issued, unpaid invoices" });
  }
  const balance = inv.total - inv.amountPaid;
  const [client] = await deps.db.select().from(clients).where(eq(clients.id, inv.clientId));
  const secret = await deps.secrets.decrypt(settings.razorpayKeySecretEnc);
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${settings.razorpayKeyId}:${secret}`).toString("base64")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: balance,
      currency: inv.currency,
      accept_partial: false,
      reference_id: `${inv.number}-${Date.now().toString(36)}`.slice(0, 40),
      description: `${docLabel(inv.kind)} ${inv.number}`,
      customer: { name: client?.name, ...(client?.email ? { email: client.email } : {}), ...(client?.phone ? { contact: client.phone } : {}) },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { invoice_id: inv.id, org_id: inv.orgId },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; short_url?: string; error?: { description?: string } };
  if (!res.ok || !body.id || !body.short_url) {
    throw new HTTPException(502, { message: `Razorpay: ${body.error?.description ?? `request failed (${res.status})`}` });
  }
  await deps.db.update(invoices).set({ paymentLinkId: body.id, paymentLinkUrl: body.short_url }).where(eq(invoices.id, inv.id));
  return body.short_url;
}

/* ---------------- Scheduled jobs ---------------- */

function nextDate(date: string, frequency: "monthly" | "quarterly" | "yearly") {
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[frequency];
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

/** Issues one period of a retainer. Returns false if another worker already claimed it. */
async function issueRetainerPeriod(deps: ApiDeps, orgId: string, r: typeof recurringInvoices.$inferSelect) {
  const { db } = deps;
  // Claim the period atomically, so two workers can't issue it twice.
  const issueDate = r.nextIssueDate;
  const next = nextDate(issueDate, r.frequency);
  const [claimed] = await db
    .update(recurringInvoices)
    .set({ nextIssueDate: next, lastIssuedAt: new Date(), active: !(r.endDate && next > r.endDate) })
    .where(and(eq(recurringInvoices.id, r.id), eq(recurringInvoices.nextIssueDate, issueDate)))
    .returning();
  if (!claimed) return false;

  const settings = await loadSettings(db, orgId);
  const client = await loadClient(db, orgId, r.clientId);
  const pos = placeOfSupplyFor(settings, client);
  const [inv] = await db
    .insert(invoices)
    .values({
      orgId,
      kind: "invoice",
      clientId: r.clientId,
      projectId: r.projectId,
      issueDate,
      dueDate: addDays(issueDate, r.dueDays),
      currency: client.currency,
      ...pos,
      notes: r.notes,
      terms: settings.terms,
      recurringId: r.id,
      createdBy: "system",
    })
    .returning();
  await writeLines(db, orgId, inv!.id, r.lines, pos.supplyType, settings);

  if (r.autoSend) {
    const [fresh] = await db.select().from(invoices).where(eq(invoices.id, inv!.id));
    const { token } = await issue(deps, fresh!, settings);
    const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId));
    const [sent] = await db.select().from(invoices).where(eq(invoices.id, inv!.id));
    const mail = await emailClient(deps, settings, org!.name, sent!, token, "issued");
    if (!mail.sent && mail.reason === "failed") console.error("Retainer email failed", mail.error);
  }
  return true;
}

/** Creates invoices for every retainer that's due, catching up on missed periods. Idempotent. */
export async function generateDueRecurring(deps: ApiDeps, orgId: string, today: string) {
  let created = 0;
  // Each pass issues one period per retainer; repeat until caught up (capped at 3 years).
  for (let pass = 0; pass < 36; pass++) {
    const due = await deps.db
      .select()
      .from(recurringInvoices)
      .where(and(eq(recurringInvoices.orgId, orgId), eq(recurringInvoices.active, true), lte(recurringInvoices.nextIssueDate, today)));
    if (!due.length) break;
    for (const r of due) if (await issueRetainerPeriod(deps, orgId, r)) created++;
  }
  return created;
}

/** Emails clients about overdue invoices: 1 day after due, then weekly. */
export async function sendDueReminders(deps: ApiDeps, orgId: string, today: string) {
  if (!deps.mailer.enabled) return 0;
  const { db } = deps;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const overdue = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.orgId, orgId),
        eq(invoices.kind, "invoice"),
        inArray(invoices.status, ["sent", "partially_paid"]),
        sql`${invoices.dueDate} < ${today}`,
        or(isNull(invoices.lastReminderAt), lte(invoices.lastReminderAt, weekAgo)),
      ),
    )
    .orderBy(asc(invoices.dueDate))
    .limit(200);
  const settings = await loadSettings(db, orgId);
  const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId));
  let sent = 0;
  for (const inv of overdue) {
    const token = await linkToken(deps, inv.id);
    if ((await emailClient(deps, settings, org!.name, inv, token, "reminder")).sent) {
      await db.update(invoices).set({ lastReminderAt: new Date() }).where(eq(invoices.id, inv.id));
      sent++;
    }
  }
  return sent;
}

/** All finance jobs for every org (cron in the cloud, a timer in the offline edition). */
export async function runFinanceJobs(deps: ApiDeps, now = new Date()) {
  const rows = await deps.db.select({ id: orgs.id, tz: orgSettings.timezone }).from(orgs).leftJoin(orgSettings, eq(orgSettings.orgId, orgs.id));
  let created = 0;
  let reminded = 0;
  for (const o of rows) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: o.tz ?? "Asia/Kolkata" }).format(now);
    created += await generateDueRecurring(deps, o.id, today);
    reminded += await sendDueReminders(deps, o.id, today);
  }
  return { created, reminded };
}
