import { addDays, agingBucket, isIsoDate, todayIn } from "@hephaestus/core";
import {
  clients,
  DOCUMENT_KINDS,
  DOCUMENT_STATUSES,
  invoiceLines,
  invoices,
  orgSettings,
  orgs,
  PAYMENT_METHODS,
  payments,
  projects,
  RECURRING_FREQUENCIES,
  recurringInvoices,
  serviceRequests,
} from "@hephaestus/db";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { audit } from "../audit.ts";
import type { AppEnv } from "../context.ts";
import { forbid, hasPermission, notFound, orgWorkSettings } from "../helpers.ts";
import { requirePermission } from "../middleware.ts";
import { likePattern, validate } from "../validate.ts";
import { MAIL_REASON } from "./email.ts";
import { assertNotOnPlan, effectiveDueDate, installmentForInterestInvoice, planPrincipalByDueDate, planView, voidInstallmentPayment } from "./installments.ts";
import {
  createPaymentLink,
  emailClient,
  generateDueRecurring,
  issue,
  linkToken,
  loadClient,
  loadSettings,
  placeOfSupplyFor,
  refreshPaid,
  writeLines,
} from "./service.ts";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD)");

const lineInput = z.object({
  itemId: z.uuid().nullish(),
  description: z.string().trim().min(1, "Describe the line").max(1000),
  hsnSac: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "HSN/SAC codes are 4 to 8 digits")
    .nullish()
    .or(z.literal("").transform(() => null)),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().trim().max(20).nullish(),
  unitPrice: z.number().int().min(0).max(1e13),
  discountPct: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).max(100),
});

const docInput = z.object({
  kind: z.enum(DOCUMENT_KINDS).default("invoice"),
  clientId: z.uuid(),
  projectId: z.uuid().nullish(),
  milestoneId: z.uuid().nullish(),
  issueDate: isoDate,
  dueDate: isoDate.nullish(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  notes: z.string().trim().max(4000).nullish(),
  terms: z.string().trim().max(4000).nullish(),
  lines: z.array(lineInput).max(200),
});

async function loadDoc(c: Context<AppEnv>, id: string) {
  const { db } = c.get("deps");
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.orgId, c.get("org").id), eq(invoices.id, id)));
  if (!inv) notFound("Document not found");
  return inv;
}

async function assertProjectRef(db: AppEnv["Variables"]["deps"]["db"], orgId: string, projectId: string | null | undefined) {
  if (!projectId) return;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.orgId, orgId), eq(projects.id, projectId)));
  if (!p) throw new HTTPException(422, { message: "Unknown project" });
}

/** List rows with client and balance; used by the lists and the client page. */
function listQuery(db: AppEnv["Variables"]["deps"]["db"]) {
  return db
    .select({
      id: invoices.id,
      kind: invoices.kind,
      number: invoices.number,
      status: invoices.status,
      clientId: invoices.clientId,
      clientName: clients.name,
      projectId: invoices.projectId,
      issueDate: invoices.issueDate,
      // For an invoice paid in instalments: when the next instalment is due.
      dueDate: effectiveDueDate,
      currency: invoices.currency,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
      recurringId: invoices.recurringId,
      sentAt: invoices.sentAt,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId));
}

export const financeDocumentRoutes = new Hono<AppEnv>()

  /* ---------------- Documents ---------------- */

  .get(
    "/finance/documents",
    requirePermission("invoice", "read"),
    validate(
      "query",
      z.object({
        kind: z.enum(DOCUMENT_KINDS).default("invoice"),
        status: z.enum([...DOCUMENT_STATUSES, "open", "overdue"]).optional(),
        clientId: z.uuid().optional(),
        projectId: z.uuid().optional(),
        q: z.string().trim().max(100).optional(),
      }),
    ),
    async (c) => {
      const f = c.req.valid("query");
      const { db } = c.get("deps");
      const org = c.get("org");
      const { timezone } = await orgWorkSettings(db, org.id);
      const today = todayIn(timezone);
      const rows = await listQuery(db)
        .where(
          and(
            eq(invoices.orgId, org.id),
            eq(invoices.kind, f.kind),
            f.status === "open"
              ? inArray(invoices.status, ["sent", "partially_paid"])
              : f.status === "overdue"
                ? and(inArray(invoices.status, ["sent", "partially_paid"]), sql`${effectiveDueDate} < ${today}`)
                : f.status
                  ? eq(invoices.status, f.status)
                  : undefined,
            f.clientId ? eq(invoices.clientId, f.clientId) : undefined,
            f.projectId ? eq(invoices.projectId, f.projectId) : undefined,
            f.q ? sql`(${invoices.number} ilike ${likePattern(f.q)} or ${clients.name} ilike ${likePattern(f.q)})` : undefined,
          ),
        )
        .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
        .limit(500);
      return c.json({ today, documents: rows });
    },
  )

  .get("/finance/documents/:id", requirePermission("invoice", "read"), async (c) => {
    const { db } = c.get("deps");
    const inv = await loadDoc(c, c.req.param("id"));
    const [client] = await db.select().from(clients).where(eq(clients.id, inv.clientId));
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)).orderBy(asc(invoiceLines.position));
    const pays = await db.select().from(payments).where(eq(payments.invoiceId, inv.id)).orderBy(desc(payments.paidOn));
    const related = await db
      .select({ id: invoices.id, kind: invoices.kind, number: invoices.number, status: invoices.status, total: invoices.total })
      .from(invoices)
      .where(and(eq(invoices.orgId, inv.orgId), sql`(${invoices.relatedId} = ${inv.id} or ${invoices.id} = ${inv.relatedId ?? sql`null`})`));
    const project = inv.projectId ? (await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, inv.projectId)))[0] : null;
    const settings = await loadSettings(db, inv.orgId);
    const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, inv.orgId));
    const { razorpayKeySecretEnc, razorpayWebhookSecretEnc, ...seller } = settings;
    const { publicTokenHash, ...doc } = inv;
    const interestFor = await installmentForInterestInvoice(db, inv.id);
    return c.json({
      document: doc,
      installments: inv.kind === "invoice" && inv.status !== "draft" ? await planView(db, inv.id) : null,
      interestFor: interestFor && interestFor.status !== "cancelled" ? { invoiceId: interestFor.invoiceId, seq: interestFor.seq } : null,
      lines,
      payments: pays,
      related,
      client,
      project: project ?? null,
      seller: { ...seller, name: org!.name, razorpayConnected: Boolean(settings.razorpayKeyId && razorpayKeySecretEnc) },
      publicUrl: inv.status !== "draft" ? `/i/${await linkToken(c.get("deps"), inv.id)}` : null,
    });
  })

  .post("/finance/documents", requirePermission("invoice", "create"), validate("json", docInput), async (c) => {
    const input = c.req.valid("json");
    const { db } = c.get("deps");
    const org = c.get("org");
    const settings = await loadSettings(db, org.id);
    const client = await loadClient(db, org.id, input.clientId);
    await assertProjectRef(db, org.id, input.projectId);
    const pos = placeOfSupplyFor(settings, client);
    const due = input.dueDate ?? (input.kind === "credit_note" ? null : addDays(input.issueDate, client.paymentTermsDays ?? settings.defaultDueDays));
    const [inv] = await db
      .insert(invoices)
      .values({
        orgId: org.id,
        kind: input.kind,
        clientId: client.id,
        projectId: input.projectId ?? null,
        milestoneId: input.milestoneId ?? null,
        issueDate: input.issueDate,
        dueDate: due,
        currency: input.currency ?? client.currency,
        ...pos,
        notes: input.notes ?? settings.notes,
        terms: input.terms ?? settings.terms,
        createdBy: c.get("viewer")!.userId,
      })
      .returning({ id: invoices.id });
    await writeLines(db, org.id, inv!.id, input.lines, pos.supplyType, settings);
    await audit(c, `${input.kind}.created`, { type: input.kind, id: inv!.id }, { client: client.name });
    return c.json({ document: { id: inv!.id } }, 201);
  })

  .patch("/finance/documents/:id", requirePermission("invoice", "update"), validate("json", docInput.omit({ kind: true }).partial()), async (c) => {
    const input = c.req.valid("json");
    const { db } = c.get("deps");
    const org = c.get("org");
    const inv = await loadDoc(c, c.req.param("id"));
    if (inv.status === "void") throw new HTTPException(409, { message: "Void documents can't be changed" });

    if (inv.status !== "draft") {
      // Issued documents are legal records: only the due date and notes can change. Use a credit note for the rest.
      const allowed = new Set(["dueDate", "notes", "terms"]);
      if (Object.keys(input).some((k) => !allowed.has(k))) {
        throw new HTTPException(409, { message: "This has been issued. Only the due date and notes can change; use a credit note to adjust amounts." });
      }
      await db.update(invoices).set(input).where(eq(invoices.id, inv.id));
      await audit(c, `${inv.kind}.updated`, { type: inv.kind, id: inv.id }, { fields: Object.keys(input) });
      return c.json({ ok: true });
    }

    const settings = await loadSettings(db, org.id);
    const client = input.clientId ? await loadClient(db, org.id, input.clientId) : await loadClient(db, org.id, inv.clientId);
    await assertProjectRef(db, org.id, input.projectId);
    const pos = placeOfSupplyFor(settings, client);
    const { lines, ...fields } = input;
    await db
      .update(invoices)
      .set({ ...fields, ...pos, currency: input.currency ?? (input.clientId ? client.currency : inv.currency) })
      .where(eq(invoices.id, inv.id));
    if (lines) await writeLines(db, org.id, inv.id, lines, pos.supplyType, settings);
    else {
      // The client (and so the tax type) may have changed: recompute from the stored lines.
      const existing = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)).orderBy(asc(invoiceLines.position));
      await writeLines(db, org.id, inv.id, existing, pos.supplyType, settings);
    }
    return c.json({ ok: true });
  })

  .delete("/finance/documents/:id", requirePermission("invoice", "update"), async (c) => {
    const { db } = c.get("deps");
    const inv = await loadDoc(c, c.req.param("id"));
    if (inv.status !== "draft") throw new HTTPException(409, { message: "Only drafts can be deleted; void an issued document instead" });
    await db.delete(invoices).where(eq(invoices.id, inv.id));
    await audit(c, `${inv.kind}.draft_deleted`, { type: inv.kind, id: inv.id });
    return c.json({ ok: true });
  })

  .post(
    "/finance/documents/:id/issue",
    requirePermission("invoice", "send"),
    validate("json", z.object({ email: z.boolean().default(true) })),
    async (c) => {
      const { email } = c.req.valid("json");
      const deps = c.get("deps");
      const org = c.get("org");
      const inv = await loadDoc(c, c.req.param("id"));
      const settings = await loadSettings(deps.db, org.id);
      if (!settings.legalName && inv.kind === "invoice") {
        // Not blocking: GSTIN is optional (unregistered sellers), but every invoice needs the seller's name.
        c.header("x-warning", "Add your business name in Finance settings");
      }
      const { number, token } = await issue(deps, inv, settings);

      // A credit note reduces what's owed on its invoice.
      if (inv.kind === "credit_note" && inv.relatedId) {
        const [fresh] = await deps.db.select().from(invoices).where(eq(invoices.id, inv.id));
        await deps.db.insert(payments).values({
          orgId: org.id,
          invoiceId: inv.relatedId,
          clientId: inv.clientId,
          amount: fresh!.total,
          method: "credit_note",
          paidOn: inv.issueDate,
          reference: number,
          createdBy: c.get("viewer")!.userId,
        });
        await refreshPaid(deps.db, inv.relatedId);
      }

      // A quote for a portal request: the client can now accept it there.
      if (inv.kind === "quote") {
        await deps.db
          .update(serviceRequests)
          .set({ status: "quoted" })
          .where(and(eq(serviceRequests.quoteId, inv.id), inArray(serviceRequests.status, ["new", "in_discussion", "accepted"])));
      }

      const [sent] = await deps.db.select().from(invoices).where(eq(invoices.id, inv.id));
      const mail = email ? await emailClient(deps, settings, org.name, sent!, token, "issued") : null;
      const emailed = Boolean(mail?.sent);
      await audit(c, `${inv.kind}.issued`, { type: inv.kind, id: inv.id }, { number, emailed });
      // Tell the user why it wasn't emailed, so a missing setup is never silent.
      return c.json({ number, emailed, emailError: mail && !mail.sent ? MAIL_REASON[mail.reason] + (mail.error ? `: ${mail.error}` : "") : null, publicUrl: `/i/${token}` });
    },
  )

  .post("/finance/documents/:id/remind", requirePermission("invoice", "send"), async (c) => {
    const deps = c.get("deps");
    const org = c.get("org");
    const inv = await loadDoc(c, c.req.param("id"));
    if (inv.kind !== "invoice" || !["sent", "partially_paid"].includes(inv.status)) throw new HTTPException(409, { message: "Only unpaid invoices need reminders" });
    await assertNotOnPlan(deps.db, inv, "Send reminders from the instalment schedule instead.");
    const settings = await loadSettings(deps.db, org.id);
    const mail = await emailClient(deps, settings, org.name, inv, await linkToken(deps, inv.id), "reminder");
    if (!mail.sent) throw new HTTPException(422, { message: `Couldn't send the reminder. ${MAIL_REASON[mail.reason]}${mail.error ? `: ${mail.error}` : "."}` });
    await deps.db.update(invoices).set({ lastReminderAt: new Date() }).where(eq(invoices.id, inv.id));
    await audit(c, "invoice.reminded", { type: "invoice", id: inv.id });
    return c.json({ ok: true });
  })

  .post("/finance/documents/:id/void", requirePermission("invoice", "void"), async (c) => {
    const { db } = c.get("deps");
    const inv = await loadDoc(c, c.req.param("id"));
    if (inv.status === "draft" || inv.status === "void") throw new HTTPException(409, { message: "Only issued documents can be voided" });
    const [paid] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(payments)
      .where(and(eq(payments.invoiceId, inv.id), isNull(payments.voidedAt)));
    if ((paid?.n ?? 0) > 0) throw new HTTPException(409, { message: "Void its payments first" });
    await assertNotOnPlan(db, inv, "Cancel the plan first.");
    await db.update(invoices).set({ status: "void", voidedAt: new Date() }).where(eq(invoices.id, inv.id));
    // A voided credit note no longer reduces its invoice.
    if (inv.kind === "credit_note" && inv.relatedId) {
      await db.update(payments).set({ voidedAt: new Date() }).where(and(eq(payments.invoiceId, inv.relatedId), eq(payments.reference, inv.number!), eq(payments.method, "credit_note")));
      await refreshPaid(db, inv.relatedId);
    }
    await audit(c, `${inv.kind}.voided`, { type: inv.kind, id: inv.id }, { number: inv.number });
    return c.json({ ok: true });
  })

  /** Copy into a new draft: duplicate, quote → invoice, or invoice → credit note. */
  .post(
    "/finance/documents/:id/copy",
    requirePermission("invoice", "create"),
    validate("json", z.object({ as: z.enum(["duplicate", "invoice", "credit_note"]) })),
    async (c) => {
      const { as } = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      const src = await loadDoc(c, c.req.param("id"));
      if (as === "invoice" && src.kind !== "quote") throw new HTTPException(422, { message: "Only quotes convert to invoices" });
      if (as === "credit_note" && (src.kind !== "invoice" || src.status === "draft" || src.status === "void")) {
        throw new HTTPException(422, { message: "Credit notes are issued against issued invoices" });
      }
      if (as === "credit_note" && src.status !== "paid") await assertNotOnPlan(db, src, "Cancel the plan before issuing a credit note.");
      const settings = await loadSettings(db, org.id);
      const { timezone } = await orgWorkSettings(db, org.id);
      const today = todayIn(timezone);
      const client = await loadClient(db, org.id, src.clientId);
      const kind = as === "duplicate" ? src.kind : as;
      const [doc] = await db
        .insert(invoices)
        .values({
          orgId: org.id,
          kind,
          clientId: src.clientId,
          projectId: src.projectId,
          milestoneId: as === "duplicate" ? null : src.milestoneId,
          relatedId: as === "duplicate" ? null : src.id,
          issueDate: today,
          dueDate: kind === "credit_note" ? null : addDays(today, client.paymentTermsDays ?? settings.defaultDueDays),
          currency: src.currency,
          placeOfSupply: src.placeOfSupply,
          supplyType: src.supplyType,
          notes: src.notes,
          terms: src.terms,
          createdBy: c.get("viewer")!.userId,
        })
        .returning({ id: invoices.id });
      const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, src.id)).orderBy(asc(invoiceLines.position));
      await writeLines(db, org.id, doc!.id, lines, src.supplyType, settings);
      if (as === "invoice") await db.update(invoices).set({ status: "accepted" }).where(eq(invoices.id, src.id));
      await audit(c, `${kind}.created`, { type: kind, id: doc!.id }, { from: src.number ?? src.id, as });
      return c.json({ document: { id: doc!.id } }, 201);
    },
  )

  .post(
    "/finance/documents/:id/quote-status",
    requirePermission("invoice", "update"),
    validate("json", z.object({ status: z.enum(["accepted", "declined", "sent"]) })),
    async (c) => {
      const { db } = c.get("deps");
      const inv = await loadDoc(c, c.req.param("id"));
      if (inv.kind !== "quote" || inv.status === "draft" || inv.status === "void") throw new HTTPException(409, { message: "Only issued quotes have this status" });
      await db.update(invoices).set({ status: c.req.valid("json").status }).where(eq(invoices.id, inv.id));
      return c.json({ ok: true });
    },
  )

  .post("/finance/documents/:id/payment-link", requirePermission("invoice", "send"), async (c) => {
    const deps = c.get("deps");
    const inv = await loadDoc(c, c.req.param("id"));
    await assertNotOnPlan(deps.db, inv, "Create payment links for each instalment instead.");
    const url = await createPaymentLink(deps, inv, await loadSettings(deps.db, inv.orgId));
    await audit(c, "invoice.payment_link", { type: "invoice", id: inv.id });
    return c.json({ url });
  })

  /* ---------------- Payments ---------------- */

  .get("/finance/payments", requirePermission("payment", "read"), validate("query", z.object({ from: isoDate.optional(), to: isoDate.optional() })), async (c) => {
    const { from, to } = c.req.valid("query");
    const { db } = c.get("deps");
    const rows = await db
      .select({
        id: payments.id,
        invoiceId: payments.invoiceId,
        invoiceNumber: invoices.number,
        clientId: payments.clientId,
        clientName: clients.name,
        amount: payments.amount,
        currency: invoices.currency,
        method: payments.method,
        paidOn: payments.paidOn,
        reference: payments.reference,
        voidedAt: payments.voidedAt,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .innerJoin(clients, eq(clients.id, payments.clientId))
      .where(and(eq(payments.orgId, c.get("org").id), from ? gte(payments.paidOn, from) : undefined, to ? lte(payments.paidOn, to) : undefined))
      .orderBy(desc(payments.paidOn), desc(payments.createdAt))
      .limit(500);
    return c.json({ payments: rows });
  })

  .post(
    "/finance/documents/:id/payments",
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
      const { db } = c.get("deps");
      const inv = await loadDoc(c, c.req.param("id"));
      if (inv.kind !== "invoice" || !["sent", "partially_paid"].includes(inv.status)) {
        throw new HTTPException(409, { message: "Payments are recorded against issued, unpaid invoices" });
      }
      await assertNotOnPlan(db, inv, "Record payments against an instalment instead.");
      const balance = inv.total - inv.amountPaid;
      if (input.amount > balance) throw new HTTPException(422, { message: "That's more than what's owed on this invoice" });
      const [row] = await db
        .insert(payments)
        .values({ ...input, orgId: inv.orgId, invoiceId: inv.id, clientId: inv.clientId, createdBy: c.get("viewer")!.userId })
        .returning({ id: payments.id });
      await refreshPaid(db, inv.id);
      await audit(c, "payment.recorded", { type: "invoice", id: inv.id }, { amount: input.amount, method: input.method });
      return c.json({ payment: row }, 201);
    },
  )

  .post("/finance/payments/:id/void", requirePermission("payment", "refund"), async (c) => {
    const { db } = c.get("deps");
    const [p] = await db.select().from(payments).where(and(eq(payments.orgId, c.get("org").id), eq(payments.id, c.req.param("id"))));
    if (!p || p.voidedAt) notFound("Payment not found");
    if (p.method === "credit_note") throw new HTTPException(409, { message: "Void the credit note instead" });
    if (p.installmentId) await voidInstallmentPayment(db, p);
    else {
      await db.update(payments).set({ voidedAt: new Date() }).where(eq(payments.id, p.id));
      await refreshPaid(db, p.invoiceId);
    }
    await audit(c, "payment.voided", { type: "invoice", id: p.invoiceId }, { amount: p.amount });
    return c.json({ ok: true });
  })

  /* ---------------- Retainers ---------------- */

  .get("/finance/recurring", requirePermission("invoice", "read"), async (c) => {
    const { db } = c.get("deps");
    const rows = await db
      .select({ r: recurringInvoices, clientName: clients.name })
      .from(recurringInvoices)
      .innerJoin(clients, eq(clients.id, recurringInvoices.clientId))
      .where(eq(recurringInvoices.orgId, c.get("org").id))
      .orderBy(desc(recurringInvoices.active), asc(recurringInvoices.nextIssueDate));
    return c.json({ recurring: rows.map((x) => ({ ...x.r, clientName: x.clientName })) });
  })

  .post(
    "/finance/recurring",
    requirePermission("invoice", "create"),
    validate(
      "json",
      z.object({
        clientId: z.uuid(),
        projectId: z.uuid().nullish(),
        name: z.string().trim().min(1).max(120),
        frequency: z.enum(RECURRING_FREQUENCIES).default("monthly"),
        nextIssueDate: isoDate,
        endDate: isoDate.nullish(),
        dueDays: z.number().int().min(0).max(365).default(15),
        lines: z.array(lineInput).min(1).max(100),
        notes: z.string().trim().max(4000).nullish(),
        autoSend: z.boolean().default(false),
      }),
    ),
    async (c) => {
      const input = c.req.valid("json");
      const { db } = c.get("deps");
      const org = c.get("org");
      await loadClient(db, org.id, input.clientId);
      await assertProjectRef(db, org.id, input.projectId);
      const [row] = await db.insert(recurringInvoices).values({ ...input, orgId: org.id, createdBy: c.get("viewer")!.userId }).returning({ id: recurringInvoices.id });
      await audit(c, "retainer.created", { type: "retainer", id: row!.id }, { name: input.name });
      // If the first date is today or earlier, issue straight away.
      const { timezone } = await orgWorkSettings(db, org.id);
      await generateDueRecurring(c.get("deps"), org.id, todayIn(timezone));
      return c.json({ recurring: row }, 201);
    },
  )

  .patch(
    "/finance/recurring/:id",
    requirePermission("invoice", "update"),
    validate("json", z.object({ active: z.boolean(), autoSend: z.boolean(), nextIssueDate: isoDate, endDate: isoDate.nullable(), lines: z.array(lineInput).min(1).max(100) }).partial()),
    async (c) => {
      const { db } = c.get("deps");
      const [row] = await db
        .update(recurringInvoices)
        .set(c.req.valid("json"))
        .where(and(eq(recurringInvoices.orgId, c.get("org").id), eq(recurringInvoices.id, c.req.param("id"))))
        .returning({ id: recurringInvoices.id });
      if (!row) notFound();
      return c.json({ ok: true });
    },
  )

  /* ---------------- Dashboard ---------------- */

  .get("/finance/summary", async (c) => {
    if (!hasPermission(c, "report", "read_finance") && !hasPermission(c, "invoice", "read")) forbid();
    const deps = c.get("deps");
    const { db } = deps;
    const org = c.get("org");
    const { timezone } = await orgWorkSettings(db, org.id);
    const today = todayIn(timezone);
    // Retainers are generated lazily too, so the offline edition never misses one.
    await generateDueRecurring(deps, org.id, today);

    // Totals are in the organisation's currency; foreign-currency balances are listed separately.
    const [cur] = await db.select({ currency: orgSettings.currency }).from(orgSettings).where(eq(orgSettings.orgId, org.id));
    const currency = cur?.currency ?? "INR";
    const inCurrency = eq(invoices.currency, currency);

    const [y, m] = today.split("-").map(Number) as [number, number];
    const fyStart = `${m >= 4 ? y : y - 1}-04-01`;
    const start12 = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10);

    const open = await db
      .select({ id: invoices.id, total: invoices.total, paid: invoices.amountPaid, dueDate: invoices.dueDate, clientId: invoices.clientId, clientName: clients.name, currency: invoices.currency })
      .from(invoices)
      .innerJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(eq(invoices.orgId, org.id), eq(invoices.kind, "invoice"), inArray(invoices.status, ["sent", "partially_paid"])));
    const aging = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const byClient = new Map<string, { clientId: string; name: string; outstanding: number; overdue: number }>();
    const foreign = new Map<string, number>();
    const planned = await planPrincipalByDueDate(db, org.id);
    for (const i of open) {
      if (i.currency !== currency) {
        foreign.set(i.currency, (foreign.get(i.currency) ?? 0) + i.total - i.paid);
        continue;
      }
      const balance = i.total - i.paid;
      const row = byClient.get(i.clientId) ?? { clientId: i.clientId, name: i.clientName, outstanding: 0, overdue: 0 };
      row.outstanding += balance;
      // An invoice paid in instalments is only late for the instalments that are.
      const parts = planned.get(i.id) ?? [{ dueDate: i.dueDate, amount: balance }];
      const rest = balance - parts.reduce((a, p) => a + p.amount, 0);
      for (const p of rest > 0 ? [...parts, { dueDate: i.dueDate, amount: rest }] : parts) {
        const days = p.dueDate ? Math.round((Date.parse(today) - Date.parse(p.dueDate)) / 86_400_000) : 0;
        aging[agingBucket(days)] += p.amount;
        if (days > 0) row.overdue += p.amount;
      }
      byClient.set(i.clientId, row);
    }

    const billedByMonth = await db
      .select({ month: sql<string>`to_char(${invoices.issueDate}, 'YYYY-MM')`, amount: sql<number>`sum(${invoices.total})`.mapWith(Number) })
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), inCurrency, eq(invoices.kind, "invoice"), ne(invoices.status, "draft"), ne(invoices.status, "void"), gte(invoices.issueDate, start12)))
      .groupBy(sql`1`);
    const collectedByMonth = await db
      .select({ month: sql<string>`to_char(${payments.paidOn}, 'YYYY-MM')`, amount: sql<number>`sum(${payments.amount})`.mapWith(Number) })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.orgId, org.id), inCurrency, isNull(payments.voidedAt), ne(payments.method, "credit_note"), gte(payments.paidOn, start12)))
      .groupBy(sql`1`);
    // What's still unpaid from each month's invoices.
    const dueByMonth = await db
      .select({ month: sql<string>`to_char(${invoices.issueDate}, 'YYYY-MM')`, amount: sql<number>`sum(${invoices.total} - ${invoices.amountPaid})`.mapWith(Number) })
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), inCurrency, eq(invoices.kind, "invoice"), inArray(invoices.status, ["sent", "partially_paid"]), gte(invoices.issueDate, start12)))
      .groupBy(sql`1`);
    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 12 + i, 1)).toISOString().slice(0, 7));

    const [fy] = await db
      .select({ billed: sql<number>`coalesce(sum(${invoices.total}), 0)`.mapWith(Number) })
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), inCurrency, eq(invoices.kind, "invoice"), ne(invoices.status, "draft"), ne(invoices.status, "void"), gte(invoices.issueDate, fyStart)));
    const [fyPaid] = await db
      .select({ collected: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number) })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.orgId, org.id), inCurrency, isNull(payments.voidedAt), ne(payments.method, "credit_note"), gte(payments.paidOn, fyStart)));
    const [drafts] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(invoices)
      .where(and(eq(invoices.orgId, org.id), eq(invoices.status, "draft"), eq(invoices.kind, "invoice")));
    const recentPayments = await db
      .select({ id: payments.id, amount: payments.amount, currency: invoices.currency, paidOn: payments.paidOn, method: payments.method, clientName: clients.name, invoiceId: payments.invoiceId, invoiceNumber: invoices.number })
      .from(payments)
      .innerJoin(clients, eq(clients.id, payments.clientId))
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(and(eq(payments.orgId, org.id), isNull(payments.voidedAt), ne(payments.method, "credit_note")))
      .orderBy(desc(payments.paidOn), desc(payments.createdAt))
      .limit(6);

    return c.json({
      today,
      currency,
      financialYearStart: fyStart,
      billedThisYear: fy?.billed ?? 0,
      collectedThisYear: fyPaid?.collected ?? 0,
      outstanding: open.filter((i) => i.currency === currency).reduce((s, i) => s + i.total - i.paid, 0),
      foreignOutstanding: [...foreign.entries()].map(([code, amount]) => ({ currency: code, amount })),
      overdue: Object.entries(aging).reduce((s, [k, v]) => (k === "current" ? s : s + v), 0),
      drafts: drafts?.n ?? 0,
      aging,
      months: months.map((month) => ({
        month,
        billed: billedByMonth.find((b) => b.month === month)?.amount ?? 0,
        collected: collectedByMonth.find((b) => b.month === month)?.amount ?? 0,
        due: dueByMonth.find((b) => b.month === month)?.amount ?? 0,
      })),
      topClients: [...byClient.values()].sort((a, b) => b.outstanding - a.outstanding).slice(0, 6),
      recentPayments,
    });
  });

