"use client";

import { Button } from "@saroh/ui/button";
import { PartialNotice } from "@saroh/ui/data-state";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { ReviewPanelAbilities } from "@/components/sites/review-panel";
import { ReviewPanel } from "@/components/sites/review-panel";
import { SectionReview } from "@/components/sites/section-review";
import type {
    PublishedPage,
    ReviewableSection,
    ReviewState,
    SiteCommentView,
    SitePage,
} from "@/lib/sites/service";
import type { TestRelease } from "@/lib/sites/test-releases";
import { LIVE_OUTSIDE_RELEASE } from "@/lib/sites/test-releases";

/**
 * A test release, read in the workspace, beside its own review (DEC-071,
 * T12).
 *
 * Reviewers look at the release, not the draft, and a verdict here is about
 * its frozen bytes (KTD-10): approving it leaves the draft's review exactly
 * as it was. Read-only: the release can't be edited, only read, noted,
 * approved or sent back. The page is drawn from the snapshot through the
 * blocks the live site uses, as the reviewer's draft screen is.
 *
 * Two columns at the desk, the review panel beside the page as it sits
 * beside the canvas in the editor; on a phone the panel follows the page,
 * where a reviewer who has read it says what they think.
 */
export function ReleaseReviewView({
    siteId,
    release,
    pages,
    activePath,
    sections,
    pageId,
    variables,
    unrenderableCount,
    comments,
    review,
    sitePages,
    canComment,
    can,
}: {
    siteId: string;
    release: TestRelease;
    /** The release's frozen pages, in its own order. */
    pages: PublishedPage[];
    activePath: string | null;
    /** The open page's sections, keyed by position (T8). */
    sections: ReviewableSection[];
    /**
     * The draft page with the frozen page's path, which a note is pinned
     * to; null when that page is gone from the site, and then no note can
     * be left on it.
     */
    pageId: string | null;
    variables: Record<string, string> | null;
    /** Sections on this page this build can no longer draw, left out. */
    unrenderableCount: number;
    comments: SiteCommentView[];
    review: ReviewState;
    /** The site's pages now, for grouping this release's notes. */
    sitePages: SitePage[];
    canComment: boolean;
    can: ReviewPanelAbilities;
}) {
    const router = useRouter();
    const base = `/sites/${siteId}/releases/${release.id}`;
    const hrefFor = (path: string) =>
        `${base}?path=${encodeURIComponent(path)}`;

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
            <div className="min-w-0 space-y-4">
                {pages.length > 1 ? (
                    <nav
                        aria-label="Pages in this test release"
                        className="flex flex-wrap gap-2"
                    >
                        {pages.map((p) => (
                            <Button
                                data-ph-mask=""
                                key={p.path}
                                asChild
                                size="sm"
                                variant={
                                    p.path === activePath
                                        ? "secondary"
                                        : "ghost"
                                }
                            >
                                <Link
                                    href={hrefFor(p.path)}
                                    aria-current={
                                        p.path === activePath
                                            ? "page"
                                            : undefined
                                    }
                                >
                                    {p.title}
                                </Link>
                            </Button>
                        ))}
                    </nav>
                ) : null}

                {unrenderableCount > 0 ? (
                    <PartialNotice>
                        {unrenderableCount === 1
                            ? "One section on this page can no longer be drawn by your site as it is today, and is left out below."
                            : `${unrenderableCount} sections on this page can no longer be drawn by your site as it is today, and are left out below.`}
                    </PartialNotice>
                ) : null}

                {activePath === null ? (
                    <p className="text-sm text-muted-foreground">
                        This test release holds no pages.
                    </p>
                ) : (
                    <SectionReview
                        siteId={siteId}
                        pageId={pageId ?? ""}
                        sections={sections}
                        comments={comments}
                        style={null}
                        styleOptions={null}
                        variables={variables}
                        canComment={canComment && pageId !== null}
                        testReleaseId={release.id}
                    />
                )}
                {activePath !== null && pageId === null && canComment ? (
                    <p className="text-xs text-muted-foreground">
                        This page has since been deleted from the site, so notes
                        can&apos;t be left on it.
                    </p>
                ) : null}

                <details className="group rounded-lg border px-4 py-3 text-sm">
                    <summary className="cursor-pointer font-medium text-foreground marker:text-muted-foreground hover:underline focus-visible:underline">
                        What&apos;s live, not in this release
                    </summary>
                    <p className="mt-2 text-muted-foreground">
                        These come from your live business, not this release, so
                        they show as they are now:
                    </p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted-foreground">
                        {LIVE_OUTSIDE_RELEASE.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                </details>
            </div>

            <aside
                aria-label="Review this test release"
                className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card lg:sticky lg:top-4"
            >
                <ReviewPanel
                    siteId={siteId}
                    pages={sitePages}
                    comments={comments}
                    review={review}
                    release={{
                        id: release.id,
                        number: release.number,
                        name: release.name,
                    }}
                    can={can}
                    onChanged={() => router.refresh()}
                    onJump={(jumpPageId) => {
                        // A note names a draft page; the release names its
                        // pages by path. Open that path here.
                        const path = sitePages.find(
                            (p) => p.id === jumpPageId,
                        )?.path;
                        if (path) router.push(hrefFor(path));
                    }}
                />
            </aside>
        </div>
    );
}
