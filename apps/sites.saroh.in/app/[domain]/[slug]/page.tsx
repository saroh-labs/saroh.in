import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageSections } from "@/components/sections/section-renderer";
import { findPageByPath, getPublicationForHost } from "@/lib/publication";

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

    const title = page.title ?? snapshot.site.name;
    return {
        title,
        openGraph: { title },
        twitter: { card: "summary_large_image", title },
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
