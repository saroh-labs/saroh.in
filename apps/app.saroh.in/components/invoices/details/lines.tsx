"use client";

import { Button } from "@saroh/ui/button";
import { Copy } from "lucide-react";

import { QrButton } from "@/components/qr/qr-button";
import {
    addedLineOf,
    isExemptPaper,
    lineRate,
    showsGstTotals,
} from "@/lib/invoices/paper-title";
import { printedSeller } from "@/lib/invoices/seller";
import type { Invoice } from "@/lib/invoices/service";

/*
 * Pieces kept from the list's quick look (retired by the details sheet,
 * DEC-173 U9 #1121): the payment link shown in place, and one line and the
 * tax rows as the paper sets them.
 */

/**
 * The payment link's address, shown in place (UX-048): selectable, with its own
 * copy button, so it can be copied by hand when the clipboard is blocked.
 */
export function ShownLink({
    url,
    onCopy,
}: {
    url: string;
    onCopy: () => void;
}) {
    return (
        <div className="grid gap-1.5" aria-label="Payment link" role="group">
            <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded-[7px] bg-muted px-[9px] py-[7px] font-mono text-[12px]">
                    {url}
                </code>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onCopy}
                    aria-label="Copy the payment link"
                >
                    <Copy aria-hidden className="size-4" />
                </Button>
                <QrButton
                    compact="always"
                    link={{
                        mode: "instant",
                        url,
                        what: "this invoice's payment link",
                        opens: "pay",
                        fileName: "pay-link-qr",
                    }}
                />
            </div>
            <p className="text-[12px] leading-[1.45] text-muted-foreground">
                Kept here until you close this tab. Copying it again
                doesn&apos;t make a new link.
            </p>
        </div>
    );
}

/**
 * One line of the quick look: its name, "3 × ₹780" for more than one, and
 * its amount. A line GST was added to reads before GST, as on its paper
 * (`addedLineOf`): the rows under the lines add the GST.
 */
export function LineRow({
    line: l,
    taxed,
    money,
}: {
    line: NonNullable<Invoice["lines"]>[number];
    /** The paper charges GST: a tax invoice, not a receipt or bill of supply. */
    taxed: boolean;
    money: (a: string) => string;
}) {
    const added = addedLineOf(taxed, l);
    return (
        <div className="flex items-baseline gap-2.5 border-b border-border/70 px-4 py-[9px]">
            <span className="min-w-0 flex-1 text-[13px]">{l.description}</span>
            {l.quantity > 1 ? (
                <span className="text-[12px] tabular-nums text-muted-foreground">
                    {l.quantity} × {money(lineRate(l, added))}
                </span>
            ) : null}
            <span className="min-w-[70px] text-right text-[13px] font-semibold tabular-nums">
                {money(added ? added.amount : l.amount)}
            </span>
        </div>
    );
}

export function TaxRows({
    invoice: i,
    money,
    businessName,
}: {
    invoice: Invoice;
    businessName: string;
    money: (a: string) => string;
}) {
    // A registered business's paper with no line rated: just the total
    // (DEC-072).
    if (i.gst && !isExemptPaper(i) && !showsGstTotals(i)) return null;
    // Named as on its paper: as at issue, or today's on a draft (DEC-082).
    const seller = printedSeller(i, {
        name: businessName,
        legalName: null,
        email: null,
    }).name;
    const rows: [string, string][] = isExemptPaper(i)
        ? [["Exempt from GST. No tax is charged", ""]]
        : i.gst
          ? [
                ["Taxable value", money(i.subtotal)],
                ...(i.gst.taxType === "INTER"
                    ? ([["IGST", money(i.gst.igst)]] as [string, string][])
                    : ([
                          ["CGST", money(i.gst.cgst)],
                          ["SGST", money(i.gst.sgst)],
                      ] as [string, string][])),
            ]
          : Number(i.tax) > 0
            ? [["Tax", money(i.tax)]]
            : [[`No GST. ${seller} isn't registered`, ""]];
    return (
        <div className="py-1">
            {rows.map(([k, v]) => (
                <div
                    key={k}
                    className="flex px-4 py-[5px] text-[12.5px] text-muted-foreground"
                >
                    <span className="flex-1">{k}</span>
                    <span className="tabular-nums">{v}</span>
                </div>
            ))}
        </div>
    );
}
