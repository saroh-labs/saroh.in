import type { Metadata } from "next";

import { ContactPage } from "@/components/v2/contact/contact-page";
import { CONTACT_PAGE } from "@/content/contact-page";
import { LAUNCH_MODE } from "@/lib/links";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
    title: CONTACT_PAGE.seo.title,
    socialTitle: CONTACT_PAGE.seo.socialTitle,
    description: CONTACT_PAGE.seo.description,
    path: CONTACT_PAGE.href,
});

/**
 * /contact (DEC-137): static. The form posts to `/api/contact`, which
 * hands the message to the API (`components/v2/contact/`).
 */
export default function ContactRoute() {
    return <ContactPage mode={LAUNCH_MODE} ctx={resourcesContext()} />;
}
