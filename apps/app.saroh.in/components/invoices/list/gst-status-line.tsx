"use client";

import { Button } from "@saroh/ui/button";

import { useMissingRatesSheet } from "@/components/gst-rates/missing-rates-notice";
import type { MissingRates } from "@/lib/gst-rates/missing";
import { missingShort } from "@/lib/gst-rates/missing";

/** The business's GST standing, for the line under the title. */
export interface InvoiceBusinessTax {
    registered: boolean;
    gstin: string | null;
}

/**
 * What the business's papers are, said once (DEC-173, U8 #1120):
 * "GST tax invoices · GSTIN 29AAGCR4375J1ZU · 2 plans need a GST rate",
 * "Not GST-registered. No tax is charged.", or the bill-of-supply note
 * when every issued paper is one. It was a line and a notice under it;
 * now the count is part of the line, and pressing it opens the same rates
 * sheet the notice did. Someone who can't set a rate reads the count with
 * nothing to press. Nothing is said of GST when the tax settings couldn't
 * be read.
 */
export function gstWords(
    tax: InvoiceBusinessTax | null,
    exempt: string | null,
): string | null {
    if (exempt) return exempt;
    if (!tax) return null;
    if (!tax.registered) return "Not GST-registered. No tax is charged.";
    return tax.gstin
        ? `GST tax invoices · GSTIN ${tax.gstin}`
        : "GST tax invoices";
}

export function GstStatusLine({
    tax,
    exempt,
    missing,
    className,
}: {
    tax: InvoiceBusinessTax | null;
    /** `exemptNote`'s line, when every issued paper is a bill of supply. */
    exempt: string | null;
    missing: MissingRates | null;
    className?: string;
}) {
    const rates = useMissingRatesSheet(missing);
    const words = gstWords(tax, exempt);
    const count = missingShort(missing);
    if (!words && !count) return null;
    return (
        <>
            <p
                data-gst-line=""
                className={
                    className ??
                    "text-[12.5px] leading-relaxed text-muted-foreground"
                }
            >
                {words}
                {words && count ? " · " : null}
                {count ? (
                    rates.canSet ? (
                        <Button
                            type="button"
                            variant="link"
                            size="inline"
                            onClick={rates.open}
                            className="rounded-sm px-0 text-[12.5px] font-semibold text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground coarse:min-h-11"
                        >
                            {count}
                        </Button>
                    ) : (
                        <span className="text-foreground">{count}</span>
                    )
                ) : null}
            </p>
            {rates.sheet}
        </>
    );
}
