import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { FileText, Plug } from "lucide-react";
import { notFound, redirect, unstable_rethrow } from "next/navigation";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { PagesArea } from "@/components/sites/pages-area/pages-area";
import {
    liveAiApps,
    offersAssistantWayIn,
} from "@/lib/ai-connections/mcp-address";
import { listAiConnections } from "@/lib/ai-connections/service";
import { formatList } from "@/lib/home/needs";
import { requireSession } from "@/lib/session";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import { businessAddress } from "@/lib/sites/default-site";
import {
    describePendingChanges,
    pendingChangeCount,
} from "@/lib/sites/pending";
import {
    getSite,
    getSiteChanges,
    getSiteOverview,
    listSiteRedirects,
} from "@/lib/sites/service";
import {
    readWebAddressLinks,
    RENDERER_APEX,
} from "@/lib/sites/share-links-read";
import { pageState } from "@/lib/sites/site-state";
import { pageUpdatedIso } from "@/lib/sites/updated";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";
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
    if (await websiteAreaOn())
        return <WebsitePages siteId={siteId} userId={session.user.id} />;
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
                        <IntentLink href={editorHref}>
                            Open the editor
                        </IntentLink>
                    </Button>
                }
            />
        );
    }

    // Home first, then as the editor orders them.
    const pages = [...site.pages].sort(
        (a, b) => Number(b.isHome) - Number(a.isHome),
    );
    const wayIn = await aiWayIn(session.user.id);
    const waiting = pendingChangeCount(
        site.pendingSectionChanges,
        site.pendingSiteChanges,
        site.pendingChanges,
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
                        <IntentLink
                            data-ph-unmask=""
                            href={editorHref}
                            className="font-medium underline-offset-4 hover:underline"
                        >
                            Review and publish
                        </IntentLink>
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
                            <IntentLink
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
                            </IntentLink>
                        </li>
                    );
                })}
            </ListCard>
            {wayIn ? <AiWayIn /> : null}
        </div>
    );
}

/**
 * A way into AI apps (release visibility U14): a line, never a notice, so
 * it can't stack with "Waiting to be published". Read softly.
 */
async function aiWayIn(userId: string): Promise<boolean> {
    return (
        apiAreaOn() &&
        offersAssistantWayIn(
            await listAiConnections().catch(() => null),
            userId,
        )
    );
}

function AiWayIn() {
    return (
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
                <IntentLink
                    href="/settings/developers/ai"
                    className="font-semibold text-foreground underline decoration-border-strong underline-offset-[3px] coarse:inline-block coarse:py-2.5"
                >
                    Edit your site from your AI assistant
                </IntentLink>
                <span className="text-muted-foreground">
                    {" · Works with "}
                    {formatList(liveAiApps().map((app) => app.name))}. Changes
                    stay a draft until you publish.
                </span>
            </span>
        </p>
    );
}

/**
 * Pages in the Website area (plan 2026-11-18-001 U5): the list with its
 * page health and last edits, and each page's settings sheet. The health
 * and the edits come from the Overview's read, so the Needs fixing count
 * is Overview's; when it fails the list still loads, without them.
 */
async function WebsitePages({
    siteId,
    userId,
}: {
    siteId: string;
    userId: string;
}) {
    const [site, overview, redirects, webAddress, wayIn, changes] =
        await Promise.all([
            getSite(siteId),
            getSiteOverview(siteId).catch((error: unknown): null => {
                unstable_rethrow(error);
                return null;
            }),
            listSiteRedirects(siteId).catch(() => null),
            readWebAddressLinks(),
            aiWayIn(userId),
            // The Status filter's source, the status chip's units; without it the list loads, without Status.
            getSiteChanges(siteId).catch((error: unknown): null => {
                unstable_rethrow(error);
                return null;
            }),
        ]);
    if (!site) notFound();
    return (
        <PagesArea
            siteId={site.id}
            siteName={site.name}
            pages={site.pages}
            host={
                businessAddress(site, webAddress, RENDERER_APEX)?.host ?? null
            }
            live={site.currentPublicationId !== null}
            siteImageUrl={site.socialImageUrl ?? null}
            canUpdate={site.can.manageSettings}
            addableKinds={site.addablePageKinds}
            health={overview?.needsDoing ?? null}
            edits={overview?.pageEdits ?? null}
            lastPublishedAt={overview?.lastPublished?.at ?? null}
            redirects={redirects}
            changes={changes?.units ?? null}
            footer={wayIn ? <AiWayIn /> : null}
        />
    );
}
