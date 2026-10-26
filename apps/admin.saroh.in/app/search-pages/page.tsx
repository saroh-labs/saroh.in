import { Badge } from "@saroh/ui/badge";
import { Notice } from "@saroh/ui/notice";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";

import { AdminShell } from "@/components/admin-shell";
import { NotAuthorized } from "@/components/not-authorized";
import { RebuildBanner } from "@/components/search-pages/rebuild-banner";
import { SearchPagesTable } from "@/components/search-pages/search-pages-table";
import { FailedPanel } from "@/components/states/failed-panel";
import { can } from "@/lib/console";
import { rebuildWords } from "@/lib/search-page-words";
import { readSearchPages, searchPagesGate, siteInfo } from "@/lib/search-pages";

export const metadata = { title: "Search pages" };

/**
 * Search pages (DEC-193): every /for/ page in the code, with whether it is
 * live on this console's site. Publishing rebuilds the site; only
 * `search-pages:publish` acts, anyone who reads the console sees it.
 */
export default async function SearchPagesPage() {
    const gate = await searchPagesGate();
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const [data, site] = await Promise.all([readSearchPages(), siteInfo()]);
    if (data.status === "denied") {
        return <NotAuthorized email={staff.email} staff={staff} />;
    }
    const canPublish = can(staff, "search-pages:publish");

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Product", "Search pages"]}
                    title="Search pages"
                    description={`Pages written for people who search Google for software for their trade. A page is on ${site.host} only after you publish it here. Only published pages go in the sitemap.${canPublish ? "" : " Read-only: your role doesn't include publishing them."}`}
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
                            <RebuildBanner
                                running={data.read.rebuild.running}
                                startedAt={data.read.rebuild.startedAt}
                                site={site.host}
                                words={rebuildWords(data.rows)}
                                deploymentsHref={
                                    can(staff, "deployments:run")
                                        ? "/deployments"
                                        : undefined
                                }
                            />
                            <SearchPagesTable
                                rows={data.rows}
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
