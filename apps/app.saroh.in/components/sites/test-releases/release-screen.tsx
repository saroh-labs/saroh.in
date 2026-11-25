"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { Notice } from "@saroh/ui/notice";
import { PageHeader } from "@saroh/ui/page-header";
import { useSearchParams } from "next/navigation";

import { PageContainer } from "@/components/shared/page/page-container";
import { PageLoading } from "@/components/shared/page/page-loading";
import { OpenOnTestAddress } from "@/components/sites/test-releases/open-on-test-address";
import { ReleaseReviewView } from "@/components/sites/test-releases/release-review-view";
import { count } from "@/lib/format/plural";
import {
    frozenSections,
    releaseTitle,
    releaseVerdictLine,
} from "@/lib/sites/release-review";
import { releaseStatusCopy } from "@/lib/sites/test-releases";
import {
    useSiteRelease,
    useSiteSave,
    whenRefused,
} from "@/lib/sites/use-sites";

const crumb = (siteId: string) => (
    <IntentLink data-ph-unmask="" key="site" href={`/sites/${siteId}/pages`}>
        Website
    </IntentLink>
);

/**
 * One test release, read in the workspace (DEC-071, T12): its frozen
 * snapshot drawn through the blocks the live site uses, with the review
 * panel beside it. On React Query (DEC-259): its title is the release's,
 * so the loader stands until it lands; which page is open is the
 * address's `?path=`. A release that isn't this site's, or test releases
 * off for the business, is the not-found page (KTD-16).
 */
export function ReleaseScreen({
    siteId,
    releaseId,
}: {
    siteId: string;
    releaseId: string;
}) {
    const read = useSiteRelease(siteId, releaseId);
    const save = useSiteSave(siteId);
    const path = useSearchParams().get("path");
    const r = read.data;
    if (!r) {
        if (read.isError) {
            whenRefused(read.error);
            return (
                <PageContainer>
                    <PageHeader
                        breadcrumb={[crumb(siteId)]}
                        title="Test link"
                    />
                    <FailedState
                        size="panel"
                        title={couldntLoad("this test link")}
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
                breadcrumb={[crumb(siteId)]}
                label="Loading the test link"
            />
        );
    }

    const { release, review } = r;
    const page =
        r.pages.find((p) => p.path === path) ??
        r.pages.find((p) => p.isHome) ??
        r.pages.at(0);
    const sections = page ? frozenSections(page, r.unrenderable) : [];
    const unrenderableCount = page
        ? r.unrenderable.filter((u) => u.path === page.path).length
        : 0;
    // A note is pinned to the site's page with the same path (T8).
    const pageId = page
        ? (r.sitePages.find((p) => p.path === page.path)?.id ?? null)
        : null;
    // A release that is live or discarded is history: it is read, and takes
    // no more verdicts, requests or notes (the API answers 409).
    const open = release.status === "ready" || release.status === "scheduled";
    const status = releaseStatusCopy(release, r.zone);
    const back = {
        href: `/sites/${siteId}`,
        label: r.canEdit ? "Back to the editor" : "Back to review",
    };

    return (
        <PageContainer>
            <PageHeader
                breadcrumb={[crumb(siteId), releaseTitle(release)]}
                holdsData
                title={releaseTitle(release)}
                description={`${r.siteName} · ${status.line}`}
                actions={
                    <div className="flex flex-wrap gap-2">
                        {open ? (
                            <OpenOnTestAddress
                                siteId={siteId}
                                releaseId={release.id}
                            />
                        ) : null}
                        <Button variant="outline" asChild>
                            <IntentLink href={back.href}>
                                {back.label}
                            </IntentLink>
                        </Button>
                    </div>
                }
            />

            <Notice role="status">
                <p>
                    {release.status === "live" ? (
                        <>
                            This test link is live now.{" "}
                            <IntentLink
                                data-ph-unmask=""
                                href={`/sites/${siteId}/versions`}
                                className="font-medium underline underline-offset-2 hover:text-foreground focus-visible:text-foreground"
                            >
                                Version history
                            </IntentLink>{" "}
                            has the version it went live as.
                        </>
                    ) : release.status === "discarded" ? (
                        "This test link was discarded. Its links no longer open it, and it can't be reviewed or go live."
                    ) : (
                        "A test link: the site as it was frozen, not what visitors see now. Nothing here can be edited."
                    )}
                </p>
                <p data-release-verdict>
                    {releaseVerdictLine(review.latestApproval)}
                    {review.openNotes > 0
                        ? ` ${count(review.openNotes, "note is", "notes are")} open.`
                        : ""}
                </p>
                {release.note ? (
                    <p className="text-muted-foreground [overflow-wrap:anywhere]">
                        {release.note}
                    </p>
                ) : null}
                {open && release.draftChangedSince ? (
                    <p data-ph-unmask="" className="text-muted-foreground">
                        The draft has changed since this was made. Those changes
                        aren&apos;t in it.
                    </p>
                ) : null}
            </Notice>

            <ReleaseReviewView
                siteId={siteId}
                release={release}
                pages={r.pages}
                activePath={page?.path ?? null}
                sections={sections}
                pageId={pageId}
                variables={r.variables}
                unrenderableCount={unrenderableCount}
                comments={r.comments}
                review={review}
                sitePages={r.sitePages}
                canComment={open && r.canComment}
                can={{
                    approve: open && r.canApprove,
                    ask: open && r.canEdit,
                    settle: r.canEdit,
                }}
                saved={save.saved}
            />
        </PageContainer>
    );
}
