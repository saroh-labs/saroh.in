import type { Metadata } from "next";

import { LegalPage } from "@/components/v2/legal/legal-page";
import { TERMS } from "@/content/terms";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
    title: "Terms of Service · Saroh",
    socialTitle: "Saroh's Terms of Service",
    description: TERMS.description,
    path: TERMS.href,
});

/** The Terms of Service: the owner's text, verbatim (`content/terms.ts`). */
export default function TermsPage() {
    return <LegalPage id="terms" title={TERMS.title} body={TERMS.body} />;
}
