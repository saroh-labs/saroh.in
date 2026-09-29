"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import Link from "next/link";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { REPLY_MAX, replyLabel, replyReady } from "@/lib/home/inline-actions";
import type { HomeInline, HomeNeed, HomeRowLink } from "@/lib/home/service";

import type { DoneRow, InlineActions } from "./use-inline-actions";

/**
 * A Needs-you row's inline action, as the Home design draws it (round 2,
 * F4): a quiet button beside the tag; pressing it opens the confirm in the
 * row, which says what will happen and who is told before anything does;
 * Reply opens its box above the confirm. Once done, the row says what
 * happened, and offers Undo while there is one.
 *
 * Nothing here decides what is offered or what it says: the API sent the
 * action (`HomeNeed.inline`) only to someone who may do it, with its words.
 */

const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** The row's quiet 34px outline, as a button or a link. */
const QUIET =
    "inline-flex h-[34px] flex-none cursor-pointer items-center rounded-lg border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground transition-[border-color,background-color,transform] duration-fast hover:border-foreground active:scale-[0.97] active:bg-muted disabled:cursor-wait disabled:opacity-60 coarse:min-h-11";

/**
 * A step the row opens where it is taken (D14's "Send a set-up link"): the
 * same quiet outline as the inline button, but a link, since the choice it
 * needs (the autopay method) lives on that screen.
 */
export function InlineLink({ link }: { link: HomeRowLink }) {
    return (
        <Link href={link.href} className={cn(QUIET, FOCUS)}>
            {link.label}
        </Link>
    );
}

/** The row's button: the design's quiet 34px outline. */
export function InlineButton({
    inline,
    busy,
    onOpen,
    buttonRef,
}: {
    inline: HomeInline;
    busy: boolean;
    onOpen: () => void;
    buttonRef: RefObject<HTMLButtonElement | null>;
}) {
    return (
        <button
            ref={buttonRef}
            type="button"
            onClick={onOpen}
            disabled={busy}
            aria-haspopup="dialog"
            className={cn(QUIET, FOCUS)}
        >
            {inline.label}
        </button>
    );
}

/** What the row says once done, with Undo or the new link beside it. */
export function InlineDone({ row }: { row: DoneRow }) {
    return (
        <span className="flex flex-wrap items-center gap-2.5 text-[12.5px] font-semibold text-success-subtle-foreground">
            <span role="status">{row.text}</span>
            {row.undo ? (
                <button
                    type="button"
                    onClick={row.undo}
                    className={cn(
                        "cursor-pointer rounded text-[12.5px] font-semibold text-brand-subtle-foreground underline underline-offset-2 transition-colors duration-fast hover:text-foreground active:opacity-70 coarse:min-h-11",
                        FOCUS,
                    )}
                >
                    Undo
                </button>
            ) : null}
            {row.link ? <CopyLink url={row.link} /> : null}
        </span>
    );
}

function CopyLink({ url }: { url: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            onClick={() => {
                void navigator.clipboard.writeText(url).then(
                    () => setCopied(true),
                    () =>
                        showError(
                            "Couldn't copy it. Open the subscription to copy the link by hand.",
                        ),
                );
            }}
            className={cn(
                "cursor-pointer rounded text-[12.5px] font-semibold text-brand-subtle-foreground underline underline-offset-2 transition-colors duration-fast hover:text-foreground active:opacity-70 coarse:min-h-11",
                FOCUS,
            )}
        >
            {copied ? "Copied" : "Copy link"}
        </button>
    );
}

/**
 * The confirm in the row (the design's `alertdialog`), and for Reply the
 * box above it. Focus moves into it when it opens — the box for a reply,
 * else the confirm's button — Escape closes it, and focus goes back to the
 * row's button.
 */
export function InlineConfirm({
    need,
    inline,
    actions,
    onClose,
}: {
    need: HomeNeed;
    inline: HomeInline;
    actions: InlineActions;
    onClose: () => void;
}) {
    const yesRef = useRef<HTMLButtonElement>(null);
    const boxRef = useRef<HTMLTextAreaElement>(null);
    const isReply = inline.kind === "REPLY";
    const draft = actions.drafts[need.id] ?? "";
    const off = isReply && !replyReady(draft);

    useEffect(() => {
        (isReply ? boxRef.current : yesRef.current)?.focus();
    }, [isReply]);

    const close = () => {
        actions.cancel();
        onClose();
    };

    return (
        <div
            onKeyDown={(e) => {
                if (e.key === "Escape") {
                    e.stopPropagation();
                    close();
                }
            }}
        >
            {isReply ? (
                <div className="mt-2.5 grid gap-2">
                    <textarea
                        ref={boxRef}
                        rows={2}
                        value={draft}
                        maxLength={REPLY_MAX}
                        onChange={(e) =>
                            actions.setDraft(need.id, e.target.value)
                        }
                        aria-label={replyLabel(need)}
                        placeholder="Write your reply"
                        className={cn(
                            "w-full resize-y rounded-[9px] border border-border bg-card px-[11px] py-[9px] text-[13.5px] leading-[1.45] text-foreground transition-colors duration-fast placeholder:text-muted-foreground hover:border-foreground/40",
                            FOCUS,
                        )}
                    />
                </div>
            ) : null}
            <div
                role="alertdialog"
                aria-label={inline.confirm}
                className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-highlight bg-brand-subtle px-3 py-2.5"
            >
                <span className="flex-[1_1_220px] text-pretty text-[13px] leading-[1.45] text-brand-subtle-foreground">
                    {inline.confirm}
                </span>
                <button
                    ref={yesRef}
                    type="button"
                    onClick={() => actions.confirm(need)}
                    disabled={off}
                    className={cn(
                        "h-[34px] cursor-pointer rounded-lg bg-foreground px-3.5 text-[12.5px] font-semibold text-background transition-[opacity,transform] duration-fast hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:hover:opacity-100 disabled:active:scale-100 coarse:min-h-11",
                        FOCUS,
                    )}
                >
                    {inline.yes}
                </button>
                <button
                    type="button"
                    onClick={close}
                    className={cn(
                        "h-[34px] cursor-pointer rounded-lg border border-border bg-card px-3 text-[12.5px] font-semibold text-neutral-700 transition-[border-color,background-color,transform] duration-fast hover:border-foreground active:scale-[0.97] active:bg-muted coarse:min-h-11 dark:text-neutral-300",
                        FOCUS,
                    )}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
