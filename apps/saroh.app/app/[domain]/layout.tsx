import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteFooter, SiteHeader, SiteTheme } from "@/components/site-chrome";
import { getPublicationForHost, shareImages } from "@/lib/publication";

/**
 * Tenant site layout (S2-006).
 *
 * Middleware rewrites an incoming tenant hostname to `/[domain]/<path>`, so the
 * `domain` route param IS the full request hostname (e.g. `demo.saroh.app`). We
 * resolve it to a publication via the public read API; a `null` snapshot means
 * nothing is published for this host (drafts are never reachable), so we render
 * a clean 404. There is no legacy DB / font mapping here — everything the
 * renderer draws from lives in the immutable publication snapshot.
 */

export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string }>;
}): Promise<Metadata | null> {
    const { domain } = await params;
    const snapshot = await getPublicationForHost(domain);
    if (!snapshot) {
        return null;
    }

    /*
     * Search and social, from the snapshot (#188).
     *
     * These fields have travelled into every publication since #188 shipped and
     * nothing read them: a merchant could write a search title and a share
     * image, publish, and the page still went out titled with the bare site
     * name and no description at all.
     *
     * `seoTitle` FALLS BACK to the site name rather than replacing it
     * conditionally in the settings form — an empty search title means "I have
     * not written one", not "publish an empty <title>".
     */
    const { name, seoTitle, seoDescription } = snapshot.site;
    const title = seoTitle?.trim() ? seoTitle : name;
    const description = seoDescription?.trim() ? seoDescription : undefined;
    const images = shareImages(snapshot.site);

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            images,
            // og:url and og:site_name (#220): the canonical address the
            // platforms key their cache on, and the name Slack puts above the
            // card. Resolved against `metadataBase`.
            url: "/",
            siteName: name,
        },
        twitter: {
            // Without an image this degrades to a plain summary card, so the
            // card type follows the picture rather than always claiming one.
            card: images ? "summary_large_image" : "summary",
            title,
            description,
            images,
        },
        metadataBase: new URL(`https://${domain}`),
    };
}

export function generateStaticParams() {
    // No DB here — domains are rendered on demand. Pre-rendering returns once
    // api exposes a list-domains endpoint for the renderer to enumerate.
    return [] as { params: { domain: string } }[];
}

export default async function SiteLayout({
    params,
    children,
}: {
    params: Promise<{ domain: string }>;
    children: React.ReactNode;
}) {
    const { domain } = await params;
    const snapshot = await getPublicationForHost(domain);

    if (!snapshot) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-site-bg text-site-body">
            <SiteTheme variables={snapshot.site.styleVariables} />
            <SiteHeader
                name={snapshot.site.name}
                navigation={snapshot.site.navigation ?? []}
            />

            <div>{children}</div>

            <SiteFooter footer={snapshot.site.footer} />
        </div>
    );
}
