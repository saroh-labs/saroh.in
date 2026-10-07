"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { useBusinessZone } from "@/components/shared/business-zone";
import { PreviewLinks } from "@/components/sites/preview-links";
import { VerdictControls } from "@/components/sites/verdict-controls";
import {
    createApproval,
    requestReview,
    setCommentResolved,
    withdrawReview,
} from "@/lib/sites/actions";
import { shortDate } from "@/lib/sites/format-date";
import { reviewSubject } from "@/lib/sites/release-review";
import type {
    PublicationRelease,
    ReviewerVerdict,
    ReviewState,
    SiteCommentView,
    SitePage,
} from "@/lib/sites/service";

/** What this person may do in the panel. The editor's people may do all. */
export interface ReviewPanelAbilities {
    /** `site:approve`: Approve, Ask for changes. */
    approve: boolean;
    /** `site:update`: ask for a review. */
    ask: boolean;
    /** `section:write`: mark a note settled, or reopen it. */
    settle: boolean;
}

const EVERYTHING: ReviewPanelAbilities = {
    approve: true,
    ask: true,
    settle: true,
};

/**
 * The rail's Review tab (#193).
 *
 * "Feedback returns in the Review tab, grouped by page: section, author, time,
 * note text, click to jump." The rail widens to 300px for this tab alone —
 * notes run two or three lines and 200px turns every one of them into a column
 * of single words.
 *
 * Scope is the issue's: notes and one approval. No assignment, no states, no
 * rounds. Resolving is the OWNER's action, not the reviewer's — the reviewer
 * says what they think and the owner decides when it is settled.
 *
 * It says what is being reviewed (DEC-071, T12): the draft, in the editor,
 * or one test release, beside that release's frozen pages. On a release,
 * every verdict, request and note carries its id, so it is about those bytes
 * and leaves the draft's own review as it was (KTD-10). A release is shared
 * by its own links, so the draft's preview links aren't offered there.
 */
export function ReviewPanel({
    siteId,
    pages,
    comments,
    review,
    onChanged,
    onJump,
    release = null,
    can = EVERYTHING,
}: {
    siteId: string;
    pages: SitePage[];
    comments: SiteCommentView[];
    /** The site's standing with its reviewers: pending, stale, latest verdict. */
    review: ReviewState;
    /** Re-read after a note, a verdict or a request, so the bar follows. */
    onChanged: () => void;
    onJump: (pageId: string, sectionKey: string) => void;
    /** The test release under review; null for the draft. */
    release?: PublicationRelease | null;
    can?: ReviewPanelAbilities;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [showResolved, setShowResolved] = useState(false);
    const [recording, setRecording] = useState(false);
    const [asking, setAsking] = useState(false);

    /**
     * Say what you think (#277). The api gates both on `site:approve`, which
     * OWNER, ADMIN and REVIEWER hold.
     *
     * Neither verdict changes what the public sees: approving does not
     * publish, and asking for changes does not block a publish — it is
     * recorded, and publishing over it is recorded as a bypass (#199).
     */
    async function record(
        outcome: ReviewerVerdict,
        reason?: string,
    ): Promise<boolean> {
        setRecording(true);
        const res = await createApproval(siteId, outcome, release?.id, reason);
        setRecording(false);
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        showSuccess(
            outcome === "APPROVED"
                ? "Marked as approved."
                : "Recorded that you asked for changes.",
        );
        onChanged();
        return true;
    }

    /** Take the draft's request back (UX-068): it no longer reads In review. */
    async function withdraw() {
        setAsking(true);
        const res = await withdrawReview(siteId);
        setAsking(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Review request withdrawn.");
        onChanged();
    }

    /**
     * Ask for a review (#278).
     *
     * The act the model was missing: until this existed, a review nobody had
     * answered could not be expressed, so "waiting on someone" and "nobody was
     * asked" looked identical. It blocks nothing — publishing while it stands
     * still works, and is recorded as a bypass.
     */
    async function ask() {
        setAsking(true);
        const res = await requestReview(siteId, release?.id);
        setAsking(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            release
                ? "Asked for a review. Share a link to the test release so they can read it."
                : "Asked for a review. Share a preview so they can read it.",
        );
        onChanged();
    }

    /*
     * What is being reviewed, first: a verdict below is about exactly this,
     * and a reviewer who has two releases and a draft open must never have
     * to guess which one they approved.
     */
    const subject = (
        <div className="flex shrink-0 items-baseline gap-2 border-b px-3 py-2">
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Reviewing
            </span>
            <span
                data-review-subject
                className="min-w-0 truncate text-xs font-medium"
            >
                {reviewSubject(release)}
            </span>
        </div>
    );

    const shareLinks = release ? null : <PreviewLinks siteId={siteId} />;

    /*
     * Not on your own request (UX-068): approving what you asked to have
     * looked at is not a second pair of eyes, and the API would not count it.
     */
    const verdict =
        !can.approve || review.askedByYou ? null : (
            <div className="flex flex-wrap gap-2 border-b px-3 py-2">
                <VerdictControls
                    compact
                    recording={recording}
                    onRecord={record}
                />
            </div>
        );

    const askForReview = !can.ask ? null : (
        <div className="border-b px-3 py-2">
            {review.pending ? (
                <>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        In review. Publishing still works — it is recorded as
                        going ahead without approval, and ends the review.
                    </p>
                    {release ? null : (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="mt-1 h-7 px-2 text-xs"
                            disabled={asking}
                            onClick={() => void withdraw()}
                        >
                            {asking ? "Withdrawing…" : "Withdraw the request"}
                        </Button>
                    )}
                </>
            ) : (
                <>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={asking}
                        onClick={() => void ask()}
                    >
                        {asking ? "Asking…" : "Ask for a review"}
                    </Button>
                    {review.approvalIsStale && !release ? (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            This site was approved, and has been edited since.
                            The approval does not cover the changes.
                        </p>
                    ) : null}
                </>
            )}
        </div>
    );

    const open = comments.filter((c) => c.resolvedAt === null);
    const shown = showResolved ? comments : open;

    async function toggle(comment: SiteCommentView) {
        setBusy(comment.id);
        const res = await setCommentResolved(
            siteId,
            comment.id,
            comment.resolvedAt === null,
        );
        setBusy(null);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        onChanged();
    }

    if (comments.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {subject}
                {shareLinks}
                {verdict}
                {askForReview}
                {/*
                 * The design's empty state, which states the whole feature in
                 * one sentence. Until #198 it described an action that did
                 * not exist — "share a preview" had no control anywhere — so
                 * a merchant would form the plan and then fail to find the
                 * button. The control now sits directly above this sentence.
                 */}
                {/*
                 * Every action this sentence names now exists: share a preview
                 * above, leave a note under a selected section, and the two
                 * verdict buttons. Until #277 the note half described nothing
                 * — the api took notes and no screen ever posted one.
                 */}
                <p className="p-4 text-xs leading-relaxed text-muted-foreground">
                    {release
                        ? "No notes on this test release yet. Select a section to leave a note on it, and say here whether it's good to go live."
                        : "No notes on this site yet. Share a preview above so people can read the draft. Select a section to leave a note on it, and say here whether the site is good to go."}
                </p>
            </div>
        );
    }

    // Grouped by page, in the site's own page order rather than the notes'.
    const groups = pages
        .map((page) => ({
            page,
            notes: shown.filter((c) => c.pageId === page.id),
        }))
        .filter((g) => g.notes.length > 0);

    // A note whose page is gone entirely — rarer than an orphaned section, but
    // the same rule applies: it does not disappear.
    const pageIds = new Set(pages.map((p) => p.id));
    // Null since #277: deleting a page now leaves its notes behind rather than
    // deleting them with it.
    const strays = shown.filter(
        (c) => c.pageId === null || !pageIds.has(c.pageId),
    );

    /*
     * ONE scroller for the whole panel, which is what the empty state above
     * already does.
     *
     * This column held four fixed blocks — the share links, the verdict, the
     * ask-for-review prompt, the counts row — above a notes list that was the
     * only thing allowed to scroll. Flex children shrink; their CONTENT does
     * not, so once the four were taller than the pane the panel overflowed it
     * and painted over the fields panel below. On a phone, where the rail gets
     * a third of the screen, "Create link" ended up drawn on top of another
     * pane and could not be clicked at all — the browser flow in
     * `e2e/tests/site-review.spec.ts` failed on exactly that.
     */
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {subject}
            {shareLinks}
            {verdict}
            {askForReview}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
                <span className="text-xs text-muted-foreground">
                    {open.length === 0
                        ? "Nothing open"
                        : open.length === 1
                          ? "1 note open"
                          : `${open.length} notes open`}
                </span>
                {comments.length > open.length ? (
                    <button
                        type="button"
                        onClick={() => setShowResolved((v) => !v)}
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                        {showResolved ? "Hide settled" : "Show settled"}
                    </button>
                ) : null}
            </div>

            <div className="min-h-0 flex-1 p-2">
                {groups.map(({ page, notes }) => (
                    <section key={page.id} className="mb-4">
                        <h3 className="px-1 pb-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                            {page.title}
                        </h3>
                        <ul className="grid gap-1">
                            {notes.map((note) => (
                                <Note
                                    key={note.id}
                                    note={note}
                                    busy={busy === note.id}
                                    onToggle={
                                        can.settle
                                            ? () => void toggle(note)
                                            : null
                                    }
                                    onJump={onJump}
                                />
                            ))}
                        </ul>
                    </section>
                ))}

                {strays.length > 0 ? (
                    <section className="mb-4">
                        <h3 className="px-1 pb-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                            On a page that no longer exists
                        </h3>
                        <ul className="grid gap-1">
                            {strays.map((note) => (
                                <Note
                                    key={note.id}
                                    note={note}
                                    busy={busy === note.id}
                                    onToggle={
                                        can.settle
                                            ? () => void toggle(note)
                                            : null
                                    }
                                    onJump={onJump}
                                />
                            ))}
                        </ul>
                    </section>
                ) : null}
            </div>
        </div>
    );
}

function Note({
    note,
    busy,
    onToggle,
    onJump,
}: {
    note: SiteCommentView;
    busy: boolean;
    /** Null for someone who can't settle notes: the control is absent. */
    onToggle: (() => void) | null;
    onJump: (pageId: string, sectionKey: string) => void;
}) {
    const zone = useBusinessZone();
    const settled = note.resolvedAt !== null;
    // A local const narrows where the property access does not: the page is
    // null once it has been deleted (#277).
    const pageId = note.pageId;
    return (
        <li
            className={cn(
                "rounded border p-2",
                settled && "text-muted-foreground",
                note.orphaned && "border-dashed",
            )}
        >
            <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium">
                    {note.author.name}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                    {shortDate(note.createdAt, zone)}
                </span>
            </div>

            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {note.body}
            </p>

            {note.orphaned ? (
                /*
                 * Said rather than hidden. The note survives its section being
                 * deleted (the api keeps it), and the merchant needs to know
                 * why clicking it goes nowhere — a note that silently did
                 * nothing would read as broken.
                 */
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    {note.pageId === null
                        ? note.pageTitle === null
                            ? "The page this was about has been deleted."
                            : `The page this was about, ${note.pageTitle}, has been deleted.`
                        : "The section this was about is no longer on the page."}
                </p>
            ) : null}

            <div className="mt-2 flex items-center gap-1">
                {note.orphaned || pageId === null ? null : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[0.6875rem]"
                        onClick={() => onJump(pageId, note.sectionKey)}
                    >
                        Go to section
                    </Button>
                )}
                {onToggle ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        className="ml-auto h-6 px-1.5 text-[0.6875rem]"
                        onClick={onToggle}
                    >
                        {settled ? "Reopen" : "Mark settled"}
                    </Button>
                ) : null}
            </div>
        </li>
    );
}
