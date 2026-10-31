import { Badge } from "@saroh/ui/badge";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import { NotAuthorized } from "@/components/not-authorized";
import { RebuildBanner } from "@/components/search-pages/rebuild-banner";
import { SearchPageActions } from "@/components/search-pages/search-page-actions";
import { SearchPageTabs } from "@/components/search-pages/search-page-tabs";
import { FailedPanel } from "@/components/states/failed-panel";
import { can } from "@/lib/console";
import { badgeOf, KINDS, stateNote } from "@/lib/search-page-words";
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
        return <NotAuthorized email={staff.email} staff={staff} />;
    }
    if (data.status === "failed") {
        return (
            <AdminShell staff={staff}>
                <PageContainer>
                    <FailedPanel things="this search page" />
                </PageContainer>
            </AdminShell>
        );
    }
    const row = data.rows.find((r) => r.slug === slug);
    const page = loadPage(slug);
    if (!row || !page) notFound();
    const canPublish = can(staff, "search-pages:publish");

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    className="mb-5"
                    breadcrumb={[
                        "Product",
                        <Link
                            key="list"
                            href={
                                row.kind === "for"
                                    ? "/search-pages"
                                    : `/search-pages?kind=${row.kind}`
                            }
                        >
                            Search pages
                        </Link>,
                        KINDS.find((k) => k.kind === row.kind)?.label ?? "",
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
                            · {stateNote(row)}
                            {!canPublish &&
                                ". Read-only: your role doesn't include publishing search pages."}
                        </span>
                    }
                    actions={
                        <SearchPageActions
                            row={row}
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
        </AdminShell>
    );
}
