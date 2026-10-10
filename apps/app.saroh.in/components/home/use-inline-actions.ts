"use client";

import type { ToastId } from "@saroh/ui/toast";
import {
    dismissToast,
    showError,
    showSuccess,
    showUndo,
    showWarning,
} from "@saroh/ui/toast";
import { useEffect, useRef, useState } from "react";

import { replyAction } from "@/lib/customer-workspace/actions";
import type { HoldSlot, HoldState } from "@/lib/hold-undo";
import { createHoldSlot, HOLD_UNDO_MS } from "@/lib/hold-undo";
import {
    failedText,
    keepsUndo,
    replyMax,
    replyReady,
    runOf,
    undoneText,
    writesReply,
} from "@/lib/home/inline-actions";
import type { HomeInline, HomeNeed } from "@/lib/home/service";
import { remindWithLink } from "@/lib/invoices/link-actions";
import { sendOutcome } from "@/lib/invoices/send";
import { moveStage, undoStage } from "@/lib/orders/actions";
import type { KitchenStage } from "@/lib/orders/read";
import { refundMismatch } from "@/lib/payments/actions";
import { replyToReview } from "@/lib/product-reviews/actions";
import { retrySubscription } from "@/lib/subscriptions/actions";

/** A row once its action has run here. */
export interface DoneRow {
    text: string;
    /** Undo, while it can still be undone. */
    undo?: () => void;
    /** Retry by pay link: the new link, to copy. */
    link?: string;
}

/**
 * Needs you's inline actions (round 2, F4): the one confirm open at a time,
 * the reply being written, and what each done row says.
 *
 * Every action calls its target's existing Server Action — the order's
 * stage move and its Undo, the subscription's retry, D17's reminder, A13's
 * reply — and the held ones go through `lib/hold-undo.ts`, one hold at a
 * time: starting another commits the last, and leaving Home sends what was
 * held, since the merchant didn't press Undo. How each runs is
 * `runOf` (`lib/home/inline-actions.ts`).
 *
 * A done row stays where it was, struck through, with what happened and its
 * Undo while there is one — as the design draws it — until Home is next
 * read.
 */
export function useInlineActions() {
    const [open, setOpen] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [done, setDoneMap] = useState<Record<string, DoneRow>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const slotRef = useRef<HoldSlot | null>(null);

    // Leaving Home: what was held without Undo goes, as asked.
    useEffect(() => () => void slotRef.current?.leave(), []);

    const setDone = (id: string, row: DoneRow | null) =>
        setDoneMap((all) => {
            const next = { ...all };
            if (row) next[id] = row;
            else delete next[id];
            return next;
        });

    const slot = () => (slotRef.current ??= createHoldSlot());

    /**
     * Hold something for ten seconds, with Undo on the toast and the row.
     * `commit` runs when the hold ends (held sends); `undo` takes back what
     * was already done (Mark sent). `settled` hears how it ended.
     */
    function hold(
        need: HomeNeed,
        inline: HomeInline,
        options: {
            commit?: () => Promise<void>;
            undo?: () => Promise<void>;
            settled: (state: HoldState) => void;
        },
    ) {
        let toastId: ToastId | null = null;
        const held = slot().start({
            commit: options.commit,
            undo: options.undo,
            onChange: (state) => {
                if (state.status === "held") return;
                if (state.status === "committing" || state.status === "undoing")
                    return;
                if (toastId !== null) dismissToast(toastId);
                options.settled(state);
            },
        });
        setDone(need.id, { text: inline.done, undo: () => void held.undo() });
        toastId = showUndo(inline.done, () => void held.undo(), {
            duration: HOLD_UNDO_MS,
        });
    }

    async function markSent(need: HomeNeed, inline: HomeInline) {
        setBusy(need.id);
        const res = await moveStage(inline.target, {
            to: inline.stage as KitchenStage,
        });
        setBusy(null);
        if (!res.ok) {
            showError(failedText(inline), res.error);
            return;
        }
        const eventId = res.data.eventId;
        let told = false;
        const takeBack = async () => {
            const back = await undoStage(inline.target, eventId);
            if (!back.ok) throw new Error(back.error);
            told = back.data.told ?? false;
        };
        hold(need, inline, {
            undo: takeBack,
            settled: (state) => {
                if (state.status === "undone") {
                    setDone(need.id, null);
                    showSuccess(undoneText(inline, told));
                } else if (state.status === "failed") {
                    showError(
                        "That couldn't be undone.",
                        errorOf(state) ?? "The order stays marked sent.",
                    );
                    setDone(need.id, { text: inline.done });
                } else if (keepsUndo(inline)) {
                    // Nothing was sent: the stage's own Undo stays on the
                    // row for its own window, which the API enforces.
                    setDone(need.id, {
                        text: inline.done,
                        undo: () => void undoQuietly(need, inline, takeBack),
                    });
                } else {
                    setDone(need.id, { text: inline.done });
                }
            },
        });
    }

    async function undoQuietly(
        need: HomeNeed,
        inline: HomeInline,
        takeBack: () => Promise<void>,
    ) {
        try {
            await takeBack();
            setDone(need.id, null);
            showSuccess(undoneText(inline, false));
        } catch (error) {
            showError(
                "That couldn't be undone.",
                error instanceof Error ? error.message : undefined,
            );
        }
    }

    function sendHeld(need: HomeNeed, inline: HomeInline) {
        const text = (drafts[need.id] ?? "").trim();
        let refused: string | null = null;
        let warning: string | null = null;
        let result = inline.done;
        hold(need, inline, {
            commit: async () => {
                if (inline.kind === "REVIEW_REPLY") {
                    const res = await replyToReview(inline.target, text);
                    if (!res.ok) {
                        refused = res.error;
                        throw new Error(res.error);
                    }
                    return;
                }
                if (inline.kind === "REPLY") {
                    const res = await replyAction(inline.target, text);
                    if (!res.ok) {
                        refused = res.error;
                        throw new Error(res.error);
                    }
                    return;
                }
                const res = await remindWithLink(inline.target);
                if (!res.ok) {
                    refused = res.error;
                    throw new Error(res.error);
                }
                // D17 says what really went: a customer who turned email
                // off isn't emailed, and Home says so.
                const outcome = sendOutcome(
                    res.data,
                    inline.person ?? "They",
                    true,
                );
                if (!outcome.ok) {
                    warning = outcome.message;
                    result = "Not emailed";
                }
            },
            settled: (state) => {
                if (state.status === "undone") {
                    setDone(need.id, null);
                    if (writesReply(inline)) setOpen(need.id);
                    showSuccess(undoneText(inline, false));
                } else if (state.status === "failed") {
                    setDone(need.id, null);
                    if (writesReply(inline)) setOpen(need.id);
                    showError(failedText(inline), refused ?? undefined);
                } else {
                    setDone(need.id, { text: result });
                    if (writesReply(inline)) {
                        setDrafts((all) => ({ ...all, [need.id]: "" }));
                    }
                    if (warning) showWarning(warning);
                }
            },
        });
    }

    async function retry(need: HomeNeed, inline: HomeInline) {
        setBusy(need.id);
        const res = await retrySubscription(
            inline.target,
            inline.via ?? "PAY_LINK",
        );
        setBusy(null);
        if (!res.ok) {
            showError(failedText(inline), res.error);
            return;
        }
        // By autopay (D13): no link to copy; their bank tells them first.
        if (!res.data.url) {
            const text = res.data.paid
                ? "Already paid by autopay"
                : inline.done;
            setDone(need.id, { text });
            showSuccess(
                text,
                res.data.paid
                    ? undefined
                    : "Their bank tells them a day ahead, so the payment lands in a day or two.",
            );
            return;
        }
        setDone(need.id, { text: inline.done, link: res.data.url });
        showSuccess(
            inline.done,
            "Copy it and send it yourself. Saroh doesn't send it.",
        );
    }

    /**
     * Refund a payment taken at the wrong amount (PAY-06): exactly what it
     * took goes back through the provider. The row leaves Home once the
     * refund is on its way; the order or invoice stays as it was.
     */
    async function refund(need: HomeNeed, inline: HomeInline) {
        setBusy(need.id);
        const res = await refundMismatch(inline.target);
        setBusy(null);
        if (!res.ok) {
            showError(failedText(inline), res.error);
            return;
        }
        setDone(need.id, { text: inline.done });
        showSuccess(
            inline.done,
            "Your payment provider sends it back. It can take a few days to reach them.",
        );
    }

    /** The confirm's button: run the row's action. */
    function confirm(need: HomeNeed) {
        const inline = need.inline;
        if (!inline) return;
        if (
            writesReply(inline) &&
            !replyReady(drafts[need.id] ?? "", replyMax(inline))
        )
            return;
        setOpen(null);
        switch (runOf(inline)) {
            case "undo":
                void markSent(need, inline);
                return;
            case "once":
                if (inline.kind === "REFUND") void refund(need, inline);
                else void retry(need, inline);
                return;
            case "held":
                sendHeld(need, inline);
        }
    }

    return {
        open,
        busy,
        done,
        drafts,
        openFor: (id: string) => setOpen(id),
        cancel: () => setOpen(null),
        setDraft: (id: string, text: string) =>
            setDrafts((all) => ({ ...all, [id]: text })),
        confirm,
    };
}

export type InlineActions = ReturnType<typeof useInlineActions>;

function errorOf(state: HoldState): string | null {
    if (state.status !== "failed") return null;
    return state.error instanceof Error ? state.error.message : null;
}
