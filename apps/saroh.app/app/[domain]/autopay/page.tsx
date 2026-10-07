import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AutopayDone } from "@saroh/site-blocks";

import { autopayNow, autopayReadOf } from "@/lib/autopay-read";
import { getInvoiceAutopay } from "@/lib/invoice-pay";
import { getPublicationForHost } from "@/lib/publication";

import { readAutopay } from "./actions";

/**
 * Where a customer lands after setting up autopay (round-2 D12): on the
 * business's own site, inside its header and theme — never on Saroh's page
 * or the provider's. "You're on ‹plan›. Autopay is on with UPI
 * (mo•••@okicici). Next payment ‹date›." with the way to their account;
 * "Being confirmed" until the provider says, asked again by itself; and,
 * when it didn't go through, whether the payment did and "Try autopay
 * again".
 *
 * `?pay=<token>` after a pay link (the link's token is its credential, as on
 * the pay page, so this page is noindex and sends no referrer);
 * `?plan=<ref>` after My plan and `?join=<ref>` after the Prices page, read
 * with the customer's session.
 */
export async function generateMetadata({
    searchParams,
}: {
    searchParams: Promise<{
        pay?: string | string[];
        plan?: string | string[];
        join?: string | string[];
    }>;
}): Promise<Metadata> {
    // A visit with nothing to read is a 404 below, and its tab says so
    // rather than "Autopay" (UX-090).
    const read = autopayReadOf(await searchParams);
    return {
        title: read ? "Autopay" : "Page not found",
        robots: { index: false, follow: false },
        referrer: "no-referrer",
    };
}

export default async function AutopayPage({
    params,
    searchParams,
}: {
    params: Promise<{ domain: string }>;
    searchParams: Promise<{
        pay?: string | string[];
        plan?: string | string[];
        join?: string | string[];
    }>;
}) {
    const [{ domain }, query] = await Promise.all([params, searchParams]);
    const read = autopayReadOf(query);
    if (!read) notFound();
    const snapshot = await getPublicationForHost(domain);
    if (!snapshot) notFound();

    let initial;
    let retryHref = "/account/plan";
    if (read.kind === "pay") {
        const answer = await getInvoiceAutopay(read.token);
        initial = answer.state;
        if (answer.payUrl) retryHref = answer.payUrl;
    } else {
        initial = await autopayNow(read);
    }

    return (
        <AutopayDone
            businessName={snapshot.site.name}
            initial={initial}
            read={readAutopay.bind(null, read)}
            accountHref="/account/plan"
            retryHref={retryHref}
        />
    );
}
