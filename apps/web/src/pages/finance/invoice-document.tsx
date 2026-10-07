import { amountInWords, INDIAN_STATES } from "@operant/core";
import { cn } from "@operant/ui";
import { type ClientInfo, type Doc, type DocKind, type Line, money, type Seller } from "../../lib/finance.ts";

/*
 * The printable document (tax invoice, quote or credit note). Used in the app
 * and on the client's public page. Prints on A4 via the browser's print to PDF.
 */

const TITLE: Record<DocKind, string> = { invoice: "Tax invoice", quote: "Quotation", credit_note: "Credit note" };

const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const state = (code: string | null) => (code ? `${INDIAN_STATES[code] ?? code} (${code})` : null);

type DocLike = Pick<
  Doc,
  "kind" | "number" | "status" | "issueDate" | "dueDate" | "currency" | "placeOfSupply" | "supplyType" | "subtotal" | "discountTotal" | "taxableTotal" | "cgst" | "sgst" | "igst" | "roundOff" | "total" | "amountPaid" | "notes" | "terms"
>;

export function InvoiceDocument({ doc, lines, seller, client, className }: { doc: DocLike; lines: Line[]; seller: Seller; client: ClientInfo; className?: string }) {
  const m = (p: number) => money(p, doc.currency);
  const hasDiscount = lines.some((l) => l.discountPct > 0);
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const l of lines) {
    const row = byRate.get(l.taxRate) ?? { taxable: 0, tax: 0 };
    row.taxable += l.amount ?? 0;
    row.tax += l.taxAmount ?? 0;
    byRate.set(l.taxRate, row);
  }
  const balance = doc.total - doc.amountPaid;
  const bank = seller.bank ?? {};

  return (
    <article className={cn("invoice-doc relative bg-white p-8 text-[13px] leading-relaxed text-[#1a1715] sm:p-10", className)}>
      {doc.status === "void" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 rounded-lg border-4 border-[#b81f33]/40 px-8 py-2 font-display text-6xl font-bold text-[#b81f33]/30">VOID</span>
        </div>
      ) : null}
      {doc.status === "paid" ? (
        <div className="pointer-events-none absolute right-10 top-28 -rotate-12 rounded-lg border-4 border-[#2e8b6e]/50 px-5 py-1 font-display text-3xl font-bold text-[#2e8b6e]/60">PAID</div>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-[#1a1715] pb-5">
        <div className="max-w-sm">
          <div className="font-display text-xl font-bold">{seller.legalName ?? seller.name}</div>
          {seller.address ? <div className="whitespace-pre-line text-[#5f574e]">{seller.address}</div> : null}
          <div className="mt-1 space-x-3 text-[#5f574e]">
            {seller.gstin ? <span>GSTIN <b className="font-mono text-[#1a1715]">{seller.gstin}</b></span> : null}
            {seller.pan ? <span>PAN <b className="font-mono text-[#1a1715]">{seller.pan}</b></span> : null}
          </div>
          {seller.email || seller.phone ? <div className="text-[#5f574e]">{[seller.email, seller.phone].filter(Boolean).join(" · ")}</div> : null}
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold uppercase tracking-wide">{doc.kind === "invoice" && !seller.gstin ? "Invoice" : TITLE[doc.kind]}</div>
          <div className="mt-1 font-mono text-base">{doc.number ?? "Draft"}</div>
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-4 text-[#5f574e]">
            <dt>Date</dt>
            <dd className="text-[#1a1715]">{fmtDate(doc.issueDate)}</dd>
            {doc.dueDate && doc.kind !== "credit_note" ? (
              <>
                <dt>{doc.kind === "quote" ? "Valid until" : "Due"}</dt>
                <dd className="text-[#1a1715]">{fmtDate(doc.dueDate)}</dd>
              </>
            ) : null}
            {doc.supplyType !== "export" && doc.placeOfSupply ? (
              <>
                <dt>Place of supply</dt>
                <dd className="text-[#1a1715]">{state(doc.placeOfSupply)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </header>

      <section className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8a8178]">Bill to</div>
          <div className="mt-1 font-semibold">{client.legalName ?? client.name}</div>
          {client.billingAddress ? <div className="whitespace-pre-line text-[#5f574e]">{client.billingAddress}</div> : null}
          {client.country !== "IN" ? <div className="text-[#5f574e]">{client.country}</div> : null}
          {client.gstin ? (
            <div className="text-[#5f574e]">
              GSTIN <b className="font-mono text-[#1a1715]">{client.gstin}</b>
            </div>
          ) : client.stateCode ? (
            <div className="text-[#5f574e]">{state(client.stateCode)}</div>
          ) : null}
        </div>
        {doc.supplyType === "export" ? (
          <div className="self-end text-right text-[#5f574e]">Export of services, zero-rated (under LUT)</div>
        ) : null}
      </section>

      <table className="mt-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-y border-[#1a1715]/80 text-[11px] uppercase tracking-wider text-[#5f574e]">
            <th className="py-2 pr-2 font-semibold">#</th>
            <th className="py-2 pr-2 font-semibold">Description</th>
            <th className="py-2 pr-2 font-semibold">HSN/SAC</th>
            <th className="py-2 pr-2 text-right font-semibold">Qty</th>
            <th className="py-2 pr-2 text-right font-semibold">Rate</th>
            {hasDiscount ? <th className="py-2 pr-2 text-right font-semibold">Disc.</th> : null}
            {doc.supplyType !== "export" ? <th className="py-2 pr-2 text-right font-semibold">GST</th> : null}
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id ?? i} className="border-b border-[#e2dace] align-top">
              <td className="py-2 pr-2 text-[#8a8178]">{i + 1}</td>
              <td className="py-2 pr-2 whitespace-pre-line">{l.description}</td>
              <td className="py-2 pr-2 font-mono text-xs">{l.hsnSac ?? ""}</td>
              <td className="py-2 pr-2 text-right font-mono">
                {Number(l.quantity)}
                {l.unit && l.unit !== "unit" ? <span className="text-[#8a8178]"> {l.unit}</span> : null}
              </td>
              <td className="py-2 pr-2 text-right font-mono">{m(l.unitPrice)}</td>
              {hasDiscount ? <td className="py-2 pr-2 text-right font-mono">{l.discountPct ? `${Number(l.discountPct)}%` : ""}</td> : null}
              {doc.supplyType !== "export" ? <td className="py-2 pr-2 text-right font-mono">{Number(l.taxRate)}%</td> : null}
              <td className="py-2 text-right font-mono">{m(l.amount ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-5 flex flex-wrap justify-between gap-6">
        <div className="max-w-sm flex-1 space-y-4">
          {doc.supplyType !== "export" && byRate.size ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#8a8178]">
                  <th className="pb-1 font-semibold">Tax rate</th>
                  <th className="pb-1 text-right font-semibold">Taxable</th>
                  {doc.supplyType === "intra" ? (
                    <>
                      <th className="pb-1 text-right font-semibold">CGST</th>
                      <th className="pb-1 text-right font-semibold">SGST</th>
                    </>
                  ) : (
                    <th className="pb-1 text-right font-semibold">IGST</th>
                  )}
                </tr>
              </thead>
              <tbody className="font-mono">
                {[...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, row]) => (
                  <tr key={rate}>
                    <td className="font-sans">{rate}%</td>
                    <td className="text-right">{m(row.taxable)}</td>
                    {doc.supplyType === "intra" ? (
                      <>
                        <td className="text-right">{m(Math.floor(row.tax / 2))}</td>
                        <td className="text-right">{m(row.tax - Math.floor(row.tax / 2))}</td>
                      </>
                    ) : (
                      <td className="text-right">{m(row.tax)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8a8178]">Amount in words</div>
            <div className="font-medium">{amountInWords(doc.total, doc.currency)}</div>
          </div>
        </div>

        <dl className="grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt className="text-[#5f574e]">Subtotal</dt>
          <dd className="text-right font-mono">{m(doc.subtotal)}</dd>
          {doc.discountTotal ? (
            <>
              <dt className="text-[#5f574e]">Discount</dt>
              <dd className="text-right font-mono">−{m(doc.discountTotal)}</dd>
              <dt className="text-[#5f574e]">Taxable value</dt>
              <dd className="text-right font-mono">{m(doc.taxableTotal)}</dd>
            </>
          ) : null}
          {doc.cgst ? (
            <>
              <dt className="text-[#5f574e]">CGST</dt>
              <dd className="text-right font-mono">{m(doc.cgst)}</dd>
              <dt className="text-[#5f574e]">SGST</dt>
              <dd className="text-right font-mono">{m(doc.sgst)}</dd>
            </>
          ) : null}
          {doc.igst ? (
            <>
              <dt className="text-[#5f574e]">IGST</dt>
              <dd className="text-right font-mono">{m(doc.igst)}</dd>
            </>
          ) : null}
          {doc.roundOff ? (
            <>
              <dt className="text-[#5f574e]">Round off</dt>
              <dd className="text-right font-mono">{doc.roundOff > 0 ? "" : "−"}{m(Math.abs(doc.roundOff))}</dd>
            </>
          ) : null}
          <dt className="mt-1 border-t-2 border-[#1a1715] pt-2 font-display text-base font-bold">Total</dt>
          <dd className="mt-1 border-t-2 border-[#1a1715] pt-2 text-right font-mono text-base font-bold">{m(doc.total)}</dd>
          {doc.kind === "invoice" && doc.amountPaid ? (
            <>
              <dt className="text-[#5f574e]">Paid</dt>
              <dd className="text-right font-mono">−{m(doc.amountPaid)}</dd>
              <dt className="font-semibold">Balance due</dt>
              <dd className="text-right font-mono font-semibold">{m(balance)}</dd>
            </>
          ) : null}
        </dl>
      </section>

      {doc.kind === "invoice" && (bank.accountNumber || bank.upiId) ? (
        <section className="mt-6 rounded-lg bg-[#f5f1ea] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8a8178]">Pay by bank transfer</div>
          <div className="mt-1 grid gap-x-6 sm:grid-cols-2">
            {bank.accountName ? <div>Account name: <b>{bank.accountName}</b></div> : null}
            {bank.accountNumber ? <div>Account no.: <b className="font-mono">{bank.accountNumber}</b></div> : null}
            {bank.ifsc ? <div>IFSC: <b className="font-mono">{bank.ifsc}</b></div> : null}
            {bank.bankName ? <div>Bank: <b>{bank.bankName}</b></div> : null}
            {bank.upiId ? <div>UPI: <b className="font-mono">{bank.upiId}</b></div> : null}
          </div>
        </section>
      ) : null}

      {doc.notes || doc.terms ? (
        <section className="mt-6 grid gap-4 text-[#5f574e] sm:grid-cols-2">
          {doc.notes ? (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8a8178]">Notes</div>
              <div className="whitespace-pre-line">{doc.notes}</div>
            </div>
          ) : null}
          {doc.terms ? (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8a8178]">Terms</div>
              <div className="whitespace-pre-line">{doc.terms}</div>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className="mt-10 flex items-end justify-between gap-6 text-xs text-[#8a8178]">
        <span>{doc.kind === "invoice" ? "This is a computer-generated invoice." : "This is a computer-generated document."}</span>
        <span className="text-right">
          For {seller.legalName ?? seller.name}
          <br />
          <span className="mt-8 inline-block border-t border-[#8a8178] pt-1">Authorised signatory</span>
        </span>
      </footer>
    </article>
  );
}
