import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublishedPage } from "@/components/published-page";
import { businessJsonLdScript } from "@/lib/business-json-ld";
import { findHomePage, getSiteForHost, siteOriginFor } from "@/lib/publication";
import { getSiteContact } from "@/lib/site-contact";
import { canonical } from "@/lib/site-meta";

/**
 * Tenant site home (S2-006).
 *
 * The `domain` param is the full request hostname (middleware-rewritten). We
 * resolve it to a publication snapshot and render the home page's ordered
 * sections. A missing publication (or a snapshot with no pages) renders a clean
 * 404 — drafts are never reachable here, so there is no fallback content.
 */
/**
 * The home page's one address, on the site's primary host. Its title,
 * description and share card are the layout's; a test release's host names
 * none (it is never indexed).
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string }>;
}): Promise<Metadata> {
    const { domain } = await params;
    const resolved = await getSiteForHost(domain);
    if (resolved?.mode !== "live") return {};
    return canonical(resolved, domain, "/");
}

export default async function SiteHomePage({
    params,
}: {
    params: Promise<{ domain: string }>;
}) {
    const { domain } = await params;
    // The site's id as well as its snapshot: Visit us reads its place by it
    // (G8), as the post routes read posts by it (#232).
    const resolved = await getSiteForHost(domain);

    if (!resolved) {
        notFound();
    }

    const home = findHomePage(resolved.snapshot);
    if (!home) {
        notFound();
    }

    // Who the business is and how to reach it, for search engines
    // (DEC-125): the same live read the footer draws, shared within the
    // request, and only what is set. Nothing set: no script.
    const jsonLd = resolved.siteId
        ? businessJsonLdScript({
              name: resolved.snapshot.site.name,
              origin: siteOriginFor(resolved, domain),
              contact: await getSiteContact(resolved.siteId),
          })
        : null;

    return (
        <>
            {jsonLd ? (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: jsonLd }}
                />
            ) : null}
            <PublishedPage
                page={home}
                snapshot={resolved.snapshot}
                siteId={resolved.siteId}
            />
        </>
    );
}
