import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page-container";
import { listPosts } from "@/lib/content/service";
import { requireSession } from "@/lib/session";
import { getSite } from "@/lib/sites/service";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
    PUBLISHED: "default",
    DRAFT: "secondary",
    ARCHIVED: "outline",
};

/**
 * Content (blog) list.
 *
 * Reading a site's writing is `site:read`, so everyone who can reach the site
 * can read its posts — a reviewer included, and deliberately: the writing is
 * part of what they were asked to look at.
 *
 * Writing it is `section:write`. "New post" and "Categories" used to be shown
 * to everyone anyway, on the reasoning that the API would reject the write —
 * which it does, after the person has chosen a category, written a title and
 * pressed the button (#313). `can.edit` is the server's own answer about this
 * caller and this site, so the page asks that rather than guessing.
 */
export default async function ContentPage({
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

    return (
        <PageContainer>
            <PageHeader
                title="Posts"
                description="Writing published on this site."
                actions={
                    site.can.edit ? (
                        <>
                            <Button variant="outline" asChild>
                                <Link href={`${base}/categories`}>
                                    Categories
                                </Link>
                            </Button>
                            <Button variant="brand" asChild>
                                <Link href={`${base}/new`}>New post</Link>
                            </Button>
                        </>
                    ) : undefined
                }
            />

            {posts.length === 0 ? (
                <EmptyState
                    title="No posts yet"
                    description={
                        site.can.edit
                            ? "Write your first post to start your blog."
                            : "Nothing has been written on this site yet."
                    }
                    action={
                        site.can.edit ? (
                            <Button variant="brand" asChild>
                                <Link href={`${base}/new`}>New post</Link>
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <ul className="divide-y rounded-lg border">
                    {posts.map((p) => (
                        <li key={p.id}>
                            <Link
                                href={`${base}/${p.id}`}
                                className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent"
                            >
                                <div className="min-w-0">
                                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                                        {p.title}
                                        {p.featured && (
                                            <Badge variant="outline">
                                                Featured
                                            </Badge>
                                        )}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {p.category?.name ?? "Uncategorized"}
                                        {p.author ? ` · ${p.author}` : ""}
                                    </p>
                                </div>
                                <Badge
                                    variant={
                                        STATUS_VARIANT[p.status] ?? "secondary"
                                    }
                                >
                                    {p.status}
                                </Badge>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </PageContainer>
    );
}
