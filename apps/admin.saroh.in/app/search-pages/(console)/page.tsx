import { Badge } from "@saroh/ui/badge";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import { TabStrip } from "@saroh/ui/tabs";

import { NoAccessPanel } from "@/components/not-authorized";
import { DeployBar } from "@/components/search-pages/deploy-bar";
import { RebuildBanner } from "@/components/search-pages/rebuild-banner";
import { SearchPagesTable } from "@/components/search-pages/search-pages-table";
import { FailedPanel } from "@/components/states/failed-panel";
import { can } from "@/lib/console";
import type { PageKind } from "@/lib/search-page-words";
import { KINDS, kindOf, rebuildWords } from "@/lib/search-page-words";
import { readSearchPages, searchPagesGate, siteInfo } from "@/lib/search-pages";

export const metadata = { title: "Search pages" };

/**
 * Search pages (DEC-193): every /for/ page or free tool (`?kind=tools`,
 * #1253) in the code, with whether it is live on this console's site.
 * Publishing stages a page; Deploy changes rebuilds the site once with
 * every staged page (R13). Only `search-pages:publish` acts, anyone who
 * reads the console sees it.
 */
export default async function SearchPagesPage({
    searchParams,
}: {
    searchParams: Promise<{ kind?: string }>;
}) {
    const kind = kindOf((await searchParams).kind);
    const gate = await searchPagesGate();
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const [data, site] = await Promise.all([readSearchPages(), siteInfo()]);
    if (data.status === "denied") {
        return (
            <PageContainer width="full">
                <NoAccessPanel email={staff.email} />
            </PageContainer>
        );
    }
    const canPublish = can(staff, "search-pages:publish");
    const waiting =
        data.status === "ok" ? data.rows.filter((r) => r.pending) : [];
    const deploymentsHref = can(staff, "deployments:run")
        ? "/deployments"
        : undefined;

    return (
        <PageContainer width="full">
            <PageHeader
                breadcrumb={["Product", "Search pages"]}
                title="Search pages"
                description={`Pages for people who search Google. Publish, then deploy the changes, to put one on ${site.host} and its sitemap.${site.production ? "" : " Development: every page shows here with a Draft label, and production is never touched."}${canPublish ? "" : " Read-only: your role doesn't include publishing them."}`}
                meta={
                    <Badge dot variant={site.production ? "success" : "info"}>
                        {site.host} ·{" "}
                        {site.production ? "Production" : "Development"}
                    </Badge>
                }
            />
            {/* One shrinkable column: the tabs scroll on a phone instead of widening the page. */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
                {data.status === "ok" && (
                    <TabStrip<PageKind>
                        label="Kind of page"
                        className="min-w-0"
                        value={kind}
                        tabs={KINDS.map((k) => {
                            const mine = data.rows.filter(
                                (r) => r.kind === k.kind,
                            );
                            const live = mine.filter((r) => r.onSite).length;
                            return {
                                value: k.kind,
                                label: k.label,
                                href:
                                    k.kind === "for"
                                        ? "/search-pages"
                                        : `/search-pages?kind=${k.kind}`,
                                count: mine.length,
                                extra: (
                                    <>
                                        {live > 0 && (
                                            <span className="text-[11.5px] font-medium text-success-subtle-foreground">
                                                {live} live
                                            </span>
                                        )}
                                        {mine.some((r) => r.pending) && (
                                            <span
                                                aria-label="Changes waiting to deploy"
                                                title="Changes waiting to deploy"
                                                className="size-1.5 rounded-full bg-warning"
                                            />
                                        )}
                                    </>
                                ),
                            };
                        })}
                    />
                )}
                {data.status === "failed" ? (
                    <FailedPanel things="search pages" />
                ) : (
                    <>
                        {/* The deploy bar carries the rebuild; the banner only when there's no bar (F9). */}
                        {!canPublish && waiting.length === 0 && (
                            <RebuildBanner
                                running={data.read.rebuild.running}
                                startedAt={data.read.rebuild.startedAt}
                                site={site.host}
                                words={rebuildWords(data.read.rebuild)}
                                deploymentsHref={deploymentsHref}
                            />
                        )}
                        <DeployBar
                            rows={waiting}
                            allRows={data.rows}
                            site={site.host}
                            reviewSite={site.reviewHost}
                            rebuilding={data.read.rebuild.running}
                            rebuild={{
                                startedAt: data.read.rebuild.startedAt,
                                words: rebuildWords(data.read.rebuild),
                                deploymentsHref,
                            }}
                            canPublish={canPublish}
                        />
                        <SearchPagesTable
                            key={kind}
                            kind={kind}
                            rows={data.rows.filter((r) => r.kind === kind)}
                            allRows={data.rows}
                            site={site.host}
                            reviewSite={site.reviewHost}
                            reviewUrl={site.reviewUrl}
                            canPublish={canPublish}
                        />
                    </>
                )}
            </div>
        </PageContainer>
    );
}
