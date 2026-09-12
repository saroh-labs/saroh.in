"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { PreviewLinks } from "@/components/sites/preview-links";
import {
    createApproval,
    requestReview,
    setCommentResolved,
} from "@/lib/sites/actions";
import { shortDate } from "@/lib/sites/format-date";
import type {
    ReviewerVerdict,
    ReviewState,
    SiteCommentView,
    SitePage,
} from "@/lib/sites/service";

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
 */
export function ReviewPanel({
    siteId,
    pages,
    comments,
    review,
    onChanged,
    onJump,
}: {
    siteId: string;
    pages: SitePage[];
    comments: SiteCommentView[];
    /** The site's standing with its reviewers: pending, stale, latest verdict. */
    review: ReviewState;
    /** Re-read after a note, a verdict or a request, so the bar follows. */
    onChanged: () => void;
    onJump: (pageId: string, sectionKey: string) => void;
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
    async function record(outcome: ReviewerVerdict) {
        setRecording(true);
        const res = await createApproval(siteId, outcome);
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
        const res = await requestReview(siteId);
        setAsking(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Asked for a review. Share a preview so they can read it.");
        onChanged();
    }

    const verdict = (
        <div className="flex gap-2 border-b px-3 py-2">
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={recording}
                onClick={() => void record("APPROVED")}
            >
                Approve
            </Button>
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={recording}
                onClick={() => void record("CHANGES_REQUESTED")}
            >
                Ask for changes
            </Button>
        </div>
    );

    const askForReview = (
        <div className="border-b px-3 py-2">
            {review.pending ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                    In review. Publishing still works — it is recorded as going
                    ahead without approval.
                </p>
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
                    {review.approvalIsStale ? (
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
                <PreviewLinks siteId={siteId} />
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
                    No notes on this site yet. Share a preview above so people
                    can read the draft. Select a section to leave a note on it,
                    and say here whether the site is good to go.
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
            <PreviewLinks siteId={siteId} />
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
                        <h3 className="px-1 pb-1 text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground">
                            {page.title}
                        </h3>
                        <ul className="grid gap-1">
                            {notes.map((note) => (
                                <Note
                                    key={note.id}
                                    note={note}
                                    busy={busy === note.id}
                                    onToggle={() => void toggle(note)}
                                    onJump={onJump}
                                />
                            ))}
                        </ul>
                    </section>
                ))}

                {strays.length > 0 ? (
                    <section className="mb-4">
                        <h3 className="px-1 pb-1 text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground">
                            On a page that no longer exists
                        </h3>
                        <ul className="grid gap-1">
                            {strays.map((note) => (
                                <Note
                                    key={note.id}
                                    note={note}
                                    busy={busy === note.id}
                                    onToggle={() => void toggle(note)}
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
    onToggle: () => void;
    onJump: (pageId: string, sectionKey: string) => void;
}) {
    const settled = note.resolvedAt !== null;
    // A local const narrows where the property access does not: the page is
    // null once it has been deleted (#277).
    const pageId = note.pageId;
    return (
        <li
            className={cn(
                "rounded border p-2",
                settled && "opacity-60",
                note.orphaned && "border-dashed",
            )}
        >
            <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium">
                    {note.author.name}
                </span>
                <span className="shrink-0 text-[0.625rem] text-muted-foreground">
                    {shortDate(note.createdAt)}
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
                <p className="mt-1.5 text-[0.625rem] leading-relaxed text-muted-foreground/70">
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
            </div>
        </li>
    );
}
