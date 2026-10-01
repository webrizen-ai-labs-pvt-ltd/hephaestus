import { allPermissions, ROLE_PRESETS } from "@hephaestus/core";
import { invoices } from "@hephaestus/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hmacSha256Hex } from "./secrets.ts";
import { createTestApi, viewer } from "./test-utils.ts";

/* Acme: Fia (owner), Ace (accountant), Mo (member). Globex: Gus. */
const viewers = {
  fia: viewer("fia", "acme", ["owner"], allPermissions()),
  ace: viewer("ace", "acme", ["accountant"], ROLE_PRESETS.accountant!),
  mo: viewer("mo", "acme", ["member"], ROLE_PRESETS.member!),
  gus: viewer("gus", "globex", ["owner"], allPermissions()),
};

type Doc = { id: string; number: string | null; status: string; total: number; amountPaid: number; cgst: number; sgst: number; igst: number; supplyType: string; subtotal: number };
type DocDetail = { document: Doc; publicUrl: string | null; payments: { id: string; amount: number; method: string }[] };

let t: Awaited<ReturnType<typeof createTestApi>>;
const client: Record<string, string> = {};
let orgId = "";

const line = (rupees: number, taxRate = 18, quantity = 1) => ({ description: "Design work", quantity, unitPrice: rupees * 100, taxRate, hsnSac: "998391" });
const create = async (clientId: string, lines: unknown[], kind = "invoice", issueDate = "2026-10-01") =>
  (await t.call<{ document: { id: string } }>("fia", "/finance/documents", { kind, clientId, issueDate, lines })).json.document.id;
const detail = async (id: string, who = "fia") => (await t.call<DocDetail>(who, `/finance/documents/${id}`)).json;

beforeAll(async () => {
  t = await createTestApi(viewers);
  for (const v of Object.keys(viewers)) await t.call(v, "/me");
}, 60_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await t?.close();
});

describe("settings", () => {
  it("validates GSTIN and derives the state", async () => {
    expect((await t.call("fia", "/finance/settings", { gstin: "27AAPFU0939F1ZX" }, "PATCH")).status).toBe(400);
    expect((await t.call("fia", "/finance/settings", { legalName: "Acme Studio LLP", gstin: "27AAPFU0939F1ZV", razorpayKeyId: "rzp_test_123", razorpayKeySecret: "s3cret", razorpayWebhookSecret: "whsec" }, "PATCH")).status).toBe(200);
    const s = await t.call<{ settings: Record<string, unknown>; webhookUrl: string }>("fia", "/finance/settings");
    expect(s.json.settings.stateCode).toBe("27");
    expect(s.json.settings.razorpayConnected).toBe(true);
    expect(JSON.stringify(s.json)).not.toContain("s3cret");
    orgId = s.json.webhookUrl.split("/razorpay/")[1]!.split("/")[0]!;
  });

  it("is managed by admins only", async () => {
    expect((await t.call("ace", "/finance/settings", { legalName: "X" }, "PATCH")).status).toBe(403);
  });
});

describe("clients", () => {
  it("derives place of supply from GSTIN and clears it for clients abroad", async () => {
    client.mumbai = (await t.call<{ client: { id: string } }>("ace", "/clients", { name: "Spice Route", gstin: "27AAPFU0939F1ZV", email: "accounts@spiceroute.test" })).json.client.id;
    client.bengaluru = (await t.call<{ client: { id: string } }>("ace", "/clients", { name: "Kaveri Labs", stateCode: "29" })).json.client.id;
    client.us = (await t.call<{ client: { id: string } }>("ace", "/clients", { name: "Northwind Inc", country: "US", currency: "USD", stateCode: "27" })).json.client.id;
    const us = await t.call<{ client: { stateCode: string | null } }>("ace", `/clients/${client.us}`);
    expect(us.json.client.stateCode).toBeNull();
    expect((await t.call("ace", "/clients", { name: "spice route" })).status).toBe(409);
  });
});

describe("tax", () => {
  it("charges CGST + SGST in-state, IGST out of state, nothing on exports", async () => {
    const intra = (await detail(await create(client.mumbai!, [line(10_000)]))).document;
    expect(intra).toMatchObject({ supplyType: "intra", cgst: 90_000, sgst: 90_000, igst: 0, total: 1_180_000 });
    const inter = (await detail(await create(client.bengaluru!, [line(10_000)]))).document;
    expect(inter).toMatchObject({ supplyType: "inter", igst: 180_000, total: 1_180_000 });
    const exp = (await detail(await create(client.us!, [line(10_000)]))).document;
    expect(exp).toMatchObject({ supplyType: "export", igst: 0, cgst: 0, total: 1_000_000 });
  });
});

describe("issuing", () => {
  let inv = "";

  it("numbers documents per kind and financial year, without gaps", async () => {
    inv = await create(client.mumbai!, [line(50_000)]);
    const draft = await create(client.mumbai!, [line(100)]);
    expect((await detail(draft)).document.number).toBeNull();
    const a = await t.call<{ number: string }>("ace", `/finance/documents/${inv}/issue`, {});
    const b = await t.call<{ number: string }>("ace", `/finance/documents/${draft}/issue`, {});
    expect([a.json.number, b.json.number]).toEqual(["INV/26-27/0001", "INV/26-27/0002"]);
    const q = await create(client.mumbai!, [line(500)], "quote");
    expect((await t.call<{ number: string }>("ace", `/finance/documents/${q}/issue`, {})).json.number).toBe("QT/26-27/0001");
    // March belongs to the same financial year; April starts a new one.
    const april = await create(client.mumbai!, [line(1)], "invoice", "2027-04-02");
    expect((await t.call<{ number: string }>("ace", `/finance/documents/${april}/issue`, {})).json.number).toBe("INV/27-28/0001");
  });

  it("locks amounts once issued", async () => {
    expect((await t.call("ace", `/finance/documents/${inv}`, { lines: [line(1)] }, "PATCH")).status).toBe(409);
    expect((await t.call("ace", `/finance/documents/${inv}`, { dueDate: "2026-12-31" }, "PATCH")).status).toBe(200);
    expect((await t.call("ace", `/finance/documents/${inv}`, undefined, "DELETE")).status).toBe(409);
  });

  it("tracks payments, partial and full, and blocks overpayment", async () => {
    // ₹50,000 + 18% = ₹59,000
    expect((await t.call("ace", `/finance/documents/${inv}/payments`, { amount: 2_000_000, method: "upi", paidOn: "2026-10-05" })).status).toBe(201);
    expect((await detail(inv)).document).toMatchObject({ status: "partially_paid", amountPaid: 2_000_000 });
    expect((await t.call("ace", `/finance/documents/${inv}/payments`, { amount: 9_999_999, method: "upi", paidOn: "2026-10-05" })).status).toBe(422);
    expect((await t.call("mo", `/finance/documents/${inv}/payments`, { amount: 100, method: "cash", paidOn: "2026-10-05" })).status).toBe(403);
    await t.call("ace", `/finance/documents/${inv}/payments`, { amount: 3_900_000, method: "bank_transfer", paidOn: "2026-10-06", reference: "UTR123" });
    expect((await detail(inv)).document.status).toBe("paid");
  });

  it("refuses to void an invoice with payments, until they're voided", async () => {
    expect((await t.call("fia", `/finance/documents/${inv}/void`, {})).status).toBe(409);
    const d = await detail(inv);
    await t.call("fia", `/finance/payments/${d.payments[0]!.id}/void`, {});
    expect((await detail(inv)).document.status).toBe("partially_paid");
  });
});

describe("credit notes and quotes", () => {
  it("credit notes reduce the invoice balance, and voiding one restores it", async () => {
    const inv = await create(client.bengaluru!, [line(1000)]);
    await t.call("ace", `/finance/documents/${inv}/issue`, {});
    const cn = (await t.call<{ document: { id: string } }>("ace", `/finance/documents/${inv}/copy`, { as: "credit_note" })).json.document.id;
    await t.call("ace", `/finance/documents/${cn}`, { lines: [line(500)] }, "PATCH");
    const issued = await t.call<{ number: string }>("ace", `/finance/documents/${cn}/issue`, {});
    expect(issued.json.number).toBe("CN/26-27/0001");
    expect((await detail(inv)).document).toMatchObject({ status: "partially_paid", amountPaid: 59_000 });
    await t.call("fia", `/finance/documents/${cn}/void`, {});
    expect((await detail(inv)).document).toMatchObject({ status: "sent", amountPaid: 0 });
  });

  it("quotes convert into draft invoices", async () => {
    const q = await create(client.mumbai!, [line(2000), line(500, 5)], "quote");
    await t.call("ace", `/finance/documents/${q}/issue`, {});
    const inv = (await t.call<{ document: { id: string } }>("ace", `/finance/documents/${q}/copy`, { as: "invoice" })).json.document.id;
    const [qd, id] = [await detail(q), await detail(inv)];
    expect(qd.document.status).toBe("accepted");
    expect(id.document).toMatchObject({ status: "draft", total: qd.document.total });
  });
});

describe("client links", () => {
  it("open issued documents only, without signing in", async () => {
    const inv = await create(client.mumbai!, [line(750)]);
    expect((await detail(inv)).publicUrl).toBeNull();
    await t.call("ace", `/finance/documents/${inv}/issue`, {});
    const url = (await detail(inv)).publicUrl!;
    const pub = await t.call<{ document: { number: string }; seller: { legalName: string }; canPayOnline: boolean }>(null, `/public/invoices/${url.slice(3)}`);
    expect(pub.status).toBe(200);
    expect(pub.json.seller.legalName).toBe("Acme Studio LLP");
    expect(pub.json.canPayOnline).toBe(true);
    expect(JSON.stringify(pub.json)).not.toMatch(/razorpay|orgId|createdBy/i);
    expect((await t.call(null, "/public/invoices/not-a-real-token-at-all-123456")).status).toBe(404);
  });
});

describe("Razorpay", () => {
  let inv = "";

  it("creates a payment link for the balance", async () => {
    inv = await create(client.mumbai!, [line(1000)]);
    await t.call("ace", `/finance/documents/${inv}/issue`, {});
    const fetchMock = vi.fn(async () => Response.json({ id: "plink_ABC", short_url: "https://rzp.io/i/abc" }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await t.call<{ url: string }>("ace", `/finance/documents/${inv}/payment-link`, {});
    vi.unstubAllGlobals();
    expect(r.json.url).toBe("https://rzp.io/i/abc");
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent).toMatchObject({ amount: 118_000, currency: "INR" });
    const auth = new Headers((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get("authorization")!;
    expect(Buffer.from(auth.slice(6), "base64").toString()).toBe("rzp_test_123:s3cret");
  });

  it("records webhook payments once, and rejects bad signatures", async () => {
    const body = JSON.stringify({
      event: "payment_link.paid",
      payload: { payment_link: { entity: { id: "plink_ABC" } }, payment: { entity: { id: "pay_XYZ", amount: 118_000, method: "upi", created_at: 1_790_000_000 } } },
    });
    const post = (sig: string) =>
      t.app.request(`/public/razorpay/${orgId}/webhook`, { method: "POST", body, headers: { "x-razorpay-signature": sig, "content-type": "application/json" } });
    expect((await post("bad")).status).toBe(401);
    const sig = await hmacSha256Hex("whsec", body);
    expect((await post(sig)).status).toBe(204);
    // Razorpay retries; the second delivery must not double-count.
    await t.db.update(invoices).set({ paymentLinkId: "plink_ABC" }).where(eq(invoices.id, inv));
    expect((await post(sig)).status).toBe(204);
    const d = await detail(inv);
    expect(d.document.status).toBe("paid");
    expect(d.payments.filter((p) => p.method === "razorpay")).toHaveLength(1);
  });
});

describe("milestone billing", () => {
  it("creates one draft invoice when a billable milestone is completed", async () => {
    const p = (await t.call<{ project: { id: string } }>("fia", "/projects", { name: "Brand refresh", clientId: client.mumbai })).json.project.id;
    const m = (await t.call<{ milestone: { id: string } }>("fia", `/projects/${p}/milestones`, { name: "Logo delivery", amount: 2_500_000 })).json.milestone.id;
    const done = await t.call<{ invoiceId: string }>("fia", `/milestones/${m}`, { completed: true }, "PATCH");
    expect(done.json.invoiceId).toBeTruthy();
    expect((await detail(done.json.invoiceId)).document).toMatchObject({ status: "draft", total: 2_950_000 });
    await t.call("fia", `/milestones/${m}`, { completed: false }, "PATCH");
    const again = await t.call<{ invoiceId: string }>("fia", `/milestones/${m}`, { completed: true }, "PATCH");
    expect(again.json.invoiceId).toBe(done.json.invoiceId);
  });
});

describe("retainers", () => {
  it("issue on schedule, once per period", async () => {
    await t.call("ace", "/finance/recurring", { clientId: client.bengaluru, name: "Monthly support", nextIssueDate: "2026-09-01", lines: [line(20_000)] });
    const list = await t.call<{ documents: { recurringId: string | null; issueDate: string }[] }>("ace", "/finance/documents?status=draft");
    const generated = list.json.documents.filter((d) => d.recurringId);
    // Catches up: September and October.
    expect(generated.map((d) => d.issueDate).sort()).toEqual(["2026-09-01", "2026-10-01"]);
    await t.call("ace", "/finance/summary");
    const again = await t.call<{ documents: { recurringId: string | null }[] }>("ace", "/finance/documents?status=draft");
    expect(again.json.documents.filter((d) => d.recurringId)).toHaveLength(2);
  });
});

describe("access", () => {
  it("keeps finance away from regular members and other organizations", async () => {
    expect((await t.call("mo", "/finance/documents")).status).toBe(403);
    expect((await t.call("mo", "/finance/summary")).status).toBe(403);
    const any = (await t.call<{ documents: { id: string }[] }>("fia", "/finance/documents")).json.documents[0]!.id;
    expect((await t.call("gus", `/finance/documents/${any}`)).status).toBe(404);
    expect((await t.call("gus", `/clients/${client.mumbai}`)).status).toBe(404);
  });

  it("reports receivables", async () => {
    const s = await t.call<{ outstanding: number; aging: Record<string, number>; months: unknown[] }>("ace", "/finance/summary");
    expect(s.json.outstanding).toBeGreaterThan(0);
    expect(s.json.months).toHaveLength(12);
  });
});
