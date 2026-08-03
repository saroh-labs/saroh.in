import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listPosts } from "@/lib/content/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
    PUBLISHED: "default",
    DRAFT: "secondary",
    ARCHIVED: "outline",
};

/**
 * Content (blog) list. Store-access gated (members can read). Each row links to
 * the post editor; "New post" is shown to everyone with access — the api
 * rejects writes from VIEWER members.
 */
export default async function ContentPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const posts = await listPosts(storeId);
    const base = `/stores/${storeId}/content`;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Content"
                description="Blog posts for your storefront."
                actions={
                    <>
                        <Button variant="outline" asChild>
                            <Link href={`${base}/categories`}>Categories</Link>
                        </Button>
                        <Button variant="brand" asChild>
                            <Link href={`${base}/new`}>New post</Link>
                        </Button>
                    </>
                }
            />

            {posts.length === 0 ? (
                <EmptyState
                    title="No posts yet"
                    description="Write your first post to start your blog."
                    action={
                        <Button variant="brand" asChild>
                            <Link href={`${base}/new`}>New post</Link>
                        </Button>
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
        </div>
    );
}
