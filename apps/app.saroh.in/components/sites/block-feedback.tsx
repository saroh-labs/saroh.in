"use client";

import { Button } from "@saroh/ui/button";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { createComment, setCommentResolved } from "@/lib/sites/actions";
import { exactDate, shortDate } from "@/lib/sites/format-date";
import type { SiteCommentView } from "@/lib/sites/service";

/** A character that is a letter: letters change case, digits and punctuation do not. */
const isLetter = (ch: string) => ch.toUpperCase() !== ch.toLowerCase();

/**
 * Initials for a note's author: the first LETTER of the first two words that
 * have one — "Priya (reviewer)" is "PR", not "P(".
 */
export function initials(name: string): string {
    return (
        name
            .split(/\s+/)
            .map((word) => Array.from(word).find(isLetter))
            .filter((ch): ch is string => ch !== undefined)
            .slice(0, 2)
            .map((ch) => ch.toUpperCase())
            .join("") || "?"
    );
}

/**
 * The inspector's Feedback tab for ONE block (#339): what reviewers said
 * about the block that is selected, where it is being changed.
 *
 * Notes are pinned to the block by its key, not its position, so they stay
 * with it when blocks move around it. Settling a note takes its pin off the
 * canvas; a settled note is history, kept and counted but not shown as work.
 * Replying adds a note to the same block — the thread is the block.
 */
export function BlockFeedback({
    siteId,
    pageId,
    sectionKey,
    label,
    comments,
    onChanged,
}: {
    siteId: string;
    pageId: string;
    /** Absent for a block never saved: nothing can be pinned to it yet. */
    sectionKey: string | undefined;
    /** The block's name, for the empty state. */
    label: string;
    /** Every note on the site; this component picks the block's own. */
    comments: SiteCommentView[];
    onChanged: () => Promise<void>;
}) {
    const [reply, setReply] = useState("");
    const [sending, setSending] = useState(false);
    /** Notes with a settle/reopen in flight — one each, so one click never re-enables another's button. */
    const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
    const [showSettled, setShowSettled] = useState(false);

    const mine = comments.filter(
        (c) => c.pageId === pageId && c.sectionKey === sectionKey,
    );
    const open = mine.filter((c) => c.resolvedAt === null);
    const settledNotes = mine.filter((c) => c.resolvedAt !== null);

    /** Settle a note, or reopen a settled one. */
    async function setSettled(comment: SiteCommentView, settled: boolean) {
        setBusy((prev) => new Set(prev).add(comment.id));
        const res = await setCommentResolved(siteId, comment.id, settled);
        setBusy((prev) => {
            const next = new Set(prev);
            next.delete(comment.id);
            return next;
        });
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(settled ? "Marked settled." : "Reopened.");
        await onChanged();
    }

    async function send() {
        const body = reply.trim();
        if (!body || sectionKey === undefined) return;
        setSending(true);
        const res = await createComment(siteId, { pageId, sectionKey, body });
        setSending(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setReply("");
        showSuccess("Note added.");
        await onChanged();
    }

    if (sectionKey === undefined) {
        return (
            <p className="p-4 text-[0.8125rem] leading-relaxed text-muted-foreground">
                This block has not been saved yet, so there is nothing to pin a
                note to. It saves as soon as it is filled in.
            </p>
        );
    }

    return (
        <div className="space-y-4 p-4">
            <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                Pinned to this block, so it stays attached when the page moves
                around it.
            </p>

            {open.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-[0.8125rem] text-muted-foreground">
                    Nothing said about this {label.toLowerCase()} yet.
                </p>
            ) : (
                <ul className="space-y-3">
                    {open.map((c) => (
                        <li
                            key={c.id}
                            className="space-y-2 rounded-lg border p-3"
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    aria-hidden
                                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[0.6875rem] font-semibold"
                                >
                                    {initials(c.author.name)}
                                </span>
                                <span className="min-w-0 truncate text-[0.8125rem] font-semibold">
                                    {c.author.name}
                                </span>
                            </div>
                            <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed">
                                {c.body}
                            </p>
                            <p
                                className="text-xs text-muted-foreground"
                                title={exactDate(c.createdAt)}
                            >
                                {shortDate(c.createdAt)}
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy.has(c.id)}
                                onClick={() => void setSettled(c, true)}
                            >
                                Mark settled
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            {/*
             * Settled notes are history, not work — hidden until asked for,
             * and reopenable, as the site-wide review has always allowed.
             */}
            {settledNotes.length > 0 ? (
                <div className="space-y-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        aria-expanded={showSettled}
                        onClick={() => setShowSettled((v) => !v)}
                    >
                        {showSettled ? "Hide" : "Show"}{" "}
                        {settledNotes.length === 1
                            ? "1 settled note"
                            : `${settledNotes.length} settled notes`}
                    </Button>
                    {showSettled ? (
                        <ul className="space-y-2">
                            {settledNotes.map((c) => (
                                <li
                                    key={c.id}
                                    className="space-y-1.5 rounded-lg border border-dashed p-3 text-muted-foreground"
                                >
                                    <p className="text-xs font-medium">
                                        {c.author.name} ·{" "}
                                        <span title={exactDate(c.createdAt)}>
                                            {shortDate(c.createdAt)}
                                        </span>
                                    </p>
                                    <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed">
                                        {c.body}
                                    </p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={busy.has(c.id)}
                                        onClick={() =>
                                            void setSettled(c, false)
                                        }
                                    >
                                        Reopen
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            ) : null}

            <form
                className="grid gap-2 border-t pt-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                }}
            >
                <label
                    htmlFor="block-feedback-reply"
                    className="text-[0.8125rem] font-medium"
                >
                    {open.length === 0 ? "Add a note" : "Reply"}
                </label>
                <Textarea
                    id="block-feedback-reply"
                    value={reply}
                    rows={3}
                    maxLength={2000}
                    placeholder="What should change, and why?"
                    onChange={(e) => setReply(e.target.value)}
                />
                <div>
                    <Button
                        type="submit"
                        size="sm"
                        disabled={sending || reply.trim() === ""}
                        title={
                            reply.trim() === ""
                                ? "Write something first"
                                : undefined
                        }
                    >
                        {sending
                            ? "Sending…"
                            : open.length === 0
                              ? "Add note"
                              : "Reply"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
