import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { ViewerDate } from "@/components/shared/viewer-date";
import { readOnlyLine } from "@/components/shared/who-can-change";
import { postParagraphs } from "@/lib/content/plain-text";
import type { PostDetail } from "@/lib/content/service";

/** What the public is being served of it, as the Posts tab's pill says. */
function stateOf(post: PostDetail): {
    label: string;
    variant: "success" | "draft" | "warning" | "neutral";
} {
    if (post.status === "ARCHIVED") {
        return { label: "Archived", variant: "neutral" };
    }
    if (post.live) return { label: "Live", variant: "success" };
    if (post.status === "DRAFT") return { label: "Draft", variant: "draft" };
    return { label: "Not live", variant: "warning" };
}

/**
 * A post, for someone who may read the site's writing but not change it: a
 * Reviewer, or a Member (`site:read` without `section:write`).
 *
 * They used to get the editor itself, with a title they could retype, a
 * body they could rewrite and Save and Publish buttons the API refused.
 * This has no input and no button but the way back: the title, the state,
 * where it lives and the body.
 *
 * The body is plain text (`postParagraphs`). A draft's markup is sanitized
 * only at publish, so it is never drawn as markup here, and the note says
 * where the formatting can be seen.
 */
export function PostReadView({
    siteId,
    post,
    prefix,
    category,
}: {
    siteId: string;
    post: PostDetail;
    /** The site's posts address, "blog" unless it chose another. */
    prefix: string;
    category: string | null;
}) {
    const state = stateOf(post);
    const body = postParagraphs(post.content);
    const posts = `/sites/${siteId}/posts`;
    return (
        <PageContainer width="form">
            <ReadOnlyNote>{readOnlyLine("this post")}</ReadOnlyNote>
            <article>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant={state.variant}>{state.label}</Badge>
                    {post.featured ? (
                        <Badge variant="neutral">Featured</Badge>
                    ) : null}
                    {post.liveAt ? (
                        <span className="text-xs text-muted-foreground">
                            Live since <ViewerDate iso={post.liveAt} />
                        </span>
                    ) : null}
                </div>
                <h1 className="font-display text-4xl font-bold tracking-tight">
                    {post.title}
                </h1>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                    <span className="font-mono">
                        /{prefix}/{post.slug}
                    </span>
                    {" · "}
                    {category ?? "Uncategorized"}
                    {post.author ? ` · ${post.author}` : ""}
                </p>
                {post.excerpt ? (
                    <p className="mt-4 text-[15px] leading-relaxed text-foreground/80">
                        {post.excerpt}
                    </p>
                ) : null}
                <div className="mt-6 space-y-4 text-[15px] leading-relaxed">
                    {body.length > 0 ? (
                        body.map((paragraph, index) => (
                            <p key={index}>{paragraph}</p>
                        ))
                    ) : (
                        <p className="text-muted-foreground">
                            Nothing has been written in this post yet.
                        </p>
                    )}
                </div>
                <p className="mt-6 text-[12.5px] text-muted-foreground">
                    Shown as plain text. Its formatting and pictures show on the
                    site once it is published.
                </p>
            </article>
            <Button asChild variant="outline" className="mt-6">
                <Link href={posts}>Back to Posts</Link>
            </Button>
        </PageContainer>
    );
}
