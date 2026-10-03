import { Button, Logo, Skeleton } from "@hephaestus/ui";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Printer } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api.ts";
import { type ClientInfo, type Doc, type Line, money, type Seller } from "../../lib/finance.ts";
import { InvoiceDocument } from "./invoice-document.tsx";

/** What a client sees from an emailed link: no sign-in, just the document and a way to pay. */
export function PublicInvoicePage() {
  const token = window.location.pathname.split("/")[2] ?? "";
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ["public-invoice", token],
    queryFn: () => api<{ document: Doc; lines: Line[]; client: ClientInfo; seller: Seller; canPayOnline: boolean }>(`public/invoices/${token}`),
    retry: false,
  });

  const pay = async () => {
    setPaying(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>(`public/invoices/${token}/pay`, { method: "POST" });
      window.location.href = url;
    } catch (e) {
      setError((e as Error).message);
      setPaying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Skeleton className="h-[700px] w-full" />
      </div>
    );
  }
  if (loadError || !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">This link isn't valid</h1>
          <p className="mt-2 text-sm text-tertiary">Ask the sender for a new link.</p>
        </div>
      </div>
    );
  }

  const d = data.document;
  const balance = d.total - d.amountPaid;
  const title = { invoice: "Invoice", quote: "Quote", credit_note: "Credit note" }[d.kind];

  return (
    <div className="min-h-dvh bg-secondary pb-16">
      <header className="border-b border-secondary bg-primary print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-tertiary">
              {title} from {data.seller.legalName ?? data.seller.name}
            </div>
            <div className="font-display text-2xl font-bold">
              {d.kind === "invoice" && d.status !== "paid" && d.status !== "void" ? `${money(balance, d.currency)} due` : money(d.total, d.currency)}
            </div>
            {d.kind === "invoice" && d.dueDate && d.status !== "paid" && d.status !== "void" ? (
              <div className="text-xs text-tertiary">by {new Date(`${d.dueDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
            ) : null}
          </div>
          {d.status === "paid" ? <span className="rounded-full bg-success-solid/15 px-3 py-1 text-sm font-medium text-success-primary">Paid. Thank you!</span> : null}
          {d.status === "void" ? <span className="rounded-full bg-secondary px-3 py-1 text-sm text-tertiary">This document was cancelled</span> : null}
          <Button onClick={() => window.print()}>
            <Printer /> Download PDF
          </Button>
          {data.canPayOnline ? (
            <Button variant="primary" size="lg" onClick={() => void pay()} disabled={paying}>
              <CreditCard /> {paying ? "Opening…" : "Pay now"}
            </Button>
          ) : null}
        </div>
        {error ? <p className="mx-auto max-w-4xl px-6 pb-3 text-sm text-error-primary">{error}</p> : null}
      </header>
      <main className="mx-auto mt-6 max-w-4xl px-4 sm:px-6">
        <div className="overflow-x-auto rounded-xl border border-secondary shadow-[0_24px_64px_-32px_rgb(0_0_0/0.5)]">
          <InvoiceDocument doc={d} lines={data.lines} seller={data.seller} client={data.client} className="min-w-[640px]" />
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-tertiary print:hidden">
          <Logo className="size-4" /> Sent with Hephaestus by Webrizen
        </p>
      </main>
    </div>
  );
}
