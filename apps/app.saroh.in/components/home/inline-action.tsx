"use client";

import { Button } from "@saroh/ui/button";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import Link from "next/link";
import type { RefObject } from "react";
import { useEffect, useId, useRef } from "react";

import { formatNumber } from "@/lib/format/money";
import {
    replyLabel,
    replyMax,
    replyReady,
    writesReply,
} from "@/lib/home/inline-actions";
import type { HomeInline, HomeNeed, HomeRowLink } from "@/lib/home/service";

import { ShareLink } from "@saroh/ui/copy-button";
import type { DoneRow, InlineActions, InlineWhich } from "./use-inline-actions";

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
    "inline-flex h-[34px] flex-none cursor-pointer items-center rounded-lg border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground transition-[border-color,background-color] duration-fast hover:border-foreground hover:bg-accent active:bg-accent-active disabled:cursor-wait disabled:text-disabled-foreground coarse:min-h-11";

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

/**
 * The row's button: the design's quiet 34px outline; `quiet` is the
 * borderless one beside it (A7's Turn down beside Send payment link).
 */
export function InlineButton({
    inline,
    busy,
    onOpen,
    buttonRef,
    quiet = false,
}: {
    inline: HomeInline;
    busy: boolean;
    onOpen: () => void;
    buttonRef: RefObject<HTMLButtonElement | null>;
    quiet?: boolean;
}) {
    return (
        <Button
            variant={quiet ? "ghost" : "outline"}
            size="sm"
            ref={buttonRef}
            type="button"
            onClick={onOpen}
            disabled={busy}
            aria-haspopup="dialog"
            className="flex-none"
        >
            {inline.label}
        </Button>
    );
}

/**
 * What the row says once done, with Undo or the new link beside it:
 * "Marked sent 2:14 pm · Undo" (`HAInlineD`).
 */
export function InlineDone({ row }: { row: DoneRow }) {
    return (
        <span className="flex flex-wrap items-center gap-2.5 text-[12.5px] font-semibold text-success-subtle-foreground">
            <span role="status">
                {row.at ? `${row.text} ${row.at}` : row.text}
            </span>
            {row.undo ? (
                <Button
                    variant="link"
                    size="inline"
                    type="button"
                    onClick={row.undo}
                    className="cursor-pointer rounded text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast hover:decoration-foreground active:opacity-70"
                >
                    Undo
                </Button>
            ) : null}
            {row.link ? <CopyLink url={row.link} /> : null}
        </span>
    );
}

function CopyLink({ url }: { url: string }) {
    return (
        <ShareLink
            value={url}
            variant="link"
            icon={false}
            className="h-auto p-0"
        />
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
    which = "inline",
}: {
    need: HomeNeed;
    inline: HomeInline;
    actions: InlineActions;
    onClose: () => void;
    /** The row's own action, or the quiet one beside it. */
    which?: InlineWhich;
}) {
    const yesRef = useRef<HTMLButtonElement>(null);
    const boxRef = useRef<HTMLTextAreaElement>(null);
    const boxId = useId();
    const countId = useId();
    const isReply = writesReply(inline);
    const draft = actions.drafts[need.id] ?? "";
    const max = replyMax(inline);
    const off = isReply && !replyReady(draft, max);

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
                <div className="mt-2.5 grid gap-1.5">
                    {/* Named as the design names it, "Reply to Rohan"; a
                        screen reader hears what the reply is to. */}
                    <Label
                        htmlFor={boxId}
                        className="text-[13px] font-semibold text-foreground"
                    >
                        {inline.person
                            ? `Reply to ${inline.person}`
                            : replyLabel(need)}
                    </Label>
                    <Textarea
                        id={boxId}
                        ref={boxRef}
                        rows={3}
                        value={draft}
                        maxLength={max}
                        onChange={(e) =>
                            actions.setDraft(need.id, e.target.value)
                        }
                        aria-describedby={countId}
                        placeholder="Write your reply"
                        className="w-full resize-y"
                    />
                    <p
                        id={countId}
                        className="text-right text-xs tabular-nums text-muted-foreground"
                    >
                        {formatNumber(draft.length)} of {formatNumber(max)}
                    </p>
                </div>
            ) : null}
            <div
                role="alertdialog"
                aria-label={inline.confirm}
                className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-border-strong bg-muted px-3 py-2.5"
            >
                <span className="flex-[1_1_220px] text-pretty text-[13px] leading-[1.45] text-foreground">
                    {inline.confirm}
                </span>
                <Button
                    size="sm"
                    ref={yesRef}
                    type="button"
                    onClick={() => actions.confirm(need, which)}
                    disabled={off}
                >
                    {inline.yes}
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={close}
                >
                    Cancel
                </Button>
            </div>
        </div>
    );
}
