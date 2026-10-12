"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GstRatesSheet } from "@/components/gst-rates/gst-rates-sheet";
import { saveGstRates } from "@/lib/gst-rates/actions";
import type { MissingRates } from "@/lib/gst-rates/missing";
import {
    listNote,
    listWhy,
    missingLine,
    savedMessage,
} from "@/lib/gst-rates/missing";

/**
 * One quiet line for a GST-registered business with priced things on sale
 * and no GST rate on them (12 Oct 2026): how many, and a button that opens
 * the sheet where each rate is chosen in its row. Nothing is drawn when
 * nothing is missing, when the business isn't registered, or when the read
 * couldn't tell (`missing` null). The sheet says whether the prices include
 * GST or have it added, as the business chose (`missing.priceMode`), and
 * says neither when that couldn't be read.
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
    // How the prices carry GST, where the read could tell; else unsaid.
    const mode = missing.priceMode ?? null;

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
                description={listWhy(mode)}
                saveLabel="Save"
                requireAll={false}
                note={listNote(mode, missing.more)}
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
