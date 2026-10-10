import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/shared/page-container";
import { OpenOnTestAddress } from "@/components/sites/test-releases/open-on-test-address";
import { ReleaseReviewView } from "@/components/sites/test-releases/release-review-view";
import { requireSession } from "@/lib/session";
import {
    frozenSections,
    releaseTitle,
    releaseVerdictLine,
} from "@/lib/sites/release-review";
import { getReviewState, getSite, listComments } from "@/lib/sites/service";
import { releaseStatusCopy } from "@/lib/sites/test-releases";
import { readTestRelease } from "@/lib/sites/test-releases-api";

/**
 * One test release, read in the workspace (DEC-071, T12).
 *
 * Reviewers look at a release, not the draft, and approve that: its frozen
 * snapshot, drawn through the blocks the live site uses (as version history
 * draws a past version), with the review panel beside it. It needs no link
 * token: the session and `site:read` open it, so a reviewer invited to the
 * site reads what they were asked to without anyone forwarding a link.
 * "Open on the test address" mints a link for this person when they want
 * the whole site, shop and booking included.
 *
 * 404 when the release isn't this site's, or test releases are off for the
 * business (KTD-16): it is not told the feature exists.
 */
export const metadata = { title: "Test release · Website" };

export default async function TestReleasePage({
    params,
    searchParams,
}: {
    params: Promise<{ siteId: string; releaseId: string }>;
    searchParams: Promise<{ path?: string }>;
}) {
    const { siteId, releaseId } = await params;
    const { path } = await searchParams;
    await requireSession();

    const [site, detail] = await Promise.all([
        getSite(siteId),
        readTestRelease(siteId, releaseId),
    ]);
    if (!site || !detail) notFound();

    const [comments, review] = await Promise.all([
        // Its own notes and verdicts, never the draft's (T8).
        listComments(siteId, releaseId),
        getReviewState(siteId, releaseId),
    ]);

    const { release, zone, snapshot, renderability } = detail;
    const pages = snapshot.pages ?? [];
    // Which page is open is a URL question, as in version history. An
    // unknown path falls back to home.
    const page =
        pages.find((p) => p.path === path) ??
        pages.find((p) => p.isHome) ??
        pages.at(0);
    const sections = page
        ? frozenSections(page, renderability.unrenderable)
        : [];
    const unrenderableCount = page
        ? renderability.unrenderable.filter((u) => u.path === page.path).length
        : 0;
    // A note is pinned to the site's page with the same path (T8).
    const pageId = page
        ? (site.pages.find((p) => p.path === page.path)?.id ?? null)
        : null;

    // A release that is live or discarded is history: it is read, and takes
    // no more verdicts, requests or notes (the API answers 409).
    const open = release.status === "ready" || release.status === "scheduled";
    const status = releaseStatusCopy(release, zone);

    const back = site.can.edit
        ? { href: `/sites/${siteId}`, label: "Back to the editor" }
        : { href: `/sites/${siteId}/review`, label: "Back to review" };

    return (
        <PageContainer>
            <PageHeader
                holdsData
                title={releaseTitle(release)}
                description={`${site.name} · ${status.line}`}
                actions={
                    <div className="flex flex-wrap gap-2">
                        {open ? (
                            <OpenOnTestAddress
                                siteId={siteId}
                                releaseId={release.id}
                            />
                        ) : null}
                        <Button variant="outline" asChild>
                            <Link href={back.href}>{back.label}</Link>
                        </Button>
                    </div>
                }
            />

            <div
                role="status"
                className="space-y-1 rounded-lg border bg-muted px-4 py-3 text-sm"
            >
                <p>
                    {release.status === "live" ? (
                        <>
                            This test release is live now.{" "}
                            <Link
                                href={`/sites/${siteId}/versions`}
                                className="font-medium underline underline-offset-2 hover:text-foreground focus-visible:text-foreground"
                            >
                                Version history
                            </Link>{" "}
                            has the version it went live as.
                        </>
                    ) : release.status === "discarded" ? (
                        "This test release was discarded. Its links no longer open it, and it can't be reviewed or go live."
                    ) : (
                        "A test release: the site as it was frozen, not what visitors see now. Nothing here can be edited."
                    )}
                </p>
                <p data-release-verdict>
                    {releaseVerdictLine(review.latestApproval)}
                    {review.openNotes > 0
                        ? ` ${review.openNotes === 1 ? "1 note is" : `${review.openNotes} notes are`} open.`
                        : ""}
                </p>
                {release.note ? (
                    <p className="text-muted-foreground [overflow-wrap:anywhere]">
                        {release.note}
                    </p>
                ) : null}
                {open && release.draftChangedSince ? (
                    <p className="text-muted-foreground">
                        The draft has changed since this was made. Those changes
                        aren&apos;t in it.
                    </p>
                ) : null}
            </div>

            <ReleaseReviewView
                siteId={siteId}
                release={release}
                pages={pages}
                activePath={page?.path ?? null}
                sections={sections}
                pageId={pageId}
                variables={snapshot.site?.styleVariables ?? null}
                unrenderableCount={unrenderableCount}
                comments={comments}
                review={review}
                sitePages={site.pages}
                canComment={open && site.can.comment}
                can={{
                    approve: open && site.can.approve,
                    ask: open && site.can.edit,
                    settle: site.can.edit,
                }}
            />
        </PageContainer>
    );
}
