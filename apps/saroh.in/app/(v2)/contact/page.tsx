import type { Metadata } from "next";

import { ContactPage } from "@/components/v2/contact/contact-page";
import { JsonLd } from "@/components/v2/json-ld";
import { CONTACT_PAGE } from "@/content/contact-page";
import { LAUNCH_MODE } from "@/lib/links";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbLd, organizationLd } from "@/lib/structured-data";

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
    return (
        <>
            {/* Who to write to, for search engines: the facts the page draws. */}
            <JsonLd
                data={[
                    organizationLd(),
                    breadcrumbLd([
                        { name: "Home", path: "/" },
                        { name: "Contact", path: CONTACT_PAGE.href },
                    ]),
                ]}
            />
            <ContactPage mode={LAUNCH_MODE} ctx={resourcesContext()} />
        </>
    );
}
