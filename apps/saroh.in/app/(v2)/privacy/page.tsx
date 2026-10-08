import type { Metadata } from "next";

import { LegalPage } from "@/components/v2/legal/legal-page";
import { PRIVACY } from "@/content/privacy";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
    title: "Privacy Policy · Saroh",
    socialTitle: "Saroh's Privacy Policy",
    description: PRIVACY.description,
    path: PRIVACY.href,
});

/** The Privacy Policy: the owner's text, verbatim (`content/privacy.ts`). */
export default function PrivacyPage() {
    return <LegalPage id="privacy" title={PRIVACY.title} body={PRIVACY.body} />;
}
