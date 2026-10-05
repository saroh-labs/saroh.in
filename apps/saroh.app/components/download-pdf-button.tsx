"use client";

import { ctaClasses, destructiveAlertClasses } from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";
import { useState } from "react";

import { PrintButton } from "@/components/print-button";
import { fetchInvoicePdf, saveBlob } from "@/lib/invoice-pdf";

/**
 * "Download PDF" (DEC-083): the invoice the business issued, drawn on
 * request by this app's PDF route and saved by the browser. A button, not a
 * bare link, so a failure stays on the page in the customer's words instead
 * of a broken download. Styled in the business's `--site-*` tokens.
 *
 * `secondary` is a full-width button, beside Print; `link` is the quieter
 * line under a pay page's own actions.
 */
export function DownloadPdfButton({
    href,
    number,
    variant = "secondary",
}: {
    href: string;
    number: string;
    variant?: "secondary" | "link";
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function download() {
        if (busy) return;
        setBusy(true);
        setError(null);
        const got = await fetchInvoicePdf(href, number);
        setBusy(false);
        if (!got.ok) {
            setError(got.error);
            return;
        }
        saveBlob(got.blob, got.fileName);
    }

    return (
        <div
            className={cn("print:hidden", variant === "link" && "text-center")}
        >
            <button
                type="button"
                onClick={download}
                disabled={busy}
                aria-busy={busy}
                aria-label={`Download PDF of invoice ${number}`}
                className={cn(
                    ctaClasses(variant),
                    variant === "secondary" && "w-full",
                    "cursor-pointer disabled:cursor-wait disabled:opacity-60",
                )}
            >
                {busy ? "Preparing PDF…" : "Download PDF"}
            </button>
            {error ? (
                <p
                    role="alert"
                    className={cn(destructiveAlertClasses, "mt-2 text-left")}
                >
                    {error}
                </p>
            ) : null}
        </div>
    );
}

/**
 * The customer's copy of an invoice: "Download PDF" beside the browser's
 * print. Side by side from a small screen up, stacked on a phone.
 */
export function InvoiceCopyActions({
    pdfHref,
    number,
}: {
    pdfHref: string;
    number: string;
}) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 print:hidden">
            <DownloadPdfButton href={pdfHref} number={number} />
            <PrintButton />
        </div>
    );
}
