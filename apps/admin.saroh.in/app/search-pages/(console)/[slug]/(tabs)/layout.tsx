import { Badge } from "@saroh/ui/badge";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { NoAccessPanel } from "@/components/not-authorized";
import { RebuildBanner } from "@/components/search-pages/rebuild-banner";
import { SearchPageActions } from "@/components/search-pages/search-page-actions";
import { SearchPageTabs } from "@/components/search-pages/search-page-tabs";
import { FailedPanel } from "@/components/states/failed-panel";
import { can } from "@/lib/console";
import {
    badgeOf,
    canDo,
    cantPublishWords,
    inFilter,
    KINDS,
    sortRows,
    stateNote,
} from "@/lib/search-page-words";
import {
    loadPage,
    readSearchPages,
    searchPagesGate,
    siteInfo,
} from "@/lib/search-pages";

/**
 * One search page (DEC-193): its header and actions, then its tabs, each
 * its own address: Overview · Content · History.
 */
export default async function SearchPageLayout({
    params,
    children,
}: {
    params: Promise<{ slug: string }>;
    children: ReactNode;
}) {
    const gate = await searchPagesGate();
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const { slug } = await params;
    const [data, site] = await Promise.all([readSearchPages(), siteInfo()]);
    if (data.status === "denied") {
        return (
            <PageContainer width="full">
                <NoAccessPanel email={staff.email} />
            </PageContainer>
        );
    }
    if (data.status === "failed") {
        return (
            <PageContainer width="full">
                <FailedPanel things="this search page" />
            </PageContainer>
        );
    }
    const row = data.rows.find((r) => r.slug === slug);
    const page = loadPage(slug);
    if (!row || !page) notFound();
    const canPublish = can(staff, "search-pages:publish");
    const listHref =
        row.kind === "for" ? "/search-pages" : `/search-pages?kind=${row.kind}`;
    const kindLabel = KINDS.find((k) => k.kind === row.kind)?.label ?? "";
    // Previous and next in the list's own order (its kind, A to Z): a queue to review.
    const queue = sortRows(
        data.rows.filter((r) => r.kind === row.kind && inFilter(r, "all")),
        "name",
    );
    const at = queue.findIndex((r) => r.path === row.path);
    const prev = at > 0 ? queue[at - 1] : null;
    const next = at >= 0 && at < queue.length - 1 ? queue[at + 1] : null;
    // Held by checks: why, said to everyone (the buttons are only for publishers).
    const held = canDo("publish", row.state) && row.blocked.length > 0;

    return (
        <PageContainer width="full">
            <PageHeader
                className="mb-5"
                breadcrumb={[
                    "Product",
                    <Link key="list" href="/search-pages">
                        Search pages
                    </Link>,
                    <Link key="kind" href={listHref}>
                        {kindLabel}
                    </Link>,
                    row.name,
                ]}
                title={row.name}
                badge={
                    <Badge variant={badgeOf(row).variant}>
                        {badgeOf(row).label}
                    </Badge>
                }
                description={
                    <span>
                        <code className="font-mono text-[12.5px]">
                            {site.host}
                            {row.path}
                        </code>{" "}
                        ·{" "}
                        {held ? (
                            <span id="publish-held">
                                {cantPublishWords(row)} ·{" "}
                                <a
                                    href="#checks"
                                    className="whitespace-nowrap font-medium text-foreground underline underline-offset-2"
                                >
                                    See them
                                </a>
                            </span>
                        ) : (
                            stateNote(row)
                        )}
                        {!canPublish &&
                            ". Read-only: your role doesn't include publishing search pages."}
                    </span>
                }
                meta={
                    queue.length > 1 && (
                        <nav
                            aria-label={`Other ${kindLabel.toLowerCase()}`}
                            className="flex items-center gap-1 text-[13px] text-muted-foreground"
                        >
                            {prev ? (
                                <Link
                                    href={`/search-pages/${prev.slug}`}
                                    aria-label={`Previous: ${prev.name}`}
                                    className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                                >
                                    ‹ Previous
                                </Link>
                            ) : null}
                            <span className="tabular-nums">
                                {at + 1} of {queue.length}
                            </span>
                            {next ? (
                                <Link
                                    href={`/search-pages/${next.slug}`}
                                    aria-label={`Next: ${next.name}`}
                                    className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                                >
                                    Next ›
                                </Link>
                            ) : null}
                        </nav>
                    )
                }
                actions={
                    <SearchPageActions
                        row={row}
                        rows={data.rows}
                        site={site.host}
                        siteUrl={site.url}
                        production={site.production}
                        reviewSite={site.reviewHost}
                        reviewUrl={site.reviewUrl}
                        canPublish={canPublish}
                        page={page.page}
                    />
                }
            />
            {data.read.rebuild.running && (
                <div className="mb-5">
                    <RebuildBanner
                        running={data.read.rebuild.running}
                        startedAt={data.read.rebuild.startedAt}
                        site={site.host}
                        words=""
                        deploymentsHref={
                            can(staff, "deployments:run")
                                ? "/deployments"
                                : undefined
                        }
                    />
                </div>
            )}
            <SearchPageTabs slug={slug} />
            {children}
        </PageContainer>
    );
}
