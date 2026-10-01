import { computeTotals, type SupplyType } from "@hephaestus/core";
import { Button, Input, Select } from "@hephaestus/ui";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { type Line, money, toPaise, toRupees, useItems, useTaxRates } from "../../lib/finance.ts";

export const emptyLine = (taxRate = 18): Line => ({ description: "", quantity: 1, unitPrice: 0, discountPct: 0, taxRate, hsnSac: null, unit: null });

/** Editable line items with a live tax and total preview. */
export function LineEditor({
  lines,
  onChange,
  supplyType,
  currency,
  roundOff = true,
}: {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  supplyType: SupplyType;
  currency: string;
  roundOff?: boolean;
}) {
  const { data: items } = useItems();
  const { data: rates } = useTaxRates();
  const defaultRate = rates?.taxRates.find((r) => r.isDefault)?.rate ?? 18;
  const totals = computeTotals(lines, supplyType, { roundOff });
  const m = (p: number) => money(p, currency);
  const update = (i: number, patch: Partial<Line>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const rateOptions = [...new Set([...(rates?.taxRates.map((r) => Number(r.rate)) ?? [0, 5, 18, 40]), ...lines.map((l) => Number(l.taxRate))])].sort((a, b) => a - b);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-6" />
              <th className="py-2 pr-2 font-medium">Item or description</th>
              <th className="w-24 py-2 pr-2 font-medium">HSN/SAC</th>
              <th className="w-20 py-2 pr-2 text-right font-medium">Qty</th>
              <th className="w-32 py-2 pr-2 text-right font-medium">Rate (₹)</th>
              <th className="w-20 py-2 pr-2 text-right font-medium">Disc. %</th>
              <th className="w-24 py-2 pr-2 font-medium">{supplyType === "export" ? "Tax" : "GST"}</th>
              <th className="w-32 py-2 text-right font-medium">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-border align-top">
                <td className="pt-3 text-muted-foreground">
                  <GripVertical className="size-4" />
                </td>
                <td className="py-1.5 pr-2">
                  <Input
                    value={l.description}
                    list="finance-items"
                    placeholder="What you're billing for"
                    maxLength={1000}
                    aria-label={`Line ${i + 1} description`}
                    onChange={(e) => {
                      const match = items?.items.find((it) => it.name === e.target.value);
                      update(
                        i,
                        match
                          ? { description: match.description ? `${match.name}\n${match.description}` : match.name, itemId: match.id, hsnSac: match.hsnSac, unit: match.unit, unitPrice: match.unitPrice, taxRate: Number(match.taxRate) }
                          : { description: e.target.value, itemId: null },
                      );
                    }}
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={l.hsnSac ?? ""} onChange={(e) => update(i, { hsnSac: e.target.value.replace(/\D/g, "").slice(0, 8) || null })} placeholder="998391" className="font-mono" aria-label="HSN/SAC" />
                </td>
                <td className="py-1.5 pr-2">
                  <Input type="number" min={0} step="any" value={l.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} className="text-right font-mono" aria-label="Quantity" />
                </td>
                <td className="py-1.5 pr-2">
                  <Input
                    key={`${i}-${l.itemId ?? ""}-${l.unitPrice}`}
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={l.unitPrice ? toRupees(l.unitPrice) : ""}
                    onChange={(e) => update(i, { unitPrice: toPaise(e.target.value) })}
                    placeholder="0.00"
                    className="text-right font-mono"
                    aria-label="Rate in rupees"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <Input type="number" min={0} max={100} step="any" value={l.discountPct || ""} onChange={(e) => update(i, { discountPct: Math.min(100, Number(e.target.value) || 0) })} placeholder="0" className="text-right font-mono" aria-label="Discount percent" />
                </td>
                <td className="py-1.5 pr-2">
                  <Select value={String(Number(l.taxRate))} onChange={(e) => update(i, { taxRate: Number(e.target.value) })} disabled={supplyType === "export"} aria-label="GST rate">
                    {rateOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-1.5 pt-3.5 text-right font-mono">{m(totals.lines[i]?.taxable ?? 0)}</td>
                <td className="py-1.5 pl-1">
                  <Button type="button" size="icon" variant="ghost" aria-label="Remove line" disabled={lines.length === 1} onClick={() => onChange(lines.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="finance-items">
          {items?.items.map((it) => (
            <option key={it.id} value={it.name}>
              {money(it.unitPrice)} · {Number(it.taxRate)}% GST
            </option>
          ))}
        </datalist>
      </div>
      <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => onChange([...lines, emptyLine(defaultRate)])}>
        <Plus /> Add line
      </Button>

      <dl className="ml-auto mt-4 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="text-right font-mono">{m(totals.subtotal)}</dd>
        {totals.discountTotal ? (
          <>
            <dt className="text-muted-foreground">Discount</dt>
            <dd className="text-right font-mono">−{m(totals.discountTotal)}</dd>
          </>
        ) : null}
        {supplyType === "intra" ? (
          <>
            <dt className="text-muted-foreground">CGST</dt>
            <dd className="text-right font-mono">{m(totals.cgst)}</dd>
            <dt className="text-muted-foreground">SGST</dt>
            <dd className="text-right font-mono">{m(totals.sgst)}</dd>
          </>
        ) : supplyType === "inter" ? (
          <>
            <dt className="text-muted-foreground">IGST</dt>
            <dd className="text-right font-mono">{m(totals.igst)}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="text-right text-xs text-muted-foreground">Export, zero-rated</dd>
          </>
        )}
        {totals.roundOff ? (
          <>
            <dt className="text-muted-foreground">Round off</dt>
            <dd className="text-right font-mono">{m(totals.roundOff)}</dd>
          </>
        ) : null}
        <dt className="border-t border-border pt-2 font-display text-base font-bold">Total</dt>
        <dd className="border-t border-border pt-2 text-right font-mono text-base font-bold">{m(totals.total)}</dd>
      </dl>
    </div>
  );
}
