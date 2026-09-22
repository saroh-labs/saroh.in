import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { FileText } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ListCard, ListRow } from "@/components/shared/list-card";
import { requireSession } from "@/lib/session";
import {
    describePendingChanges,
    pendingChangeCount,
} from "@/lib/sites/pending";
import { getSite } from "@/lib/sites/service";
import { pageState } from "@/lib/sites/site-state";

export const metadata = { title: "Pages · Website" };

const PILL = {
    live: "success",
    unpublished: "draft",
    hidden: "neutral",
} as const;

/**
 * A site's pages, as a list — the design's Pages tab.
 *
 * Each row opens that page in the editor, where it is added to, reordered,
 * hidden and published. Publishing is whole-site, so the pill says what the
 * PUBLIC sees of the page, derived from the site and the page's own hidden
 * flag, rather than inventing a per-page publish state the product does not
 * have.
 */
export default async function SitePagesPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();
    const site = await getSite(siteId);
    if (!site) notFound();
    // The editor is where pages are worked on; a reader has the Review tab,
    // which renders each page rather than listing it.
    if (!site.can.edit) redirect(`/sites/${siteId}/review`);

    const editorHref = `/sites/${siteId}`;
    if (site.pages.length === 0) {
        return (
            <EmptyState
                icon={<FileText />}
                title="No pages yet"
                description="This site has a domain but nothing on it."
                action={
                    <Button asChild>
                        <Link href={editorHref}>Open the editor</Link>
                    </Button>
                }
            />
        );
    }

    // Home first, then as the editor orders them.
    const pages = [...site.pages].sort(
        (a, b) => Number(b.isHome) - Number(a.isHome),
    );
    const waiting = pendingChangeCount(
        site.pendingSectionChanges,
        site.pendingSiteChanges,
    );

    return (
        <div className="flex flex-col gap-4">
            {waiting > 0 ? (
                <p
                    role="status"
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-border bg-muted/40 px-4 py-3 text-[13px]"
                >
                    <span className="min-w-0 flex-1 text-pretty">
                        Waiting to be published:{" "}
                        {describePendingChanges(
                            site.pendingSectionChanges,
                            site.pendingSiteChanges,
                        ) ?? `${waiting} changes`}
                        .{" "}
                        {site.currentPublicationId
                            ? "The public still sees the last published version."
                            : "Nothing is public until the site is published."}
                    </span>
                    <Link
                        href={editorHref}
                        className="font-medium underline-offset-4 hover:underline"
                    >
                        Review and publish
                    </Link>
                </p>
            ) : null}
            <ListCard
                main="Page"
                end="On the site"
                note="A page is part of the site's structure. Deleting one is a redirect decision, so it is not a row action."
            >
                {pages.map((page) => {
                    const state = pageState(page, site);
                    return (
                        <li
                            key={page.id}
                            className="border-b border-border last:border-b-0"
                        >
                            <Link
                                href={`${editorHref}?page=${page.id}`}
                                aria-label={`${page.title}, ${state.label.toLowerCase()}. Open in the editor.`}
                                className="block bg-card transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            >
                                <ListRow
                                    title={page.title}
                                    tag={
                                        page.isHome ? (
                                            <Badge variant="neutral">
                                                Home
                                            </Badge>
                                        ) : null
                                    }
                                    sub={
                                        <span className="font-mono">
                                            {page.path}
                                        </span>
                                    }
                                    end={
                                        <Badge variant={PILL[state.state]}>
                                            {state.label}
                                        </Badge>
                                    }
                                />
                            </Link>
                        </li>
                    );
                })}
            </ListCard>
        </div>
    );
}
