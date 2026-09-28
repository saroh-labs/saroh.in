import { notFound } from "next/navigation";

import { PostIndex } from "@/components/post-view";
import { PreviewGone } from "@/components/preview-gone";
import { ModulePageUnavailable, PageSections } from "@saroh/site-blocks";

import { publicApiUrl } from "@/lib/api-url";
import { moduleOff } from "@/lib/module-pages";
import {
    findPageByPath,
    getPreviewByToken,
    getPreviewJournalFeed,
    getPreviewPosts,
    postsPrefix,
} from "@/lib/publication";
import { getPreviewPacksFeed } from "@/lib/site-packs";
import { getPreviewPlansFeed } from "@/lib/site-plans";
import { getPreviewProductGridFeeds } from "@/lib/site-product-grids";

/** A draft's inner page, or its posts index, behind a preview token (#198). */
export default async function PreviewPage({
    params,
}: {
    params: Promise<{ token: string; slug: string }>;
}) {
    const { token, slug } = await params;
    const preview = await getPreviewByToken(token);
    // Explained here too, not left blank: see the home page's note (#284).
    if (!preview.ok) {
        if (preview.reason === "missing") notFound();
        return <PreviewGone reason={preview.reason} />;
    }

    // The posts index (#236). Checked BEFORE pages, for the same reason the
    // live route checks it first: a page could otherwise be created at the
    // same path and silently win depending on nothing the merchant can see.
    if (slug === postsPrefix(preview.snapshot)) {
        const posts = await getPreviewPosts(token);
        const base = `/preview/${encodeURIComponent(token)}/${slug}`;
        return (
            <PostIndex
                posts={posts}
                basePath={base}
                title={`Writing from ${preview.snapshot.site.name}`}
            />
        );
    }

    const page = findPageByPath(preview.snapshot, `/${slug}`);
    if (!page) notFound();

    // A module page whose module is off says so, as its live address will
    // (G15, G19), rather than showing what publishing wouldn't.
    if (moduleOff(page, preview.modules)) {
        return <ModulePageUnavailable business={preview.snapshot.site.name} />;
    }

    // The draft's posts (G10), as the preview's own index shows them, and
    // the plans (G9) and class packs (G20) on sale now and each Product
    // grid's products (G12): a draft plan, pack or product never shows, even
    // here. A preview joins and buys nothing: its blocks ask instead.
    const [journal, plans, packs, productGrids] = await Promise.all([
        getPreviewJournalFeed(page.sections, preview.snapshot, token),
        getPreviewPlansFeed(
            page.sections,
            preview.snapshot,
            preview.siteId,
            token,
        ),
        getPreviewPacksFeed(
            page.sections,
            preview.snapshot,
            preview.siteId,
            token,
        ),
        getPreviewProductGridFeeds(page.sections, preview.siteId),
    ]);

    return (
        <PageSections
            sections={page.sections}
            apiUrl={publicApiUrl()}
            siteId={preview.siteId}
            journal={journal}
            plans={plans}
            packs={packs}
            productGrids={productGrids}
        />
    );
}
