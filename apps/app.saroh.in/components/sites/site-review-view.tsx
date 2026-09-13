"use client";

import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SectionReview } from "@/components/sites/section-review";
import { createApproval } from "@/lib/sites/actions";
import { exactDate } from "@/lib/sites/format-date";
import type {
    ReviewablePage,
    ReviewerVerdict,
    ReviewState,
    SiteCommentView,
    SiteDetail,
} from "@/lib/sites/service";

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
 */
export function SiteReviewView({
    site,
    page,
    activePageId,
    comments,
    review,
}: {
    site: SiteDetail;
    page: ReviewablePage;
    activePageId: string;
    comments: SiteCommentView[];
    review: ReviewState;
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
            <Button asChild variant="outline" className="wk-press">
                <Link href="/sites">Back to sites</Link>
            </Button>

            <PageHeader
                title={site.name}
                description={
                    site.can.comment
                        ? "Read the draft and leave notes on the sections you have something to say about. Editing and publishing stay with the owner."
                        : "You can read this site. Editing and publishing are limited to owners and admins."
                }
            />

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
