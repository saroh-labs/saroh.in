"use client";

import { Button } from "@saroh/ui/button";
import { PartialNotice } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { Notice } from "@saroh/ui/notice";
import { PageHeader } from "@saroh/ui/page-header";
import { TextLink } from "@saroh/ui/text-link";
import { useSearchParams } from "next/navigation";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { PageContainer } from "@/components/shared/page/page-container";
import { PageLoading } from "@/components/shared/page/page-loading";
import { RestoreVersion as LegacyRestoreVersion } from "@/components/sites/versions/legacy/restore-version";
import { PastVersionPreview } from "@/components/sites/versions/past-version-preview";
import { RestoreVersion } from "@/components/sites/versions/restore-version";
import { formatDateTime } from "@/lib/format/datetime";
import { plural } from "@/lib/format/plural";
import { releaseTitle } from "@/lib/sites/release-review";
import {
    useSiteSave,
    useSiteVersion,
    whenRefused,
} from "@/lib/sites/use-sites";
import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";

const crumbs = (siteId: string) => [
    <IntentLink data-ph-unmask="" key="site" href={`/sites/${siteId}/pages`}>
        Website
    </IntentLink>,
    <IntentLink
        data-ph-unmask=""
        key="versions"
        href={`/sites/${siteId}/versions`}
    >
        Version history
    </IntentLink>,
];

/**
 * One past version, as it was served (#283, #194): read-only by
 * construction, the only action putting it back. On React Query
 * (DEC-259): its title is the version's date, so the loader stands until
 * it lands; which page is open is the address's `?path=` (an unknown one
 * falls back to home). `asDraft` is the page's gate: restore as the draft
 * (the area on) or live again (today's).
 */
export function SiteVersionScreen({
    siteId,
    publicationId,
    asDraft,
}: {
    siteId: string;
    publicationId: string;
    asDraft: boolean;
}) {
    const read = useSiteVersion(siteId, publicationId);
    const save = useSiteSave(siteId);
    const zone = useBusinessZone();
    const path = useSearchParams().get("path");
    const v = read.data;
    if (!v) {
        if (read.isError) {
            whenRefused(read.error);
            return (
                <PageContainer>
                    <PageHeader
                        breadcrumb={crumbs(siteId)}
                        title="Past version"
                    />
                    <FailedState
                        size="panel"
                        title={couldntLoad("this version")}
                        onRetry={() => void read.refetch()}
                        retrying={read.isFetching}
                    />
                </PageContainer>
            );
        }
        return (
            <PageLoading
                shape="detail"
                width="default"
                breadcrumb={crumbs(siteId)}
                label="Loading the version"
            />
        );
    }

    // `.at(0)`: a version with no pages at all is a real thing to land on.
    const page =
        v.pages.find((p) => p.path === path) ??
        v.pages.find((p) => p.isHome) ??
        v.pages.at(0);
    const when = formatDateTime(v.publishedAt, zone, { year: "always" });
    const base = `/sites/${siteId}/versions/${publicationId}`;
    const restored = () => void save.saved();

    return (
        <PageContainer>
            <PageHeader
                breadcrumb={[...crumbs(siteId), when]}
                holdsData
                title={`Version from ${when}`}
                description={
                    v.publishedBy
                        ? `${v.siteName} · published by ${v.publishedBy}`
                        : v.siteName
                }
                actions={
                    <Button variant="outline" asChild>
                        <IntentLink href={`/sites/${siteId}/versions`}>
                            Version history
                        </IntentLink>
                    </Button>
                }
            />

            <Notice role="status">
                {v.isCurrent
                    ? "This is the version visitors see now."
                    : "A past version, as it was served. It is not what visitors see now, and nothing here can be edited."}
                {v.release ? (
                    <>
                        {" It went live from "}
                        <TextLink
                            href={`/sites/${siteId}/releases/${v.release.id}`}
                        >
                            {releaseTitle(v.release)}
                        </TextLink>
                        .
                    </>
                ) : null}
            </Notice>

            {v.renderable ? null : (
                <PartialNotice>
                    {v.unrenderableCount === 0
                        ? "This version's stored copy could not be read, so none of it can be shown."
                        : `${v.unrenderableCount === 1 ? "One section" : `${v.unrenderableCount} sections`} in this version can no longer be drawn by your site as it is today, and ${plural(v.unrenderableCount, "is", "are")} left out below.`}
                </PartialNotice>
            )}

            {!asDraft ? (
                // Off, today's restore: the version goes live again.
                v.canPublish ? (
                    <LegacyRestoreVersion
                        siteId={siteId}
                        publicationId={publicationId}
                        isCurrent={v.isCurrent}
                        renderable={v.renderable}
                        needsApproval={v.needsApproval}
                        canOverride={v.canOverride}
                        saved={save.saved}
                        orgId={save.orgId}
                    />
                ) : null
            ) : v.canEdit ? (
                <RestoreVersion
                    siteId={siteId}
                    publicationId={publicationId}
                    publishedAt={v.publishedAt}
                    isCurrent={v.isCurrent}
                    renderable={v.renderable}
                    onRestored={restored}
                    orgId={save.orgId}
                />
            ) : null}

            {v.pages.length > 1 ? (
                <nav
                    aria-label="Pages in this version"
                    className="flex flex-wrap gap-2"
                >
                    {v.pages.map((p) => (
                        <Button
                            data-ph-mask=""
                            key={p.path}
                            asChild
                            size="sm"
                            variant={
                                p.path === page?.path ? "secondary" : "ghost"
                            }
                        >
                            <IntentLink
                                href={`${base}?path=${encodeURIComponent(p.path)}`}
                                aria-current={
                                    p.path === page?.path ? "page" : undefined
                                }
                            >
                                {p.title}
                            </IntentLink>
                        </Button>
                    ))}
                </nav>
            ) : null}

            {page ? (
                <PastVersionPreview
                    sections={page.sections}
                    siteId={siteId}
                    variables={v.styleVariables}
                    look={v.look ?? undefined}
                />
            ) : (
                <p data-ph-unmask="" className="text-sm text-muted-foreground">
                    This version holds no pages.
                </p>
            )}
        </PageContainer>
    );
}
