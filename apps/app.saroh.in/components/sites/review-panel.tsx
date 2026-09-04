"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

import { PreviewLinks } from "@/components/sites/preview-links";
import { setCommentResolved } from "@/lib/sites/actions";
import { shortDate } from "@/lib/sites/format-date";
import type { SiteCommentView, SitePage } from "@/lib/sites/service";

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
    onChanged,
    onJump,
}: {
    siteId: string;
    pages: SitePage[];
    comments: SiteCommentView[];
    /** Re-read after a note changes, so the counts and dots follow. */
    onChanged: () => void;
    onJump: (pageId: string, sectionKey: string) => void;
}) {
    const [busy, setBusy] = useState<string | null>(null);
    const [showResolved, setShowResolved] = useState(false);

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
            toast.error(res.error);
            return;
        }
        onChanged();
    }

    if (comments.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <PreviewLinks siteId={siteId} />
                {/*
                 * The design's empty state, which states the whole feature in
                 * one sentence. Until #198 it described an action that did
                 * not exist — "share a preview" had no control anywhere — so
                 * a merchant would form the plan and then fail to find the
                 * button. The control now sits directly above this sentence.
                 */}
                <p className="p-4 text-xs leading-relaxed text-muted-foreground">
                    No notes on this site yet. Share a preview above so people
                    can read the draft; anyone with the Reviewer role can pin
                    notes to sections from this editor.
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
    const strays = shown.filter((c) => !pageIds.has(c.pageId));

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <PreviewLinks siteId={siteId} />
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
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

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
                    The section this was about is no longer on the page.
                </p>
            ) : null}

            <div className="mt-2 flex items-center gap-1">
                {note.orphaned ? null : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[0.6875rem]"
                        onClick={() => onJump(note.pageId, note.sectionKey)}
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
