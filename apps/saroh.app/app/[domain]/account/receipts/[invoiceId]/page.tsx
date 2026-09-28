import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccountCard } from "@saroh/site-blocks";

import { InvoicePay } from "@/components/invoice-pay";
import { PrintButton } from "@/components/print-button";
import { getReceipt } from "@/lib/account-area";

/**
 * One receipt from Me (round-2 plan A, A5): the customer's own paid invoice
 * on the pay link's paper — the same allow-list and the same drawing — with
 * the browser's print for a copy. No pay link is minted or shown: a paid
 * invoice has nothing to pay, and the paper's Pay button never draws.
 * Another customer's invoice is a 404.
 */
export const metadata: Metadata = {
    title: "Receipt",
    robots: { index: false, follow: false },
};

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
                title="Receipt"
                lead="This receipt couldn't be loaded. Refresh the page to try again."
            />
        );
    }
    return (
        <div>
            <Link
                href="/account/me"
                className="rounded-sm text-[13.5px] font-semibold text-site-fg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-fg print:hidden"
            >
                ← Me
            </Link>
            {/* A paid invoice: InvoicePay never draws its Pay button, so the
                token it would pay with is never used. */}
            <InvoicePay token="" invoice={result.receipt} />
            <div className="mx-auto w-full max-w-xl px-5 sm:px-8">
                <PrintButton />
            </div>
        </div>
    );
}
