import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageSections } from "@/components/sections/section-renderer";
import {
    findPageByPath,
    getPublicationForHost,
    shareImages,
} from "@/lib/publication";

/**
 * Tenant sub-page (S2-006).
 *
 * The `domain` param is the full request hostname (middleware-rewritten) and
 * `slug` is the first path segment, so the page path we look up is `/${slug}`.
 * A missing publication OR a missing page renders a clean 404 — drafts are
 * never reachable here.
 */

export async function generateMetadata({
    params,
}: {
    params: Promise<{ domain: string; slug: string }>;
}): Promise<Metadata | null> {
    const { domain, slug } = await params;
    const snapshot = await getPublicationForHost(domain);
    if (!snapshot) {
        return null;
    }

    const page = findPageByPath(snapshot, `/${slug}`);
    if (!page) {
        return null;
    }

    // An inner page shared on WhatsApp or Slack used to arrive with a title and
    // nothing else (#220): the description and picture live on the site, and
    // this route did not read them. It inherits both, and names its own
    // address so a share of /about is cached as /about.
    const { name, seoDescription } = snapshot.site;
    const title = page.title ?? name;
    const description = seoDescription?.trim() ? seoDescription : undefined;
    const images = shareImages(snapshot.site);
    return {
        title,
        description,
        openGraph: {
            title,
            description,
            images,
            url: `/${slug}`,
            siteName: name,
        },
        twitter: {
            card: images ? "summary_large_image" : "summary",
            title,
            description,
            images,
        },
        metadataBase: new URL(`https://${domain}`),
    };
}

export default async function SitePostPage({
    params,
}: {
    params: Promise<{ domain: string; slug: string }>;
}) {
    const { domain, slug } = await params;
    const snapshot = await getPublicationForHost(domain);

    if (!snapshot) {
        notFound();
    }

    const page = findPageByPath(snapshot, `/${slug}`);
    if (!page) {
        notFound();
    }

    return <PageSections sections={page.sections} />;
}
