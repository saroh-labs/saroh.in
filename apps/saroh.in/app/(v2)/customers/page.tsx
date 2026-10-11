import type { Metadata } from "next";

import { ReportForm } from "@/components/v2/customers/report-form";
import { LegalText } from "@/components/v2/legal/legal-text";
import { CUSTOMERS } from "@/content/customers";
import { parseLegal } from "@/lib/legal-markdown";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
    title: "For customers of businesses on Saroh · Saroh",
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
        <article className="mx-auto grid w-full max-w-[768px] gap-5 px-6 pt-[72px]">
            <h1 className="m-0 font-display text-[clamp(36px,6vw,56px)] font-bold leading-none tracking-[-0.045em]">
                {CUSTOMERS.title}
            </h1>
            <LegalText blocks={parseLegal(CUSTOMERS.body)} />
            <div className="pb-10 pt-2">
                <ReportForm />
            </div>
        </article>
    );
}
