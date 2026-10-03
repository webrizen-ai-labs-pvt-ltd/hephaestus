import { addDays, emiSchedule, formatMoney, type InstallmentFrequency } from "@hephaestus/core";
import { clients, type Db, installmentPlans, installments, invoiceLines, invoices, orgs, payments } from "@hephaestus/db";
import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { ApiDeps } from "../context.ts";
import { deliver, mailDate, type MailResult, renderEmail } from "./email.ts";
import { type Invoice, issue, linkToken, loadSettings, refreshPaid, type Settings, writeLines } from "./service.ts";

/*
 * Instalment plans (EMI). An issued invoice's balance is repaid in equal instalments with
 * reducing-balance interest. The invoice itself is never changed (it's a tax record): each
 * instalment's interest is billed on its own GST invoice when the instalment falls due, and
 * every instalment payment is split between that interest invoice and the original invoice.
 */

export type Plan = typeof installmentPlans.$inferSelect;
export type Installment = typeof installments.$inferSelect;

/** Instalments are billed (interest invoice issued, client emailed) this many days before they fall due. */
export const BILL_AHEAD_DAYS = 7;

const OPEN = ["sent", "partially_paid"] as const;

export async function activePlan(db: Db, invoiceId: string) {
  const [plan] = await db
    .select()
    .from(installmentPlans)
    .where(and(eq(installmentPlans.invoiceId, invoiceId), eq(installmentPlans.status, "active")));
  return plan ?? null;
}

/** The instalment whose interest an invoice bills, if it is an interest invoice. */
export async function installmentForInterestInvoice(db: Db, invoiceId: string) {
  const [row] = await db.select().from(installments).where(eq(installments.interestInvoiceId, invoiceId));
  return row ?? null;
}

/** Refuse invoice-level money actions on invoices that are paid through a plan. */
export async function assertNotOnPlan(db: Db, inv: Invoice, hint: string) {
  if (await activePlan(db, inv.id)) throw new HTTPException(409, { message: `This invoice is being paid in instalments. ${hint}` });
  const inst = await installmentForInterestInvoice(db, inv.id);
  if (inst && inst.status !== "cancelled") {
    throw new HTTPException(409, { message: `This invoice bills the interest for instalment ${inst.seq}, so it's handled from the instalment schedule on the original invoice.` });
  }
}

/** What an instalment costs the client: principal plus the interest invoice (interest + GST). */
async function amounts(db: Db, inst: Installment, plan: Plan) {
  let interestTotal: number;
  let interestPaid = 0;
  if (inst.interestInvoiceId) {
    const [ii] = await db.select({ total: invoices.total, paid: invoices.amountPaid }).from(invoices).where(eq(invoices.id, inst.interestInvoiceId));
    interestTotal = ii?.total ?? 0;
    interestPaid = ii?.paid ?? 0;
  } else {
    // Not billed yet: an estimate (the issued invoice may round off).
    interestTotal = inst.interest + Math.round((inst.interest * plan.interestTaxRate) / 100);
  }
  const total = inst.principal + interestTotal;
  return { interestTotal, interestPaid, total, due: Math.max(0, total - inst.amountPaid) };
}

/** The schedule as the UI and the client page show it. */
export async function planView(db: Db, invoiceId: string) {
  const [plan] = await db
    .select()
    .from(installmentPlans)
    .where(and(eq(installmentPlans.invoiceId, invoiceId), ne(installmentPlans.status, "cancelled")));
  if (!plan) return null;
  const rows = await db.select().from(installments).where(eq(installments.planId, plan.id)).orderBy(asc(installments.seq));
  const interestIds = rows.map((r) => r.interestInvoiceId).filter((x): x is string => Boolean(x));
  const interestInvoices = interestIds.length
    ? await db.select({ id: invoices.id, number: invoices.number, total: invoices.total, amountPaid: invoices.amountPaid, taxableTotal: invoices.taxableTotal }).from(invoices).where(inArray(invoices.id, interestIds))
    : [];
  const byId = new Map(interestInvoices.map((i) => [i.id, i]));
  const items = rows.map((r) => {
    const ii = r.interestInvoiceId ? byId.get(r.interestInvoiceId) : undefined;
    const interestTotal = ii ? ii.total : r.interest + Math.round((r.interest * plan.interestTaxRate) / 100);
    const total = r.principal + interestTotal;
    return {
      id: r.id,
      seq: r.seq,
      dueDate: r.dueDate,
      principal: r.principal,
      interest: r.interest,
      /** GST and round-off on the interest. */
      interestTax: interestTotal - r.interest,
      total,
      amountPaid: r.amountPaid,
      status: r.status,
      billedAt: r.billedAt,
      paidAt: r.paidAt,
      paymentLinkUrl: r.paymentLinkUrl,
      interestInvoice: ii ? { id: ii.id, number: ii.number } : null,
    };
  });
  const { emi } = emiSchedule({ principal: plan.principal, annualRatePct: plan.annualRate, count: plan.count, frequency: plan.frequency, firstDueDate: plan.firstDueDate });
  return {
    plan: { id: plan.id, principal: plan.principal, annualRate: plan.annualRate, count: plan.count, frequency: plan.frequency, interestTaxRate: plan.interestTaxRate, status: plan.status, createdAt: plan.createdAt, emi },
    installments: items,
  };
}

/**
 * When an invoice's money is next due: its next unpaid instalment while a plan is active,
 * otherwise its own due date. The invoice itself keeps the due date it was issued with.
 */
// Qualified by hand: Drizzle leaves columns unqualified in single-table selects, which the subquery would misread.
export const effectiveDueDate = sql<string | null>`coalesce((select min(i.due_date) from installments i join installment_plans ip on ip.id = i.plan_id where i.invoice_id = "invoices"."id" and ip.status = 'active' and i.status in ('scheduled', 'billed')), "invoices"."due_date")`;

export async function createPlan(
  deps: ApiDeps,
  inv: Invoice,
  input: { count: number; frequency: InstallmentFrequency; annualRate: number; interestTaxRate: number; firstDueDate: string },
  userId: string,
  today: string,
) {
  const { db } = deps;
  if (inv.kind !== "invoice" || !OPEN.includes(inv.status as (typeof OPEN)[number])) {
    throw new HTTPException(409, { message: "Only issued, unpaid invoices can be split into instalments" });
  }
  if (await installmentForInterestInvoice(db, inv.id)) throw new HTTPException(409, { message: "Interest invoices can't be split into instalments" });
  if (await activePlan(db, inv.id)) throw new HTTPException(409, { message: "This invoice already has an instalment plan" });
  if (input.firstDueDate < today) throw new HTTPException(422, { message: "The first instalment can't be due in the past" });
  const principal = inv.total - inv.amountPaid;
  if (principal < input.count * 100) throw new HTTPException(422, { message: "The balance is too small for that many instalments" });

  const settings = await loadSettings(db, inv.orgId);
  // Unregistered sellers can't charge GST; exports are zero-rated.
  const interestTaxRate = settings.gstin && inv.supplyType !== "export" ? input.interestTaxRate : 0;
  const schedule = emiSchedule({ principal, annualRatePct: input.annualRate, count: input.count, frequency: input.frequency, firstDueDate: input.firstDueDate });

  const [plan] = await db
    .insert(installmentPlans)
    .values({
      orgId: inv.orgId,
      invoiceId: inv.id,
      principal,
      annualRate: input.annualRate,
      count: input.count,
      frequency: input.frequency,
      firstDueDate: input.firstDueDate,
      interestTaxRate,
      originalDueDate: inv.dueDate,
      createdBy: userId,
    })
    .returning();
  await db.insert(installments).values(
    schedule.rows.map((r) => ({ orgId: inv.orgId, planId: plan!.id, invoiceId: inv.id, seq: r.seq, dueDate: r.dueDate, principal: r.principal, interest: r.interest })),
  );
  // An old full-balance payment link would let the client pay outside the plan.
  await db.update(invoices).set({ paymentLinkId: null, paymentLinkUrl: null }).where(eq(invoices.id, inv.id));
  // Anything due within the billing window goes out straight away.
  await billDue(deps, inv.orgId, today);
  return plan!;
}

/**
 * Bill an instalment: issue the GST invoice for its interest. Idempotent; returns the
 * instalment as it now is. Two workers can't bill it twice (the status update is the claim).
 */
export async function billInstallment(deps: ApiDeps, inst: Installment, today: string) {
  const { db } = deps;
  if (inst.status !== "scheduled") return inst;
  const [claimed] = await db
    .update(installments)
    .set({ status: "billed", billedAt: new Date() })
    .where(and(eq(installments.id, inst.id), eq(installments.status, "scheduled")))
    .returning();
  if (!claimed) return (await db.select().from(installments).where(eq(installments.id, inst.id)))[0]!;
  if (inst.interest <= 0) return claimed;

  try {
    const [plan] = await db.select().from(installmentPlans).where(eq(installmentPlans.id, inst.planId));
    const [orig] = await db.select().from(invoices).where(eq(invoices.id, inst.invoiceId));
    const [firstLine] = await db.select({ hsnSac: invoiceLines.hsnSac }).from(invoiceLines).where(eq(invoiceLines.invoiceId, orig!.id)).orderBy(asc(invoiceLines.position)).limit(1);
    const settings = await loadSettings(db, inst.orgId);
    const [ii] = await db
      .insert(invoices)
      .values({
        orgId: inst.orgId,
        kind: "invoice",
        clientId: orig!.clientId,
        projectId: orig!.projectId,
        relatedId: orig!.id,
        issueDate: today,
        dueDate: inst.dueDate < today ? today : inst.dueDate,
        currency: orig!.currency,
        placeOfSupply: orig!.placeOfSupply,
        supplyType: orig!.supplyType,
        notes: `Interest on instalment ${inst.seq} of ${plan!.count} for invoice ${orig!.number}, at ${plan!.annualRate}% a year on the reducing balance.`,
        terms: settings.terms,
        createdBy: plan!.createdBy,
      })
      .returning();
    await writeLines(
      db,
      inst.orgId,
      ii!.id,
      [{ description: `Interest on instalment ${inst.seq} of ${plan!.count} (invoice ${orig!.number})`, hsnSac: firstLine?.hsnSac ?? null, quantity: 1, unit: null, unitPrice: inst.interest, taxRate: plan!.interestTaxRate }],
      orig!.supplyType,
      settings,
    );
    const [fresh] = await db.select().from(invoices).where(eq(invoices.id, ii!.id));
    await issue(deps, fresh!, settings);
    const [done] = await db.update(installments).set({ interestInvoiceId: ii!.id }).where(eq(installments.id, inst.id)).returning();
    return done!;
  } catch (err) {
    // Release the claim so the next run can try again.
    await db.update(installments).set({ status: "scheduled", billedAt: null }).where(eq(installments.id, inst.id));
    throw err;
  }
}

/** Recompute what's been paid on an instalment, then its status and the plan's. */
export async function refreshInstallment(db: Db, installmentId: string) {
  const [inst] = await db.select().from(installments).where(eq(installments.id, installmentId));
  if (!inst || inst.status === "cancelled") return;
  const [plan] = await db.select().from(installmentPlans).where(eq(installmentPlans.id, inst.planId));
  const [row] = await db
    .select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
    .from(payments)
    .where(and(eq(payments.installmentId, inst.id), isNull(payments.voidedAt)));
  const paid = row?.paid ?? 0;
  const { total } = await amounts(db, { ...inst, amountPaid: paid }, plan!);
  const status = paid >= total && inst.status !== "scheduled" ? "paid" : inst.billedAt ? "billed" : "scheduled";
  await db
    .update(installments)
    .set({ amountPaid: paid, status, paidAt: status === "paid" ? (inst.paidAt ?? new Date()) : null, ...(status === "paid" ? { paymentLinkId: null, paymentLinkUrl: null } : {}) })
    .where(eq(installments.id, inst.id));

  if (plan!.status === "cancelled") return;
  const [left] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(installments)
    .where(and(eq(installments.planId, plan!.id), ne(installments.status, "paid")));
  await db
    .update(installmentPlans)
    .set({ status: left?.n ? "active" : "completed" })
    .where(eq(installmentPlans.id, plan!.id));
}

/**
 * Record money received for an instalment. It pays the interest invoice first, then the
 * instalment's principal on the original invoice. Billing happens first if it hasn't yet.
 */
export async function payInstallment(
  deps: ApiDeps,
  instIn: Installment,
  p: { amount: number; method: (typeof payments.$inferInsert)["method"]; paidOn: string; reference?: string | null; notes?: string | null; gatewayPaymentId?: string | null; createdBy: string },
  today: string,
) {
  const { db } = deps;
  if (instIn.status === "paid" || instIn.status === "cancelled") throw new HTTPException(409, { message: `Instalment ${instIn.seq} is already ${instIn.status}` });
  const inst = await billInstallment(deps, instIn, today);
  const [plan] = await db.select().from(installmentPlans).where(eq(installmentPlans.id, inst.planId));
  const a = await amounts(db, inst, plan!);
  if (p.amount > a.due) throw new HTTPException(422, { message: `That's more than instalment ${inst.seq} needs (${formatMoney(a.due)})` });

  const toInterest = inst.interestInvoiceId ? Math.min(p.amount, a.interestTotal - a.interestPaid) : 0;
  const toPrincipal = p.amount - toInterest;
  const [orig] = await db.select({ clientId: invoices.clientId }).from(invoices).where(eq(invoices.id, inst.invoiceId));
  const base = { orgId: inst.orgId, clientId: orig!.clientId, method: p.method, paidOn: p.paidOn, reference: p.reference ?? null, notes: p.notes ?? null, installmentId: inst.id, createdBy: p.createdBy };
  const rows = [
    ...(toInterest > 0 ? [{ ...base, invoiceId: inst.interestInvoiceId!, amount: toInterest, gatewayPaymentId: p.gatewayPaymentId ? `${p.gatewayPaymentId}:interest` : null }] : []),
    ...(toPrincipal > 0 ? [{ ...base, invoiceId: inst.invoiceId, amount: toPrincipal, gatewayPaymentId: p.gatewayPaymentId ?? null }] : []),
  ];
  // One statement, so a webhook retry can't half-record it.
  const inserted = await db.insert(payments).values(rows).onConflictDoNothing().returning({ id: payments.id });
  if (!inserted.length) return { recorded: false };
  if (toInterest > 0) await refreshPaid(db, inst.interestInvoiceId!);
  if (toPrincipal > 0) await refreshPaid(db, inst.invoiceId);
  await refreshInstallment(db, inst.id);
  return { recorded: true };
}

/** Undo a whole instalment payment (both of its parts) when one part is voided. */
export async function voidInstallmentPayment(db: Db, payment: typeof payments.$inferSelect) {
  const siblings = await db
    .update(payments)
    .set({ voidedAt: new Date() })
    .where(and(eq(payments.installmentId, payment.installmentId!), eq(payments.createdAt, payment.createdAt), isNull(payments.voidedAt)))
    .returning({ invoiceId: payments.invoiceId });
  for (const id of new Set([payment.invoiceId, ...siblings.map((s) => s.invoiceId)])) await refreshPaid(db, id);
  await refreshInstallment(db, payment.installmentId!);
}

/**
 * Stop the plan. Unbilled instalments are dropped and what's left of the principal is owed on
 * the invoice again, by its own due date. Interest invoices already issued stay as they
 * are (issue a credit note to waive one).
 */
export async function cancelPlan(db: Db, plan: Plan) {
  await db.update(installmentPlans).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(installmentPlans.id, plan.id));
  await db
    .update(installments)
    .set({ status: "cancelled", paymentLinkId: null, paymentLinkUrl: null })
    .where(and(eq(installments.planId, plan.id), inArray(installments.status, ["scheduled", "billed"])));
}

/* ---------------- Razorpay ---------------- */

export async function installmentPaymentLink(deps: ApiDeps, instIn: Installment, settings: Settings, today: string) {
  if (!settings.razorpayKeyId || !settings.razorpayKeySecretEnc) throw new HTTPException(422, { message: "Connect Razorpay in Finance settings first" });
  if (instIn.status === "paid" || instIn.status === "cancelled") throw new HTTPException(409, { message: `Instalment ${instIn.seq} is already ${instIn.status}` });
  const { db } = deps;
  const inst = await billInstallment(deps, instIn, today);
  const [plan] = await db.select().from(installmentPlans).where(eq(installmentPlans.id, inst.planId));
  const a = await amounts(db, inst, plan!);
  // Reuse the link while it's for the current amount due.
  if (inst.paymentLinkUrl && inst.amountPaid === 0) return inst.paymentLinkUrl;

  const [orig] = await db.select().from(invoices).where(eq(invoices.id, inst.invoiceId));
  const [client] = await db.select().from(clients).where(eq(clients.id, orig!.clientId));
  const secret = await deps.secrets.decrypt(settings.razorpayKeySecretEnc);
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${settings.razorpayKeyId}:${secret}`).toString("base64")}`, "content-type": "application/json" },
    body: JSON.stringify({
      amount: a.due,
      currency: orig!.currency,
      accept_partial: false,
      reference_id: `${orig!.number}-I${inst.seq}-${Date.now().toString(36)}`.slice(0, 40),
      description: `Instalment ${inst.seq} of ${plan!.count}, invoice ${orig!.number}`,
      customer: { name: client?.name, ...(client?.email ? { email: client.email } : {}), ...(client?.phone ? { contact: client.phone } : {}) },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { installment_id: inst.id, invoice_id: orig!.id, org_id: inst.orgId },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; short_url?: string; error?: { description?: string } };
  if (!res.ok || !body.id || !body.short_url) throw new HTTPException(502, { message: `Razorpay: ${body.error?.description ?? `request failed (${res.status})`}` });
  await db.update(installments).set({ paymentLinkId: body.id, paymentLinkUrl: body.short_url }).where(eq(installments.id, inst.id));
  return body.short_url;
}

/* ---------------- Email ---------------- */

export async function emailInstallment(deps: ApiDeps, settings: Settings, orgName: string, instIn: Installment, today: string): Promise<MailResult> {
  const { db } = deps;
  const [inst] = await db.select().from(installments).where(eq(installments.id, instIn.id));
  const [plan] = await db.select().from(installmentPlans).where(eq(installmentPlans.id, inst!.planId));
  const [orig] = await db.select().from(invoices).where(eq(invoices.id, inst!.invoiceId));
  const [client] = await db.select().from(clients).where(eq(clients.id, orig!.clientId));
  if (!client?.email) return { sent: false, reason: "no_email" };
  const a = await amounts(db, inst!, plan!);
  const seller = settings.legalName ?? orgName;
  const overdue = inst!.dueDate < today;
  let href = `${deps.appUrl.replace(/\/$/, "")}/i/${await linkToken(deps, orig!.id)}`;
  if (settings.razorpayKeyId && settings.razorpayKeySecretEnc) {
    href = await installmentPaymentLink(deps, inst!, settings, today).catch(() => href);
  }
  const ii = inst!.interestInvoiceId ? (await db.select({ number: invoices.number }).from(invoices).where(eq(invoices.id, inst!.interestInvoiceId)))[0] : null;
  const label = `Instalment ${inst!.seq} of ${plan!.count}`;
  const { html, text } = renderEmail({
    greeting: `Hello ${client.name},`,
    lead: overdue
      ? `A friendly reminder that ${label.toLowerCase()} for invoice ${orig!.number} was due on ${mailDate(inst!.dueDate)}. If you've already paid, thank you, and please ignore this email.`
      : `${label} for invoice ${orig!.number} is due on ${mailDate(inst!.dueDate)}.${ii ? ` The interest for this instalment is billed on invoice ${ii.number}.` : ""}`,
    rows: [
      ["Invoice", orig!.number ?? ""],
      ["Instalment", label],
      ["Principal", formatMoney(inst!.principal, orig!.currency)],
      ...(a.interestTotal ? [[ii ? `Interest (invoice ${ii.number})` : "Interest", formatMoney(a.interestTotal, orig!.currency)] as [string, string]] : []),
      ["Due", mailDate(inst!.dueDate)],
      ["Amount due", formatMoney(a.due, orig!.currency)],
    ],
    cta: { label: "Pay this instalment", href },
    signOff: `Thank you,\n${seller}`,
    footnote: settings.email ? `Questions? Just reply to this email to reach ${seller}.` : undefined,
  });
  const result = await deliver(deps.mailer, {
    to: client.email,
    subject: overdue ? `Reminder: ${label.toLowerCase()} for ${orig!.number} is overdue` : `${label} for ${orig!.number}: ${formatMoney(a.due, orig!.currency)} due ${mailDate(inst!.dueDate)}`,
    html,
    text,
    replyTo: settings.email,
  });
  if (result.sent) await db.update(installments).set({ lastReminderAt: new Date() }).where(eq(installments.id, inst!.id));
  return result;
}

/* ---------------- Jobs ---------------- */

/** Bill every instalment falling due within the billing window. Returns the ones billed now. */
async function billDue(deps: ApiDeps, orgId: string, today: string) {
  const due = await deps.db
    .select()
    .from(installments)
    .innerJoin(installmentPlans, eq(installmentPlans.id, installments.planId))
    .where(and(eq(installments.orgId, orgId), eq(installments.status, "scheduled"), eq(installmentPlans.status, "active"), lte(installments.dueDate, addDays(today, BILL_AHEAD_DAYS))));
  const billed: Installment[] = [];
  for (const { installments: inst } of due) {
    const done = await billInstallment(deps, inst, today).catch((e) => (console.error("Billing instalment failed", e), null));
    if (done?.status === "billed") billed.push(done);
  }
  return billed;
}

/**
 * Daily: bill instalments a week before they fall due and email the client; then remind
 * about overdue instalments the day after, and weekly after that.
 */
export async function runInstallmentJobs(deps: ApiDeps, orgId: string, today: string) {
  const { db } = deps;
  await billDue(deps, orgId, today);
  if (!deps.mailer.enabled) return 0;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const rows = await db
    .select()
    .from(installments)
    .innerJoin(installmentPlans, eq(installmentPlans.id, installments.planId))
    .where(
      and(
        eq(installments.orgId, orgId),
        eq(installments.status, "billed"),
        eq(installmentPlans.status, "active"),
        or(
          // Not told yet: the billing notice.
          isNull(installments.lastReminderAt),
          // Overdue: once after the due date, then weekly.
          and(sql`${installments.dueDate} < ${today}`, or(sql`${installments.lastReminderAt} < ${installments.dueDate}::timestamptz + interval '1 day'`, lte(installments.lastReminderAt, weekAgo))),
        ),
      ),
    )
    .orderBy(asc(installments.dueDate))
    .limit(200);
  if (!rows.length) return 0;
  const settings = await loadSettings(db, orgId);
  const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, orgId));
  let sent = 0;
  for (const { installments: inst } of rows) if ((await emailInstallment(deps, settings, org!.name, inst, today)).sent) sent++;
  return sent;
}

/** For receivables: each plan invoice's unpaid principal, by instalment due date. */
export async function planPrincipalByDueDate(db: Db, orgId: string) {
  const rows = await db
    .select({
      invoiceId: installments.invoiceId,
      dueDate: installments.dueDate,
      principal: installments.principal,
      principalPaid: sql<number>`coalesce((select sum(p.amount) from payments p where p.installment_id = ${installments.id} and p.invoice_id = ${installments.invoiceId} and p.voided_at is null), 0)`.mapWith(Number),
    })
    .from(installments)
    .innerJoin(installmentPlans, eq(installmentPlans.id, installments.planId))
    .where(and(eq(installments.orgId, orgId), eq(installmentPlans.status, "active"), inArray(installments.status, ["scheduled", "billed"])));
  const map = new Map<string, { dueDate: string; amount: number }[]>();
  for (const r of rows) {
    const amount = r.principal - r.principalPaid;
    if (amount <= 0) continue;
    map.set(r.invoiceId, [...(map.get(r.invoiceId) ?? []), { dueDate: r.dueDate, amount }]);
  }
  return map;
}
