import type { Metadata } from "next";

import { ReportForm } from "@/components/customers/report-form";
import { LegalFrame } from "@/components/legal/legal-page";
import { LegalText } from "@/components/legal/legal-text";
import { CUSTOMERS } from "@/content/customers";
import { parseLegal } from "@/lib/legal-markdown";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
    title: CUSTOMERS.seoTitle,
    socialTitle: CUSTOMERS.title,
    description: CUSTOMERS.description,
    path: CUSTOMERS.href,
});

/**
 * For customers of a business that uses Saroh (Terms rev 46): who is
 * responsible for their order, who to contact, and a form to report a
 * business. Static, in the legal pages' reading column; the form fills the
 * address in from a merchant site's `?site=` in the browser.
 */
export default function CustomersPage() {
    return (
        <LegalFrame title={CUSTOMERS.title}>
            <LegalText blocks={parseLegal(CUSTOMERS.body)} />
            <div className="pb-10 pt-2">
                <ReportForm />
            </div>
        </LegalFrame>
    );
}
