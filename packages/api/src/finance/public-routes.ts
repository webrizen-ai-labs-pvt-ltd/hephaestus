import { clients, invoiceLines, invoices, notifications, orgs, payments } from "@hephaestus/db";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../context.ts";
import { hmacSha256Hex, safeEqual, sha256Hex } from "../secrets.ts";
import { createPaymentLink, loadSettings, refreshPaid } from "./service.ts";

/*
 * Unauthenticated routes. The client-facing invoice page is reached with an
 * unguessable link token; Razorpay webhooks are verified by signature.
 */

async function byToken(db: AppEnv["Variables"]["deps"]["db"], token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new HTTPException(404, { message: "This link isn't valid" });
  const [inv] = await db.select().from(invoices).where(eq(invoices.publicTokenHash, await sha256Hex(token)));
  if (!inv || inv.status === "draft") throw new HTTPException(404, { message: "This link isn't valid" });
  return inv;
}

export const financePublicRoutes = new Hono<AppEnv>()

  .get("/public/invoices/:token", async (c) => {
    const { db } = c.get("deps");
    const inv = await byToken(db, c.req.param("token"));
    const settings = await loadSettings(db, inv.orgId);
    const [org] = await db.select({ name: orgs.name }).from(orgs).where(eq(orgs.id, inv.orgId));
    const [client] = await db.select().from(clients).where(eq(clients.id, inv.clientId));
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id)).orderBy(asc(invoiceLines.position));
    c.header("cache-control", "no-store");
    c.header("x-robots-tag", "noindex");
    return c.json({
      document: {
        kind: inv.kind,
        number: inv.number,
        status: inv.status,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        currency: inv.currency,
        placeOfSupply: inv.placeOfSupply,
        supplyType: inv.supplyType,
        subtotal: inv.subtotal,
        discountTotal: inv.discountTotal,
        taxableTotal: inv.taxableTotal,
        cgst: inv.cgst,
        sgst: inv.sgst,
        igst: inv.igst,
        roundOff: inv.roundOff,
        total: inv.total,
        amountPaid: inv.amountPaid,
        notes: inv.notes,
        terms: inv.terms,
      },
      lines: lines.map(({ orgId: _, invoiceId: __, itemId: ___, ...l }) => l),
      client: {
        name: client!.name,
        legalName: client!.legalName,
        gstin: client!.gstin,
        billingAddress: client!.billingAddress,
        stateCode: client!.stateCode,
        country: client!.country,
      },
      seller: {
        name: org!.name,
        legalName: settings.legalName,
        gstin: settings.gstin,
        pan: settings.pan,
        stateCode: settings.stateCode,
        address: settings.address,
        email: settings.email,
        phone: settings.phone,
        bank: settings.bank,
      },
      canPayOnline: inv.kind === "invoice" && ["sent", "partially_paid"].includes(inv.status) && Boolean(settings.razorpayKeyId && settings.razorpayKeySecretEnc),
    });
  })

  .post("/public/invoices/:token/pay", async (c) => {
    const deps = c.get("deps");
    const inv = await byToken(deps.db, c.req.param("token"));
    // Reuse a link created for the current balance; otherwise make a new one.
    const url = inv.paymentLinkUrl ?? (await createPaymentLink(deps, inv, await loadSettings(deps.db, inv.orgId)));
    return c.json({ url });
  })

  .post("/public/razorpay/:orgId/webhook", async (c) => {
    const { db, secrets } = c.get("deps");
    const orgId = c.req.param("orgId");
    if (!z.uuid().safeParse(orgId).success) return c.text("Not found", 404);
    const settings = await loadSettings(db, orgId).catch(() => null);
    if (!settings?.razorpayWebhookSecretEnc) return c.text("Webhook not configured", 404);

    const raw = await c.req.text();
    const signature = c.req.header("x-razorpay-signature") ?? "";
    const expected = await hmacSha256Hex(await secrets.decrypt(settings.razorpayWebhookSecretEnc), raw);
    if (!safeEqual(signature, expected)) return c.text("Invalid signature", 401);

    const event = JSON.parse(raw) as {
      event: string;
      payload?: {
        payment_link?: { entity?: { id?: string; notes?: Record<string, string> } };
        payment?: { entity?: { id?: string; amount?: number; method?: string; created_at?: number } };
      };
    };
    if (event.event !== "payment_link.paid") return c.body(null, 204);

    const link = event.payload?.payment_link?.entity;
    const pay = event.payload?.payment?.entity;
    if (!link?.id || !pay?.id || !pay.amount) return c.body(null, 204);
    const [inv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.paymentLinkId, link.id)));
    if (!inv) return c.body(null, 204);

    const paidOn = new Date((pay.created_at ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10);
    const inserted = await db
      .insert(payments)
      .values({
        orgId,
        invoiceId: inv.id,
        clientId: inv.clientId,
        amount: pay.amount,
        method: "razorpay",
        paidOn,
        reference: pay.id,
        notes: pay.method ? `Paid online by ${pay.method}` : "Paid online",
        gatewayPaymentId: pay.id,
        createdBy: "razorpay",
      })
      .onConflictDoNothing()
      .returning({ id: payments.id });
    if (inserted.length) {
      // A link is for one balance; the next reminder or "Pay now" makes a fresh one.
      await db.update(invoices).set({ paymentLinkId: null, paymentLinkUrl: null }).where(eq(invoices.id, inv.id));
      await refreshPaid(db, inv.id);
      if (inv.createdBy && inv.createdBy !== "system") {
        await db.insert(notifications).values({
          orgId,
          recipientId: inv.createdBy,
          type: "payment.received",
          title: `Payment received for ${inv.number}`,
          body: `₹${(pay.amount / 100).toLocaleString("en-IN")} paid online`,
          link: `/finance/invoices/${inv.id}`,
        });
      }
    }
    return c.body(null, 204);
  });

