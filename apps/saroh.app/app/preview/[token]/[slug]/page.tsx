import { notFound } from "next/navigation";

import { PostIndex } from "@/components/post-view";
import { PageSections } from "@/components/sections/section-renderer";
import {
    findPageByPath,
    getPreviewByToken,
    getPreviewPosts,
    postsPrefix,
} from "@/lib/publication";

/** A draft's inner page, or its posts index, behind a preview token (#198). */
export default async function PreviewPage({
    params,
}: {
    params: Promise<{ token: string; slug: string }>;
}) {
    const { token, slug } = await params;
    const preview = await getPreviewByToken(token);
    if (!preview.ok) return null;

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

    return <PageSections sections={page.sections} />;
}
