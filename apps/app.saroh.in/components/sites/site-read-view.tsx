import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import type { SiteCommentView, SiteDetail } from "@/lib/sites/service";

/** Read-only site access never loads or creates an editable draft. */
export function SiteReadView({
    site,
    comments,
}: {
    site: SiteDetail;
    comments: SiteCommentView[];
}) {
    return (
        <main className="mx-auto w-full max-w-3xl space-y-8 p-6 sm:p-8">
            <Button asChild variant="outline" className="wk-press">
                <Link href="/sites">Back to sites</Link>
            </Button>
            <PageHeader
                title={site.name}
                description="You can view this site. Editing and publishing are limited to owners and admins."
            />
            <section aria-labelledby="site-pages">
                <h2 id="site-pages" className="mb-4 text-lg font-medium">
                    Pages
                </h2>
                {site.pages.length ? (
                    <ul className="divide-y rounded-lg border">
                        {site.pages.map((page) => (
                            <li
                                key={page.id}
                                className="flex flex-wrap justify-between gap-2 p-4"
                            >
                                <span className="font-medium">
                                    {page.title}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    {page.path}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <EmptyState
                        title="No pages yet"
                        description="An owner or admin can add the first page."
                    />
                )}
            </section>
            <section aria-labelledby="site-comments">
                <h2 id="site-comments" className="mb-4 text-lg font-medium">
                    Review notes
                </h2>
                {comments.length ? (
                    <ul className="space-y-4">
                        {comments.map((comment) => (
                            <li
                                key={comment.id}
                                className="rounded-lg border p-4"
                            >
                                <p className="whitespace-pre-wrap break-words">
                                    {comment.body}
                                </p>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {comment.author.name}
                                    {comment.resolvedAt ? " · Resolved" : ""}
                                </p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <EmptyState
                        title="No review notes yet"
                        description="Notes left on this site will appear here."
                    />
                )}
            </section>
        </main>
    );
}
