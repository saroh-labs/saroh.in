import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { NotebookPen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ListCard, ListRow } from "@/components/shared/list-card";
import { ViewerDate } from "@/components/shared/viewer-date";
import type { Post } from "@/lib/content/service";
import { listPosts } from "@/lib/content/service";
import { requireSession } from "@/lib/session";
import { getSite } from "@/lib/sites/service";

export const metadata = { title: "Posts · Website" };

/**
 * What a post's pill says: whether the PUBLIC is being served it (#232).
 *
 * `status` alone cannot say that, so `live` — whether the post has a
 * published copy — decides "Published", and a post marked published with
 * nothing live says so rather than claiming it.
 */
function postPill(post: Post): {
    label: string;
    variant: "success" | "draft" | "warning" | "neutral";
} {
    if (post.status === "ARCHIVED") {
        return { label: "Archived", variant: "neutral" };
    }
    if (post.live) return { label: "Published", variant: "success" };
    if (post.status === "DRAFT") return { label: "Draft", variant: "draft" };
    return { label: "Not live", variant: "warning" };
}

/**
 * The Posts tab — a site's writing (ADR-004).
 *
 * Reading it is `site:read`, so everyone who can reach the site can read its
 * posts — a reviewer included, deliberately: the writing is part of what they
 * were asked to look at. Writing it is `section:write`, and the header only
 * offers New post and Categories to someone the server says may (#313).
 */
export default async function SitePostsPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();
    const site = await getSite(siteId);
    if (!site) notFound();

    const posts = await listPosts(siteId);
    const base = `/sites/${siteId}/posts`;
    const prefix = site.postsPrefix ?? "blog";

    if (posts.length === 0) {
        return (
            <EmptyState
                icon={<NotebookPen />}
                title="No posts yet"
                description="Posts are dated and listed newest first; pages are not. If this site never needs a journal, it never needs this tab."
                action={
                    site.can.edit ? (
                        <Button asChild>
                            <Link href={`${base}/new`}>
                                Write the first post
                            </Link>
                        </Button>
                    ) : undefined
                }
            />
        );
    }

    return (
        <ListCard
            main="Post"
            end="Date"
            note="Drafts are visible to the team and to nobody else."
        >
            {posts.map((post) => {
                const pill = postPill(post);
                return (
                    <li
                        key={post.id}
                        className="border-b border-border last:border-b-0"
                    >
                        <Link
                            href={`${base}/${post.id}`}
                            aria-label={`${post.title}, ${pill.label.toLowerCase()}`}
                            className="block bg-card transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                            <ListRow
                                title={post.title}
                                tag={
                                    <>
                                        <Badge variant={pill.variant}>
                                            {pill.label}
                                        </Badge>
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
                                        {post.category?.name ?? "Uncategorized"}
                                        {post.author ? ` · ${post.author}` : ""}
                                    </>
                                }
                                end={
                                    <span className="whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
                                        <ViewerDate
                                            iso={
                                                post.publishedAt ??
                                                post.createdAt
                                            }
                                        />
                                    </span>
                                }
                            />
                        </Link>
                    </li>
                );
            })}
        </ListCard>
    );
}
