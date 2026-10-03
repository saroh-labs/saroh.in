import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page-container";
import type { ScheduledGoLives } from "@/components/sites/site-versions";
import { SiteVersions } from "@/components/sites/site-versions";
import { requireSession } from "@/lib/session";
import { getReviewState, getSite, listPublications } from "@/lib/sites/service";
import { readTestReleases } from "@/lib/sites/test-releases-api";

/**
 * Version history (#194).
 *
 * Every publish has been kept since Stage 2 — `Publication` is immutable and
 * append-only, so republishing inserts a row rather than replacing one. The
 * history existed and had no surface; this is the surface.
 */
export const metadata = { title: "Version history" };

export default async function SiteVersionsPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();

    const [site, publications, review, releases] = await Promise.all([
        getSite(siteId),
        listPublications(siteId),
        // So the restore confirm can say a change request is outstanding
        // before a restore goes live past it (#279).
        getReviewState(siteId),
        // Go-lives that are scheduled and haven't happened (T12). Never
        // throws: `off` while test releases are off, and `failed` is said.
        readTestReleases(siteId),
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
                title="Version history"
                description={site.name}
                actions={
                    <Button variant="outline" asChild>
                        <Link href={`/sites/${siteId}/settings`}>Settings</Link>
                    </Button>
                }
            />
            <SiteVersions
                siteId={siteId}
                publications={publications}
                changesRequested={review.outstanding}
                canRestore={site.can.publish}
                needsApproval={site.publishNeedsApproval === true}
                canOverride={site.canOverride === true}
                scheduled={scheduled}
            />
        </PageContainer>
    );
}
