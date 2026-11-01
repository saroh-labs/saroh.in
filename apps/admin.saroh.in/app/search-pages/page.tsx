import { Badge } from "@saroh/ui/badge";
import { Notice } from "@saroh/ui/notice";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";

import { AdminShell } from "@/components/admin-shell";
import { NotAuthorized } from "@/components/not-authorized";
import { DeployBar } from "@/components/search-pages/deploy-bar";
import { RebuildBanner } from "@/components/search-pages/rebuild-banner";
import { SearchPagesTable } from "@/components/search-pages/search-pages-table";
import { FailedPanel } from "@/components/states/failed-panel";
import { can } from "@/lib/console";
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
        return <NotAuthorized email={staff.email} staff={staff} />;
    }
    const canPublish = can(staff, "search-pages:publish");
    const waiting =
        data.status === "ok" ? data.rows.filter((r) => r.pending) : [];
    const deploymentsHref = can(staff, "deployments:run")
        ? "/deployments"
        : undefined;

    return (
        <AdminShell staff={staff}>
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Product", "Search pages"]}
                    title="Search pages"
                    description={`Pages written for people who search Google: software for their trade, or a free tool. A page is on ${site.host} only after you publish it here and deploy the changes. Only published pages go in the sitemap.${canPublish ? "" : " Read-only: your role doesn't include publishing them."}`}
                    meta={
                        <Badge
                            dot
                            variant={site.production ? "success" : "info"}
                        >
                            {site.host} ·{" "}
                            {site.production ? "Production" : "Development"}
                        </Badge>
                    }
                />
                <div className="grid gap-4">
                    {!site.production && (
                        <Notice
                            tone="info"
                            title="This is the development site."
                        >
                            Every page shows on {site.host} so you can read it,
                            with a Draft label until it&apos;s published.
                            Publishing here changes {site.host} only, never
                            production.
                        </Notice>
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
                                kindCounts={Object.fromEntries(
                                    KINDS.map((k) => [
                                        k.kind,
                                        data.rows.filter(
                                            (r) => r.kind === k.kind,
                                        ).length,
                                    ]),
                                )}
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
        </AdminShell>
    );
}
