import type { Metadata } from "next";

import { LegalPage } from "@/components/v2/legal/legal-page";
import { REFUNDS } from "@/content/refunds";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
    title: "Refund and Cancellation Policy · Saroh",
    socialTitle: "Saroh's Refund and Cancellation Policy",
    description: REFUNDS.description,
    path: REFUNDS.href,
});

/** The Refund and Cancellation Policy: the owner's text, verbatim (`content/refunds.ts`). */
export default function RefundsPage() {
    return <LegalPage id="refunds" title={REFUNDS.title} body={REFUNDS.body} />;
}
