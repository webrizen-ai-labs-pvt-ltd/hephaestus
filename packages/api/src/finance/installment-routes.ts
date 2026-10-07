import { INSTALLMENT_FREQUENCIES, isIsoDate, todayIn } from "@operant/core";
import { installments, invoices, orgs, PAYMENT_METHODS } from "@operant/db";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { audit } from "../audit.ts";
import type { AppEnv } from "../context.ts";
import { notFound, orgWorkSettings } from "../helpers.ts";
import { requirePermission } from "../middleware.ts";
import { validate } from "../validate.ts";
import { MAIL_REASON } from "./email.ts";
import { activePlan, billInstallment, cancelPlan, createPlan, emailInstallment, installmentPaymentLink, payInstallment } from "./installments.ts";
import { loadSettings } from "./service.ts";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD)");

const today = async (c: Context<AppEnv>) => todayIn((await orgWorkSettings(c.get("deps").db, c.get("org").id)).timezone);

async function loadInvoice(c: Context<AppEnv>, id: string) {
  const [inv] = await c.get("deps").db.select().from(invoices).where(and(eq(invoices.orgId, c.get("org").id), eq(invoices.id, id)));
  if (!inv) notFound("Invoice not found");
  return inv;
}

async function loadInstallment(c: Context<AppEnv>, id: string) {
  const [inst] = await c.get("deps").db.select().from(installments).where(and(eq(installments.orgId, c.get("org").id), eq(installments.id, id)));
  if (!inst) notFound("Instalment not found");
  return inst;
}

export const installmentRoutes = new Hono<AppEnv>()

  .post(
    "/finance/documents/:id/installments",
    requirePermission("invoice", "update"),
    validate(
      "json",
      z.object({
        count: z.number().int().min(2, "At least 2 instalments").max(60, "At most 60 instalments"),
        frequency: z.enum(INSTALLMENT_FREQUENCIES).default("monthly"),
        annualRate: z.number().min(0).max(60, "Interest can't be more than 60% a year"),
        interestTaxRate: z.number().min(0).max(28).default(18),
        firstDueDate: isoDate,
      }),
    ),
    async (c) => {
      const input = c.req.valid("json");
      const inv = await loadInvoice(c, c.req.param("id"));
      const plan = await createPlan(c.get("deps"), inv, input, c.get("viewer")!.userId, await today(c));
      await audit(c, "invoice.installments_created", { type: "invoice", id: inv.id }, { count: input.count, annualRate: input.annualRate, frequency: input.frequency });
      return c.json({ plan: { id: plan.id } }, 201);
    },
  )

  .post("/finance/documents/:id/installments/cancel", requirePermission("invoice", "update"), async (c) => {
    const inv = await loadInvoice(c, c.req.param("id"));
    const plan = await activePlan(c.get("deps").db, inv.id);
    if (!plan) throw new HTTPException(404, { message: "This invoice has no active instalment plan" });
    await cancelPlan(c.get("deps").db, plan);
    await audit(c, "invoice.installments_cancelled", { type: "invoice", id: inv.id });
    return c.json({ ok: true });
  })

  .post(
    "/finance/installments/:id/payments",
    requirePermission("payment", "record"),
    validate(
      "json",
      z.object({
        amount: z.number().int().positive(),
        method: z.enum(PAYMENT_METHODS).exclude(["credit_note", "razorpay"]),
        paidOn: isoDate,
        reference: z.string().trim().max(120).nullish(),
        notes: z.string().trim().max(1000).nullish(),
      }),
    ),
    async (c) => {
      const input = c.req.valid("json");
      const inst = await loadInstallment(c, c.req.param("id"));
      await payInstallment(c.get("deps"), inst, { ...input, createdBy: c.get("viewer")!.userId }, await today(c));
      await audit(c, "payment.recorded", { type: "invoice", id: inst.invoiceId }, { amount: input.amount, method: input.method, installment: inst.seq });
      return c.json({ ok: true }, 201);
    },
  )

  /** Issue the instalment's interest invoice now, instead of a week before it's due. */
  .post("/finance/installments/:id/bill", requirePermission("invoice", "send"), async (c) => {
    const inst = await loadInstallment(c, c.req.param("id"));
    if (inst.status !== "scheduled") throw new HTTPException(409, { message: `Instalment ${inst.seq} has already been billed` });
    const done = await billInstallment(c.get("deps"), inst, await today(c));
    await audit(c, "invoice.installment_billed", { type: "invoice", id: inst.invoiceId }, { installment: inst.seq });
    return c.json({ interestInvoiceId: done.interestInvoiceId });
  })

  .post("/finance/installments/:id/payment-link", requirePermission("invoice", "send"), async (c) => {
    const deps = c.get("deps");
    const inst = await loadInstallment(c, c.req.param("id"));
    const url = await installmentPaymentLink(deps, inst, await loadSettings(deps.db, inst.orgId), await today(c));
    await audit(c, "invoice.payment_link", { type: "invoice", id: inst.invoiceId }, { installment: inst.seq });
    return c.json({ url });
  })

  .post("/finance/installments/:id/remind", requirePermission("invoice", "send"), async (c) => {
    const deps = c.get("deps");
    const inst = await loadInstallment(c, c.req.param("id"));
    if (inst.status === "paid" || inst.status === "cancelled") throw new HTTPException(409, { message: `Instalment ${inst.seq} is already ${inst.status}` });
    const day = await today(c);
    const billed = await billInstallment(deps, inst, day);
    const [org] = await deps.db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, inst.orgId));
    const mail = await emailInstallment(deps, await loadSettings(deps.db, inst.orgId), org!.name, billed, day);
    if (!mail.sent) throw new HTTPException(422, { message: `Couldn't email the client. ${MAIL_REASON[mail.reason]}${mail.error ? `: ${mail.error}` : "."}` });
    await audit(c, "invoice.reminded", { type: "invoice", id: inst.invoiceId }, { installment: inst.seq });
    return c.json({ ok: true });
  });
