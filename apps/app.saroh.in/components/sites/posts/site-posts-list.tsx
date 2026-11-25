"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { ListCard, ListRow } from "@saroh/ui/list-card";
import { NotebookPen } from "lucide-react";
import type { ReactNode } from "react";

import { PausedNote } from "@/components/billing/paused-banner";
import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { PageLoading } from "@/components/shared/page/page-loading";
import { pausedListWords } from "@/lib/billing/paused";
import type { PostRow } from "@/lib/sites/queries";
import { postUpdatedIso } from "@/lib/sites/updated";
import { useSitePosts, whenRefused } from "@/lib/sites/use-sites";

/**
 * What a post's pill says: whether the PUBLIC is being served it (#232).
 *
 * `status` alone cannot say that, so `live` — whether the post has a
 * published copy — decides "Published", and a post marked published with
 * nothing live says so rather than claiming it.
 */
function postPill(post: PostRow): {
    label: string;
    variant: "success" | "draft" | "warning" | "neutral";
} {
    if (post.status === "ARCHIVED") {
        return { label: "Archived", variant: "neutral" };
    }
    if (post.live) return { label: "Live", variant: "success" };
    if (post.status === "DRAFT")
        return { label: "Not live yet", variant: "draft" };
    return { label: "Not live", variant: "warning" };
}

/**
 * A site's posts: the Posts tab, and Writing in the Website area (ADR-004),
 * on React Query (DEC-259): one `records` read, rows in the list's own
 * skeleton until it lands; a failure is said in the list's place.
 *
 * Reading it is `site:read`, so everyone who can reach the site can read its
 * posts — a reviewer included, deliberately: the writing is part of what they
 * were asked to look at. Writing it is `section:write`, and the header only
 * offers New post and Categories to someone the server says may (#313).
 */
export function SitePostsList({
    siteId,
    limitNotice = null,
}: {
    siteId: string;
    /** The plan's Blog limit notice, drawn by the page (a server read). */
    limitNotice?: ReactNode;
}) {
    const read = useSitePosts(siteId);
    if (read.isError && !read.data) whenRefused(read.error);
    if (!read.data) {
        return read.isError ? (
            <FailedState
                size="panel"
                title={couldntLoad("posts")}
                onRetry={() => void read.refetch()}
                retrying={read.isFetching}
            />
        ) : (
            <PageLoading
                shape="rows"
                width="full"
                bare
                label="Loading the posts"
            />
        );
    }
    const { posts, canEdit, prefix } = read.data;
    const pausedHere = posts.filter((p) => p.paused).length;
    const base = `/sites/${siteId}/posts`;

    if (posts.length === 0) {
        return (
            <EmptyState
                icon={<NotebookPen />}
                title="No posts yet"
                description="Posts are dated and listed newest first, like a journal or news."
                action={
                    canEdit ? (
                        <Button asChild>
                            <IntentLink href={`${base}/new`}>
                                New post
                            </IntentLink>
                        </Button>
                    ) : undefined
                }
            />
        );
    }

    return (
        <>
            {pausedHere > 0 ? (
                <PausedNote className="mb-4">
                    {pausedListWords("post", pausedHere)}
                </PausedNote>
            ) : null}
            {limitNotice}
            <ListCard
                main="Post"
                paged={{ list: "site-posts", things: "posts" }}
                end="Updated"
                note="Drafts are visible to the team and to nobody else."
            >
                {posts.map((post) => {
                    const pill = postPill(post);
                    return (
                        <li
                            key={post.id}
                            className="border-b border-border last:border-b-0"
                        >
                            <IntentLink
                                href={`${base}/${post.id}`}
                                // A reader opens the post editor read-only,
                                // with its notes (DEC-200 U8); the row says so.
                                aria-label={`${canEdit ? "" : "View "}${post.title}, ${pill.label.toLowerCase()}${post.paused ? ", paused" : ""}`}
                                className="block bg-card transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                                <ListRow
                                    title={post.title}
                                    tag={
                                        <>
                                            <Badge variant={pill.variant}>
                                                {pill.label}
                                            </Badge>
                                            {post.paused ? (
                                                <Badge variant="warning">
                                                    Paused
                                                </Badge>
                                            ) : null}
                                            {post.featured ? (
                                                <Badge variant="neutral">
                                                    Featured
                                                </Badge>
                                            ) : null}
                                        </>
                                    }
                                    sub={
                                        <>
                                            <span className="font-mono">
                                                /{prefix}/{post.slug}
                                            </span>
                                            {" · "}
                                            {post.category?.name ??
                                                "Uncategorized"}
                                            {post.author
                                                ? ` · ${post.author}`
                                                : ""}
                                        </>
                                    }
                                    end={
                                        <span className="flex items-center gap-3 whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
                                            <ViewerDate
                                                iso={postUpdatedIso(post)}
                                            />
                                            {canEdit ? null : (
                                                <span
                                                    data-ph-unmask=""
                                                    className="font-medium text-foreground"
                                                >
                                                    View
                                                </span>
                                            )}
                                        </span>
                                    }
                                />
                            </IntentLink>
                        </li>
                    );
                })}
            </ListCard>
        </>
    );
}
