import { addMonths, can, emiSchedule, type InstallmentFrequency } from "@hephaestus/core";
import {
  Badge,
  type BadgeTone,
  Button,
  Card,
  cn,
  DateInput,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  Input,
  Meter,
  Segmented,
  Select,
} from "@hephaestus/ui";
import { Link } from "@tanstack/react-router";
import { Banknote, BellRing, CalendarClock, FileText, Link2, MoreHorizontal, ReceiptIndianRupee, Split, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, type Me } from "../../lib/api.ts";
import { type DocDetail, FINANCE_KEYS, type InstallmentRow, type InstallmentStatus, money, PAYMENT_METHOD_LABEL, toPaise, toRupees, useTaxRates } from "../../lib/finance.ts";
import { formatDate, useApiMutation } from "../../lib/people.ts";

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const STATUS: Record<InstallmentStatus | "overdue", { label: string; tone: BadgeTone }> = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  billed: { label: "Due", tone: "collab" },
  overdue: { label: "Overdue", tone: "danger" },
  paid: { label: "Paid", tone: "people" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const rowStatus = (r: InstallmentRow, today: string) => (r.status === "billed" && r.dueDate < today ? "overdue" : r.status);

/* ---------------- Split into instalments ---------------- */

export function SplitDialog({ open, onOpenChange, detail }: { open: boolean; onOpenChange: (o: boolean) => void; detail: DocDetail }) {
  const d = detail.document;
  const balance = d.total - d.amountPaid;
  const gstApplies = Boolean(detail.seller.gstin) && d.supplyType !== "export";
  const { data: rates } = useTaxRates();
  const [count, setCount] = useState("6");
  const [frequency, setFrequency] = useState<InstallmentFrequency>("monthly");
  const [rate, setRate] = useState("12");
  const [taxRate, setTaxRate] = useState("18");
  const [firstDueDate, setFirstDueDate] = useState(addMonths(todayLocal(), 1));

  const n = Math.round(Number(count));
  const annual = Number(rate);
  const valid = n >= 2 && n <= 60 && annual >= 0 && annual <= 60 && firstDueDate >= todayLocal();
  const gst = gstApplies ? Number(taxRate) : 0;
  const preview = valid ? emiSchedule({ principal: balance, annualRatePct: annual, count: n, frequency, firstDueDate }) : null;
  const gstTotal = preview ? preview.rows.reduce((a, r) => a + Math.round((r.interest * gst) / 100), 0) : 0;

  const create = useApiMutation(
    () =>
      api(`finance/documents/${d.id}/installments`, {
        method: "POST",
        body: JSON.stringify({ count: n, frequency, annualRate: annual, interestTaxRate: gst, firstDueDate }),
      }),
    { invalidate: FINANCE_KEYS, success: "Instalment plan created", onSuccess: () => onOpenChange(false) },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        title="Split into instalments"
        icon={Split}
        description={`${money(balance, d.currency)} still owed on ${d.number}, repaid in equal instalments with interest on the reducing balance.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!valid || create.isPending} onClick={() => create.mutate(undefined)}>
              Create plan
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instalments">
            <Input type="number" min={2} max={60} value={count} onChange={(e) => setCount(e.target.value)} className="font-mono" autoFocus />
          </Field>
          <Field label="Every">
            <Segmented
              variant="toggle"
              aria-label="Frequency"
              value={frequency}
              onChange={(v) => setFrequency(v)}
              items={[
                { key: "monthly", label: "Month" },
                { key: "quarterly", label: "Quarter" },
              ]}
            />
          </Field>
          <Field label="Interest (% a year)" hint="0 for no interest">
            <Input type="number" min={0} max={60} step="0.25" value={rate} onChange={(e) => setRate(e.target.value)} className="font-mono" />
          </Field>
          <Field label="First instalment due">
            <DateInput value={firstDueDate} onChange={(v) => setFirstDueDate(v)} />
          </Field>
          <Field
            label="GST on interest"
            hint={gstApplies ? "Interest on deferred payment is part of the value of supply, so it's taxed. Each instalment's interest gets its own GST invoice." : detail.seller.gstin ? "Exports are zero-rated." : "You're not GST-registered, so no GST is charged."}
            className="sm:col-span-2"
          >
            <Select value={gstApplies ? taxRate : "0"} onChange={(e) => setTaxRate(e.target.value)} disabled={!gstApplies}>
              {[...new Set([0, 5, 12, 18, 28, ...(rates?.taxRates.map((r) => r.rate) ?? [])])]
                .sort((a, b) => a - b)
                .map((r) => (
                  <option key={r} value={String(r)}>
                    {r}%
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        {preview ? (
          <div className="mt-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Each instalment", money(preview.emi, d.currency)],
                ["Total interest", money(preview.totalInterest, d.currency)],
                ["GST on interest", money(gstTotal, d.currency)],
                ["Client pays in all", money(balance + preview.totalInterest + gstTotal, d.currency)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-secondary px-3 py-2">
                  <div className="text-xs text-tertiary">{k}</div>
                  <div className="font-mono text-sm font-semibold text-primary">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-secondary">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-primary">
                  <tr className="border-b border-secondary text-left text-xs text-tertiary">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Due</th>
                    <th className="px-3 py-2 text-right font-medium">Principal</th>
                    <th className="px-3 py-2 text-right font-medium">Interest</th>
                    <th className="px-3 py-2 text-right font-medium">Balance after</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-secondary">
                  {preview.rows.map((r) => (
                    <tr key={r.seq}>
                      <td className="px-3 py-1.5 text-tertiary">{r.seq}</td>
                      <td className="px-3 py-1.5">{formatDate(r.dueDate, { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{money(r.principal, d.currency)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{money(r.interest, d.currency)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-tertiary">{money(r.balanceAfter, d.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-tertiary">
              {d.number} itself doesn't change. A week before each instalment is due, its interest invoice is issued and the client is emailed with a link to pay.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-tertiary">Choose 2 to 60 instalments, interest up to 60% a year, and a first due date from today.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Paying an instalment ---------------- */

function PayDialog({ row, currency, onClose }: { row: InstallmentRow; currency: string; onClose: () => void }) {
  const due = row.total - row.amountPaid;
  const [amount, setAmount] = useState(toRupees(due));
  const [method, setMethod] = useState("bank_transfer");
  const [paidOn, setPaidOn] = useState(todayLocal());
  const [reference, setReference] = useState("");
  const record = useApiMutation(
    () => api(`finance/installments/${row.id}/payments`, { method: "POST", body: JSON.stringify({ amount: toPaise(amount), method, paidOn, reference: reference || null }) }),
    { invalidate: FINANCE_KEYS, success: `Payment recorded for instalment ${row.seq}`, onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Record instalment ${row.seq}`}
        icon={Banknote}
        iconColor="success"
        description={`${money(due, currency)} due${row.interestInvoice ? `. It pays interest invoice ${row.interestInvoice.number} first, then the principal.` : "."}`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={record.isPending || toPaise(amount) <= 0} onClick={() => record.mutate(undefined)}>
              Record payment
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)">
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" autoFocus />
          </Field>
          <Field label="Received on">
            <DateInput value={paidOn} onChange={(v) => setPaidOn(v)} />
          </Field>
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {["bank_transfer", "upi", "cash", "cheque", "card", "other"].map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference" hint="UTR, cheque number, …">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- The schedule ---------------- */

export function InstallmentsCard({ me, detail }: { me: Me; detail: DocDetail }) {
  const s = detail.installments!;
  const d = detail.document;
  const p = me.org.permissions;
  const today = todayLocal();
  const [paying, setPaying] = useState<InstallmentRow | null>(null);
  const active = s.plan.status === "active";
  const paidCount = s.installments.filter((r) => r.status === "paid").length;
  const paidTotal = s.installments.reduce((a, r) => a + r.amountPaid, 0);
  const total = s.installments.reduce((a, r) => a + r.total, 0);

  const remind = useApiMutation((id: string) => api(`finance/installments/${id}/remind`, { method: "POST" }), { invalidate: FINANCE_KEYS, success: "Emailed the client" });
  const bill = useApiMutation((id: string) => api(`finance/installments/${id}/bill`, { method: "POST" }), { invalidate: FINANCE_KEYS, success: "Interest invoice issued" });
  const link = useApiMutation((id: string) => api<{ url: string }>(`finance/installments/${id}/payment-link`, { method: "POST" }), {
    invalidate: FINANCE_KEYS,
    onSuccess: (r) => {
      void navigator.clipboard?.writeText(r.url);
      toast.success("Payment link copied");
    },
  });
  const cancel = useApiMutation(() => api(`finance/documents/${d.id}/installments/cancel`, { method: "POST" }), { invalidate: FINANCE_KEYS, success: "Instalment plan cancelled" });

  return (
    <Card className="p-4 sm:p-6 print:hidden">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-bold">
            <CalendarClock className="size-4 text-tertiary" /> Instalments
            {!active ? (
              <Badge tone="people" dot pill>
                Completed
              </Badge>
            ) : null}
          </h2>
          <p className="mt-1 text-sm text-tertiary">
            {s.plan.count} {s.plan.frequency === "monthly" ? "monthly" : "quarterly"} instalments of about {money(s.plan.emi, d.currency)}, at {s.plan.annualRate}% a year on the reducing balance
            {s.plan.interestTaxRate ? `, plus ${s.plan.interestTaxRate}% GST on the interest` : ""}.
          </p>
        </div>
        {active && can(p, "invoice", "update") ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              confirm("Cancel this plan? Unpaid instalments are dropped and the rest of the balance is owed on the invoice again. Interest invoices already issued stay open.") && cancel.mutate(undefined)
            }
          >
            <X /> Cancel plan
          </Button>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-tertiary">
          <span>
            {paidCount} of {s.plan.count} paid
          </span>
          <span className="font-mono">
            {money(paidTotal, d.currency)} of {money(total, d.currency)}
          </span>
        </div>
        <Meter value={paidTotal} max={total} color="var(--chart-collected)" label="Share of the plan paid" />
      </div>

      <div className="-mx-4 mt-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-secondary text-left text-xs text-tertiary">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Due</th>
              <th className="px-2 py-2 text-right font-medium">Principal</th>
              <th className="px-2 py-2 text-right font-medium">Interest</th>
              <th className="px-2 py-2 text-right font-medium">GST</th>
              <th className="px-2 py-2 text-right font-medium">Total</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-secondary">
            {s.installments.map((r) => {
              const st = rowStatus(r, today);
              const open = r.status === "scheduled" || r.status === "billed";
              return (
                <tr key={r.id} className={cn(r.status === "paid" && "text-tertiary")}>
                  <td className="px-2 py-2 text-tertiary">{r.seq}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatDate(r.dueDate, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-2 py-2 text-right font-mono">{money(r.principal, d.currency)}</td>
                  <td className="px-2 py-2 text-right font-mono">
                    {r.interestInvoice ? (
                      <Link to="/finance/invoices/$id" params={{ id: r.interestInvoice.id }} className="hover:underline" title={`Interest invoice ${r.interestInvoice.number}`}>
                        {money(r.interest, d.currency)}
                      </Link>
                    ) : (
                      money(r.interest, d.currency)
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{money(r.interestTax, d.currency)}</td>
                  <td className="px-2 py-2 text-right font-mono font-medium text-primary">
                    {money(r.total, d.currency)}
                    {r.amountPaid > 0 && r.status !== "paid" ? <div className="text-[11px] font-normal text-tertiary">{money(r.amountPaid, d.currency)} paid</div> : null}
                  </td>
                  <td className="px-2 py-2">
                    <Badge tone={STATUS[st].tone} dot pill>
                      {STATUS[st].label}
                    </Badge>
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    {open || r.interestInvoice ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label={`Actions for instalment ${r.seq}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          {open && can(p, "payment", "record") ? (
                            <DropdownMenuItem onSelect={() => setPaying(r)}>
                              <ReceiptIndianRupee /> Record payment
                            </DropdownMenuItem>
                          ) : null}
                          {open && detail.seller.razorpayConnected && can(p, "invoice", "send") ? (
                            <DropdownMenuItem
                              onSelect={() =>
                                r.paymentLinkUrl && r.amountPaid === 0 ? (void navigator.clipboard?.writeText(r.paymentLinkUrl), toast.success("Payment link copied")) : link.mutate(r.id)
                              }
                            >
                              <Link2 /> {r.paymentLinkUrl ? "Copy payment link" : "Create Razorpay link"}
                            </DropdownMenuItem>
                          ) : null}
                          {open && can(p, "invoice", "send") ? (
                            <DropdownMenuItem onSelect={() => remind.mutate(r.id)}>
                              <BellRing /> {r.status === "scheduled" ? "Bill and email now" : "Email a reminder"}
                            </DropdownMenuItem>
                          ) : null}
                          {r.status === "scheduled" && r.interest > 0 && can(p, "invoice", "send") ? (
                            <DropdownMenuItem onSelect={() => bill.mutate(r.id)}>
                              <FileText /> Issue interest invoice now
                            </DropdownMenuItem>
                          ) : null}
                          {r.interestInvoice ? (
                            <>
                              {open ? <DropdownMenuSeparator /> : null}
                              <DropdownMenuItem asChild>
                                <Link to="/finance/invoices/$id" params={{ id: r.interestInvoice.id }}>
                                  <FileText /> Interest invoice {r.interestInvoice.number}
                                </Link>
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-tertiary">
        Each instalment is billed a week before it's due: its interest invoice is issued and the client gets an email with a link to pay. Overdue instalments get a reminder the day after, then weekly.
      </p>
      {paying ? <PayDialog row={paying} currency={d.currency} onClose={() => setPaying(null)} /> : null}
    </Card>
  );
}
