"use client";

import { formatDate, formatDateTime } from "@/lib/format/datetime";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Field } from "@saroh/ui/field";
import { submitOnModEnter } from "@saroh/ui/lib/keyboard-save";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Tip } from "@saroh/ui/tooltip";
import { useEffect, useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { runAction } from "@/lib/api/run-action";
import { initials } from "@/lib/names";
import {
    createComment,
    deleteComment,
    setCommentResolved,
    updateCommentBody,
} from "@/lib/sites/actions";
import type { SiteCommentView } from "@/lib/sites/service";

/** The API's bound on the words a note is pinned to (U17a). */
export const QUOTE_MAX = 500;

/**
 * The words selected in the post's writing surface (`[data-writing-surface]`),
 * one line, at most `QUOTE_MAX`; null for a selection anywhere else.
 */
export function selectedQuote(sel: Selection | null): string | null {
    if (!sel || sel.isCollapsed) return null;
    const node = sel.anchorNode;
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el?.closest("[data-writing-surface]")) return null;
    const text = sel.toString().replace(/\s+/g, " ").trim();
    return text ? text.slice(0, QUOTE_MAX) : null;
}

/**
 * The post editor's Feedback panel (DEC-200 U8): what reviewers said about
 * this post, beside it. A Reviewer adds notes and edits or deletes their own
 * open ones (`editable`, decided by the api: R13's approval lock); the
 * owner settles and reopens them. Settled notes are history, behind a
 * toggle, as the site editor's block feedback keeps them.
 *
 * Words selected in the post pin the next note to them (`quote`, U17,
 * `blogdesk/WXWReview`); a pinned note shows the words it is about.
 */
export function PostFeedback({
    siteId,
    postId,
    title,
    comments,
    canComment,
    canSettle,
    onChanged,
}: {
    siteId: string;
    postId: string;
    /** The post's title, for the add-a-note label. */
    title: string;
    /** This post's notes only. */
    comments: SiteCommentView[];
    /** `site:comment`: add a note. */
    canComment: boolean;
    /** `section:write`: settle and reopen. */
    canSettle: boolean;
    onChanged: () => void;
}) {
    const zone = useBusinessZone();
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string; body: string }>();
    const [showSettled, setShowSettled] = useState(false);
    const [quote, setQuote] = useState<string | null>(null);

    // Selecting words in the post pins the note being written to them;
    // a click elsewhere (the note's own box) keeps the pin.
    useEffect(() => {
        if (!canComment) return;
        const pick = () => {
            const words = selectedQuote(document.getSelection());
            if (words) setQuote(words);
        };
        document.addEventListener("selectionchange", pick);
        return () => document.removeEventListener("selectionchange", pick);
    }, [canComment]);

    const open = comments.filter((c) => c.resolvedAt === null);
    const settled = comments.filter((c) => c.resolvedAt !== null);

    /** One note's change, said back in a toast; the list reloads after. */
    async function change(
        id: string,
        run: () => Promise<{ ok: true } | { ok: false; error: string }>,
        done: string,
    ) {
        setBusy(id);
        const res = await runAction(run);
        setBusy(null);
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setEditing(undefined);
        showSuccess(done);
        onChanged();
    }

    async function send() {
        const body = draft.trim();
        if (!body) return;
        const res = await runAction(
            () =>
                createComment(siteId, {
                    postId,
                    body,
                    ...(quote ? { quote } : {}),
                }),
            { setBusy: setSending },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setDraft("");
        setQuote(null);
        showSuccess("Note added.");
        onChanged();
    }

    function note(c: SiteCommentView) {
        const isEditing = editing?.id === c.id;
        return (
            <li key={c.id} className="space-y-2 rounded-lg border p-3">
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
                    <span
                        className="ml-auto shrink-0 text-xs text-muted-foreground"
                        title={formatDateTime(c.createdAt, zone, {
                            year: "always",
                        })}
                    >
                        {formatDate(c.createdAt, zone)}
                    </span>
                </div>
                {c.quote ? (
                    <q className="block rounded-md bg-muted px-2 py-1.5 text-xs text-foreground/80 [quotes:none]">
                        {c.quote}
                    </q>
                ) : null}
                {isEditing ? (
                    <form
                        onKeyDown={submitOnModEnter}
                        className="grid gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void change(
                                c.id,
                                () =>
                                    updateCommentBody(
                                        siteId,
                                        c.id,
                                        editing.body.trim(),
                                    ),
                                "Note changed.",
                            );
                        }}
                    >
                        <Textarea
                            aria-label="Your note"
                            value={editing.body}
                            rows={3}
                            maxLength={2000}
                            onChange={(e) =>
                                setEditing({ id: c.id, body: e.target.value })
                            }
                        />
                        <div className="flex gap-2">
                            <Button
                                type="submit"
                                size="sm"
                                disabled={editing.body.trim() === ""}
                                busy={busy === c.id}
                                busyLabel="Saving…"
                            >
                                Save note
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditing(undefined)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                ) : (
                    <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed">
                        {c.body}
                    </p>
                )}
                {isEditing ? null : (
                    <div className="flex flex-wrap gap-1">
                        {c.editable ? (
                            <>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy === c.id}
                                    onClick={() =>
                                        setEditing({ id: c.id, body: c.body })
                                    }
                                >
                                    Edit
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    disabled={busy === c.id}
                                    onClick={() =>
                                        void change(
                                            c.id,
                                            () => deleteComment(siteId, c.id),
                                            "Note deleted.",
                                        )
                                    }
                                >
                                    Delete
                                </Button>
                            </>
                        ) : null}
                        {canSettle ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="ml-auto"
                                disabled={busy === c.id}
                                onClick={() =>
                                    void change(
                                        c.id,
                                        () =>
                                            setCommentResolved(
                                                siteId,
                                                c.id,
                                                c.resolvedAt === null,
                                            ),
                                        c.resolvedAt === null
                                            ? "Note marked settled."
                                            : "Note reopened.",
                                    )
                                }
                            >
                                {c.resolvedAt === null
                                    ? "Mark settled"
                                    : "Reopen"}
                            </Button>
                        ) : null}
                    </div>
                )}
            </li>
        );
    }

    return (
        <div className="space-y-4">
            {open.length === 0 ? (
                <EmptyState
                    size="inline"
                    title="Nothing said about this post yet."
                />
            ) : (
                <ul className="space-y-3">{open.map(note)}</ul>
            )}

            {settled.length > 0 ? (
                <div className="space-y-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        aria-expanded={showSettled}
                        onClick={() => setShowSettled((v) => !v)}
                    >
                        {showSettled ? "Hide" : "Show"}{" "}
                        {settled.length === 1
                            ? "1 settled note"
                            : `${settled.length} settled notes`}
                    </Button>
                    {showSettled ? (
                        <ul className="space-y-2 text-muted-foreground">
                            {settled.map(note)}
                        </ul>
                    ) : null}
                </div>
            ) : null}

            {canComment ? (
                <form
                    onKeyDown={submitOnModEnter}
                    className="grid gap-2 border-t pt-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void send();
                    }}
                >
                    <Field
                        label={`Add a note on ${title || "this post"}`}
                        holdsData
                    >
                        <Textarea
                            id="post-feedback-note"
                            value={draft}
                            rows={3}
                            maxLength={2000}
                            placeholder="What should change, and why?"
                            onChange={(e) => setDraft(e.target.value)}
                        />
                    </Field>
                    {quote ? (
                        <div
                            data-note-quote=""
                            className="flex items-start gap-2 rounded-md bg-muted px-2 py-1.5 text-xs text-foreground/80"
                        >
                            <q className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                                {quote}
                            </q>
                            <Button
                                type="button"
                                variant="link"
                                size="inline"
                                className="text-xs"
                                onClick={() => setQuote(null)}
                            >
                                Unpin
                            </Button>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Select words in the post to pin feedback to them.
                        </p>
                    )}
                    <div>
                        <Tip
                            label={
                                draft.trim() === ""
                                    ? "Write something first"
                                    : undefined
                            }
                        >
                            <Button
                                type="submit"
                                size="sm"
                                disabled={draft.trim() === ""}
                                busy={sending}
                                busyLabel="Sending…"
                            >
                                Add note
                            </Button>
                        </Tip>
                    </div>
                </form>
            ) : null}
        </div>
    );
}
