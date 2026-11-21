import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page/page-container";
import { SiteVersions as LegacySiteVersions } from "@/components/sites/versions/legacy/site-versions";
import type { ScheduledGoLives } from "@/components/sites/versions/site-versions";
import { SiteVersions } from "@/components/sites/versions/site-versions";
import { requireSession } from "@/lib/session";
import { getReviewState, getSite, listPublications } from "@/lib/sites/service";
import { readTestReleases } from "@/lib/sites/test-releases-api";
import { restoresAsDraft } from "@/lib/sites/website-area-switch";

/**
 * Version history (#194).
 *
 * Every publish has been kept since Stage 2 — `Publication` is immutable and
 * append-only, so republishing inserts a row rather than replacing one. The
 * history existed and had no surface; this is the surface.
 */
export const metadata = { title: "Version history · Website" };

export default async function SiteVersionsPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();

    const asDraft = restoresAsDraft();
    const [site, publications, releases, review] = await Promise.all([
        getSite(siteId),
        listPublications(siteId),
        // Go-lives that are scheduled and haven't happened (T12). Never
        // throws: `off` while test releases are off, and `failed` is said.
        readTestReleases(siteId),
        // Off, today's restore confirm says a change request is outstanding
        // before a restore goes live past it (#279).
        asDraft ? null : getReviewState(siteId),
    ]);
    if (!site) notFound();

    const scheduled: ScheduledGoLives =
        releases.state === "on"
            ? {
                  state: "on",
                  releases: releases.list.releases,
                  zone: releases.list.zone,
              }
            : releases.state === "failed"
              ? { state: "failed" }
              : null;

    return (
        <PageContainer>
            <PageHeader
                breadcrumb={[
                    <Link
                        data-ph-unmask=""
                        key="site"
                        href={`/sites/${siteId}/pages`}
                    >
                        Website
                    </Link>,
                    "Version history",
                ]}
                holdsData="description"
                title="Version history"
                description={site.name}
                actions={
                    <Button variant="outline" asChild>
                        <Link href={`/sites/${siteId}/settings`}>Settings</Link>
                    </Button>
                }
            />
            {asDraft ? (
                <SiteVersions
                    siteId={siteId}
                    publications={publications}
                    canRestore={site.can.edit}
                    scheduled={scheduled}
                />
            ) : (
                <LegacySiteVersions
                    siteId={siteId}
                    publications={publications}
                    changesRequested={review?.outstanding ?? false}
                    canRestore={site.can.publish}
                    needsApproval={site.publishNeedsApproval === true}
                    canOverride={site.canOverride === true}
                    scheduled={scheduled}
                />
            )}
        </PageContainer>
    );
}
