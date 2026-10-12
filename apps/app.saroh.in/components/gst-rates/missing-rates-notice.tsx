"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GstRatesSheet } from "@/components/gst-rates/gst-rates-sheet";
import { saveGstRates } from "@/lib/gst-rates/actions";
import type { MissingRates } from "@/lib/gst-rates/missing";
import { missingLine, savedMessage } from "@/lib/gst-rates/missing";

/**
 * One quiet line for a GST-registered business with priced things on sale
 * and no GST rate on them (12 Oct 2026): how many, and a button that opens
 * the sheet where each rate is chosen in its row. Nothing is drawn when
 * nothing is missing, when the business isn't registered, or when the read
 * couldn't tell (`missing` null).
 *
 * The page's read is the list: saving refreshes it, so the count goes down
 * and the notice leaves by itself once the last rate is chosen.
 */
export function MissingRatesNotice({
    missing,
    className,
}: {
    missing: MissingRates | null;
    className?: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const line = missingLine(missing);
    if (!missing || line === null) return null;
    // Someone who can set none of them reads the line, with no button.
    const canSet = missing.items.some((item) => item.canSet !== false);

    return (
        <>
            <Notice
                tone="neutral"
                align="center"
                className={className}
                action={
                    canSet ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setOpen(true)}
                        >
                            Choose rates
                        </Button>
                    ) : undefined
                }
            >
                {line}
            </Notice>
            <GstRatesSheet
                rows={open ? missing.items : null}
                title="GST rates to choose"
                description="These are on sale with a price and no GST rate. Choose the rate each price includes."
                saveLabel="Save"
                requireAll={false}
                note={
                    missing.more
                        ? "There are more than this list holds. Save these and the rest are listed next. Choose 0% for anything exempt or nil-rated."
                        : "Prices include GST. Choose 0% for anything exempt or nil-rated."
                }
                save={async (chosen) => {
                    const res = await saveGstRates(chosen);
                    return res.ok ? { ok: true } : res;
                }}
                onDone={(saved) => {
                    setOpen(false);
                    if (saved === null) return;
                    showSuccess(savedMessage(saved));
                    router.refresh();
                }}
            />
        </>
    );
}
