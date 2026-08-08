import { notFound } from "next/navigation";

import { PageSections } from "@/components/sections/section-renderer";
import { findHomePage, getPublicationForHost } from "@/lib/publication";

/**
 * Tenant site home (S2-006).
 *
 * The `domain` param is the full request hostname (middleware-rewritten). We
 * resolve it to a publication snapshot and render the home page's ordered
 * sections. A missing publication (or a snapshot with no pages) renders a clean
 * 404 — drafts are never reachable here, so there is no fallback content.
 */
export default async function SiteHomePage({
    params,
}: {
    params: Promise<{ domain: string }>;
}) {
    const { domain } = await params;
    const snapshot = await getPublicationForHost(domain);

    if (!snapshot) {
        notFound();
    }

    const home = findHomePage(snapshot);
    if (!home) {
        notFound();
    }

    return <PageSections sections={home.sections} />;
}
