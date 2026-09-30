"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { CircleCheck, CircleDot } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SectionReview } from "@/components/sites/section-review";
import { createApproval } from "@/lib/sites/actions";
import { exactDate } from "@/lib/sites/format-date";
import {
    releaseTitle,
    releaseVerdictLine,
    reviewSubject,
} from "@/lib/sites/release-review";
import type {
    ReviewablePage,
    ReviewerVerdict,
    ReviewState,
    SiteCommentView,
    SiteDetail,
} from "@/lib/sites/service";
import type { TestRelease } from "@/lib/sites/test-releases";

/**
 * The test releases waiting on a reviewer (DEC-071, T12): the ones that can
 * still be approved or sent back. `failed` is said; null while test
 * releases are off for the business, and then nothing is shown.
 */
export type ReleasesForReview =
    { state: "on"; releases: TestRelease[] } | { state: "failed" } | null;

/**
 * What someone who may read a site — but not author it — gets instead of the
 * editor (#275).
 *
 * Deliberately NOT the editor with its controls removed. A reviewer is reading
 * the work and saying what they think; the editor is an authoring tool, and
 * every future change to it would otherwise have to keep answering "and what
 * does this look like with no write access". This is a different screen.
 *
 * What replaced: a list of page titles and paths, which told a reviewer a site
 * had four pages and nothing about what was on them.
 *
 * It says what is being reviewed (DEC-071, T12): the draft, here, while
 * each test release is reviewed on its own page, which this lists. A
 * verdict here is on the draft and never on a release, and the other way
 * round (KTD-10).
 */
export function SiteReviewView({
    site,
    page,
    activePageId,
    comments,
    review,
    releases = null,
}: {
    site: SiteDetail;
    page: ReviewablePage;
    activePageId: string;
    comments: SiteCommentView[];
    review: ReviewState;
    releases?: ReleasesForReview;
}) {
    const router = useRouter();
    const [recording, setRecording] = useState(false);

    async function record(outcome: ReviewerVerdict) {
        setRecording(true);
        const res = await createApproval(site.id, outcome);
        setRecording(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            outcome === "APPROVED"
                ? "Marked as approved."
                : "Recorded that you asked for changes.",
        );
        router.refresh();
    }

    const open = comments.filter((c) => c.resolvedAt === null).length;

    return (
        <div className="space-y-6">
            {/* Which site, and what this reader may do with it. The Website
                header above is the screen; this is the thing being read. */}
            <div>
                <h2 className="font-display text-[19px] font-semibold tracking-[-0.025em]">
                    {site.name}
                </h2>
                <p className="mt-1 max-w-[68ch] text-pretty text-[13.5px] leading-[1.55] text-muted-foreground">
                    {site.can.comment
                        ? "Read the draft and leave notes on the sections you have something to say about. Editing and publishing stay with the owner."
                        : "You can read this site. Editing and publishing are limited to owners and admins."}
                </p>
            </div>

            <ReleasesToReview siteId={site.id} releases={releases} />

            <p className="flex items-baseline gap-2 border-b pb-2">
                <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    Reviewing
                </span>
                <span data-review-subject className="text-sm font-medium">
                    {reviewSubject(null)}
                </span>
            </p>

            {review.latestApproval ? (
                <p
                    role="status"
                    className="rounded-lg border bg-muted px-4 py-3 text-sm"
                    title={exactDate(review.latestApproval.at)}
                >
                    {review.latestApproval.outcome === "REQUESTED"
                        ? `${review.latestApproval.by} asked for a review.`
                        : review.latestApproval.outcome === "APPROVED"
                          ? `${review.latestApproval.by} approved this site.`
                          : review.latestApproval.outcome === "BYPASSED"
                            ? `${review.latestApproval.by} published without waiting for approval.`
                            : review.latestApproval.outcome === "OVERRIDDEN"
                              ? `${review.latestApproval.by} went live without approval.`
                              : `${review.latestApproval.by} asked for changes.`}
                    {open > 0
                        ? ` ${open === 1 ? "1 note is" : `${open} notes are`} open.`
                        : ""}
                </p>
            ) : null}

            {site.pages.length > 1 ? (
                <nav aria-label="Pages" className="flex flex-wrap gap-2">
                    {site.pages.map((p) => (
                        <Button
                            key={p.id}
                            asChild
                            size="sm"
                            variant={
                                p.id === activePageId ? "secondary" : "ghost"
                            }
                        >
                            <Link
                                href={`/sites/${site.id}?page=${p.id}`}
                                aria-current={
                                    p.id === activePageId ? "page" : undefined
                                }
                            >
                                {p.title}
                            </Link>
                        </Button>
                    ))}
                </nav>
            ) : null}

            <SectionReview
                siteId={site.id}
                pageId={activePageId}
                sections={page.sections}
                comments={comments}
                style={site.style}
                styleOptions={site.styleOptions}
                canComment={site.can.comment}
            />

            {site.can.approve ? (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={recording}
                        onClick={() => void record("APPROVED")}
                    >
                        Approve
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={recording}
                        onClick={() => void record("CHANGES_REQUESTED")}
                    >
                        Ask for changes
                    </Button>
                    <p className="w-full text-xs text-muted-foreground">
                        Neither publishes anything. The owner decides when the
                        site goes live, and a publish that goes ahead without an
                        approval is recorded as one.
                    </p>
                </div>
            ) : null}
        </div>
    );
}

/**
 * The open test releases, each linked to its own review (T12). Shown only
 * while test releases are on and there is one to review; a list that
 * couldn't be read says so rather than reading as none.
 */
function ReleasesToReview({
    siteId,
    releases,
}: {
    siteId: string;
    releases: ReleasesForReview;
}) {
    if (releases === null) return null;
    if (releases.state === "failed") {
        return (
            <p className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
                Couldn&apos;t check for test releases to review. Reload to try
                again.
            </p>
        );
    }
    const open = releases.releases.filter(
        (r) => r.status === "ready" || r.status === "scheduled",
    );
    if (open.length === 0) return null;
    return (
        <section aria-label="Test releases" className="space-y-2">
            <h3 className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Test releases
            </h3>
            <ul className="grid gap-2">
                {open.map((release) => {
                    const approved =
                        release.standing.latest?.outcome === "APPROVED";
                    return (
                        <li
                            key={release.id}
                            aria-label={release.name}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3.5"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-semibold [overflow-wrap:anywhere]">
                                    {releaseTitle(release)}
                                </p>
                                <p className="mt-0.5 flex items-start gap-1.5 text-[12.5px] leading-normal text-muted-foreground">
                                    {approved ? (
                                        <CircleCheck
                                            aria-hidden
                                            className="mt-0.5 size-3.5 shrink-0 text-success"
                                        />
                                    ) : (
                                        <CircleDot
                                            aria-hidden
                                            className="mt-0.5 size-3.5 shrink-0"
                                        />
                                    )}
                                    {releaseVerdictLine(
                                        release.standing.latest,
                                    )}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {release.status === "scheduled" ? (
                                    <Badge variant="info">Scheduled</Badge>
                                ) : null}
                                <Button size="sm" variant="outline" asChild>
                                    <Link
                                        href={`/sites/${siteId}/releases/${release.id}`}
                                    >
                                        Review
                                    </Link>
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
