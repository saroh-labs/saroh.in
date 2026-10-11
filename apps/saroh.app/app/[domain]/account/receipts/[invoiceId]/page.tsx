import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccountCard, BackLink } from "@saroh/site-blocks";

import { InvoiceCopyActions } from "@/components/download-pdf-button";
import { InvoicePay } from "@/components/invoice-pay";
import { getReceipt } from "@/lib/account-area";
import { receiptTitle } from "@/lib/account-title";
import { receiptPdfHref } from "@/lib/invoice-pdf";

/**
 * One receipt from Your details (round-2 plan A, A5): the customer's own paid invoice
 * on the pay link's paper — the same allow-list and the same drawing — with
 * its PDF to download (DEC-083, drawn on request by the API for this
 * customer's session) and the browser's print for a copy. No pay link is minted or shown: a paid
 * invoice has nothing to pay, and the paper's Pay button never draws.
 * Another customer's invoice is a 404.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ invoiceId: string }>;
}): Promise<Metadata> {
    const { invoiceId } = await params;
    const result = await getReceipt(invoiceId);
    return {
        // "Receipt RC-0042 · ‹Business›"; signed out, "Sign in".
        title:
            !result.ok && result.reason === "signed-out"
                ? "Sign in"
                : receiptTitle(result.ok ? result.receipt.number : null),
        robots: { index: false, follow: false },
    };
}

export default async function ReceiptPage({
    params,
}: {
    params: Promise<{ invoiceId: string }>;
}) {
    const { invoiceId } = await params;
    const result = await getReceipt(invoiceId);
    if (!result.ok) {
        if (result.reason === "missing") notFound();
        if (result.reason === "signed-out") return null;
        return (
            <AccountCard
                labelledBy="receipt-unavailable"
                title="Couldn't load this receipt"
                lead={<span role="status">Refresh the page to try again.</span>}
            />
        );
    }
    return (
        <div>
            <BackLink href="/account/me">Your details</BackLink>
            {/* A paid invoice: InvoicePay never draws its Pay button, so the
                token it would pay with is never used. */}
            <InvoicePay token="" invoice={result.receipt} />
            <div className="mx-auto w-full max-w-xl px-5 sm:px-8">
                <InvoiceCopyActions
                    pdfHref={receiptPdfHref(invoiceId)}
                    number={result.receipt.number}
                />
            </div>
        </div>
    );
}
