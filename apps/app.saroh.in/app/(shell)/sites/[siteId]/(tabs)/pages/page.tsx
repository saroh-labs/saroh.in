import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { FileText, Plug } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import {
    liveAiApps,
    offersAssistantWayIn,
} from "@/lib/ai-connections/mcp-address";
import { listAiConnections } from "@/lib/ai-connections/service";
import { formatList } from "@/lib/home/needs";
import { requireSession } from "@/lib/session";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import {
    describePendingChanges,
    pendingChangeCount,
} from "@/lib/sites/pending";
import { getSite } from "@/lib/sites/service";
import { pageState } from "@/lib/sites/site-state";
import { pageUpdatedIso } from "@/lib/sites/updated";
import { ListCard, ListRow } from "@saroh/ui/list-card";
import { Notice } from "@saroh/ui/notice";

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
    const session = await requireSession();
    const site = await getSite(siteId);
    if (!site) notFound();
    // A reader reads the pages in the editor, read-only (DEC-200).
    if (!site.can.edit) redirect(`/sites/${siteId}`);

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
    // A way into AI apps (release visibility U14): a line, never a notice,
    // so it can't stack with "Waiting to be published". Read softly.
    const wayIn =
        apiAreaOn() &&
        offersAssistantWayIn(
            await listAiConnections().catch(() => null),
            session.user.id,
        );
    const waiting = pendingChangeCount(
        site.pendingSectionChanges,
        site.pendingSiteChanges,
    );

    return (
        <div className="flex flex-col gap-4">
            {waiting > 0 ? (
                <Notice role="status" align="center">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
                            data-ph-unmask=""
                            href={editorHref}
                            className="font-medium underline-offset-4 hover:underline"
                        >
                            Review and publish
                        </Link>
                    </div>
                </Notice>
            ) : null}
            <ListCard
                main="Page"
                paged={{ list: "site-pages", things: "pages" }}
                middle="Updated"
                end="On the site"
                // Plain words (UX-081): where a page is removed, not why it isn't here.
                note="To remove a page, open it in the editor and choose Delete page in its settings."
            >
                {pages.map((page) => {
                    const state = pageState(page, site);
                    const updated = pageUpdatedIso(page);
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
                                        <>
                                            <span className="font-mono">
                                                {page.path}
                                            </span>
                                            {/* The Updated column is desk
                                                only; a phone reads it here. */}
                                            {updated ? (
                                                <span className="sm:hidden">
                                                    {" · Updated "}
                                                    <ViewerDate iso={updated} />
                                                </span>
                                            ) : null}
                                        </>
                                    }
                                    middle={
                                        updated ? (
                                            <span className="whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
                                                <ViewerDate iso={updated} />
                                            </span>
                                        ) : null
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
            {wayIn ? (
                // Saroh's own words and its list of AI apps: read in a recording.
                <p
                    data-ph-unmask=""
                    className="-mt-1.5 flex items-start gap-2 text-[13px] leading-normal text-foreground/80"
                >
                    <Plug
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <span>
                        <Link
                            href="/settings/developers/ai"
                            className="font-semibold text-foreground underline decoration-border-strong underline-offset-[3px] coarse:inline-block coarse:py-2.5"
                        >
                            Edit your site from your AI assistant
                        </Link>
                        <span className="text-muted-foreground">
                            {" · Works with "}
                            {formatList(liveAiApps().map((app) => app.name))}.
                            Changes stay a draft until you publish.
                        </span>
                    </span>
                </p>
            ) : null}
        </div>
    );
}
