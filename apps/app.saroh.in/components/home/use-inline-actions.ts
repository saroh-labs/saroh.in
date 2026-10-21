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

import { makePayLink } from "@/components/bookings/pay-link-panel";
import { runAction } from "@/lib/api/run-action";
import { replyAction } from "@/lib/customer-workspace/actions";
import { formatTime, viewerTimeZone } from "@/lib/format/datetime";
import type { HoldSlot, HoldState } from "@/lib/hold-undo";
import { createHoldSlot, HOLD_UNDO_MS } from "@/lib/hold-undo";
import {
    failedText,
    heldText,
    keepsUndo,
    replyMax,
    replyReady,
    runOf,
    undoneText,
    writesReply,
} from "@/lib/home/inline-actions";
import type { RemindAllPick, RemindAllState } from "@/lib/home/remind-all";
import {
    fromResult,
    heldToast,
    REMIND_ALL_KEY,
    resultWords,
} from "@/lib/home/remind-all";
import type { HomeInline, HomeNeed } from "@/lib/home/service";
import { sendReminders } from "@/lib/invoices/actions";
import { remindWithLink } from "@/lib/invoices/link-actions";
import { forgetLink } from "@/lib/invoices/minted-links";
import { sendOutcome } from "@/lib/invoices/send";
import { moveStage, undoStage } from "@/lib/orders/actions";
import type { KitchenStage } from "@/lib/orders/read";
import { refundMismatch } from "@/lib/payments/actions";
import { replyToReview } from "@/lib/product-reviews/actions";
import { turnDownBooking } from "@/lib/services/actions";
import { cancelledMessage } from "@/lib/services/booking-money";
import { retrySubscription } from "@/lib/subscriptions/actions";

/** A row once its action has run here. */
export interface DoneRow {
    text: string;
    /** Undo, while it can still be undone. */
    undo?: () => void;
    /** Retry by payment link, Send payment link: the new link, to copy. */
    link?: string;
    /** When it was done here, "2:14 pm": "Marked sent 2:14 pm". */
    at?: string;
    /** Remind all on the bills group (U8): waiting, or sent. */
    remind?: RemindAllState;
}

/** The row once Turn down found the customer had paid (review #11). */
export const JUST_PAID_ROW = "They just paid";

/** Which of a row's actions: its own, or the quiet one beside it (A7). */
export type InlineWhich = "inline" | "second";

/**
 * The key a row's open confirm is kept under: the row's id for its own
 * action, and the id with `#second` for the quiet one beside it, so only
 * one confirm is ever open on Home.
 */
export function confirmKey(id: string, which: InlineWhich = "inline"): string {
    return which === "second" ? `${id}#second` : id;
}

/** The row's action of that kind. */
export function inlineOf(
    need: HomeNeed,
    which: InlineWhich = "inline",
): HomeInline | undefined {
    return which === "second" ? need.second : need.inline;
}

/** "2:14 pm", now, on the viewer's clock. */
function nowWords(): string {
    try {
        return formatTime(new Date(), viewerTimeZone());
    } catch {
        return "";
    }
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
            /** What the row and the toast say while it waits. */
            text?: string;
            at?: string;
        },
    ) {
        const text = options.text ?? inline.done;
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
        setDone(need.id, {
            text,
            undo: () => void held.undo(),
            ...(options.at ? { at: options.at } : {}),
        });
        toastId = showUndo(text, () => void held.undo(), {
            duration: HOLD_UNDO_MS,
        });
    }

    async function markSent(need: HomeNeed, inline: HomeInline) {
        const res = await runAction(
            () =>
                moveStage(inline.target, {
                    to: inline.stage as KitchenStage,
                }),
            { setBusy: (on) => setBusy(on ? need.id : null) },
        );
        if (!res) return;
        if (!res.ok) {
            showError(failedText(inline), res.error);
            return;
        }
        const eventId = res.data.eventId;
        const at = nowWords();
        let told = false;
        const takeBack = async () => {
            const back = await undoStage(inline.target, eventId);
            if (!back.ok) throw new Error(back.error);
            told = back.data.told ?? false;
        };
        hold(need, inline, {
            undo: takeBack,
            at,
            settled: (state) => {
                if (state.status === "undone") {
                    setDone(need.id, null);
                    showSuccess(undoneText(inline, told));
                } else if (state.status === "failed") {
                    showError(
                        "That couldn't be undone.",
                        errorOf(state) ?? "The order stays marked sent.",
                    );
                    setDone(need.id, { text: inline.done, at });
                } else if (keepsUndo(inline)) {
                    // Nothing was sent: the stage's own Undo stays on the
                    // row for its own window, which the API enforces.
                    setDone(need.id, {
                        text: inline.done,
                        at,
                        undo: () => void undoQuietly(need, inline, takeBack),
                    });
                } else {
                    setDone(need.id, { text: inline.done, at });
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
        } catch {
            showError("That couldn't be undone.", "Try again.");
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

    /**
     * Turn down a booking awaiting payment (A7): held ten seconds with Undo,
     * then the booking's own cancel (`DELETE bookings/:id?ifUnpaid=true`),
     * which tells the customer where the API says it does. Undo in the ten
     * seconds leaves the booking exactly as it was. When the customer paid
     * in those ten seconds the API refuses (review #11), the booking
     * stands, and the row says "They just paid".
     */
    function turnDown(need: HomeNeed, inline: HomeInline) {
        let refused: string | null = null;
        let said = false;
        let paid = false;
        let result = inline.done;
        hold(need, inline, {
            text: heldText(inline),
            commit: async () => {
                const res = await turnDownBooking(inline.target);
                if (!res.ok && "paid" in res) {
                    // Not a failure: they paid, and the booking stands.
                    result = JUST_PAID_ROW;
                    paid = true;
                    return;
                }
                if (!res.ok) {
                    refused = res.error;
                    throw new Error(res.error);
                }
                const message = cancelledMessage(res.data.money);
                if (message.tone === "error") {
                    // Cancelled, but its money needs a hand: said as the
                    // booking's own cancel says it.
                    showError(message.title, message.body);
                    said = true;
                }
                result = inline.done;
            },
            settled: (state) => {
                if (state.status === "undone") {
                    setDone(need.id, null);
                    showSuccess(undoneText(inline, false));
                } else if (state.status === "failed") {
                    setDone(need.id, null);
                    showError(failedText(inline), refused ?? undefined);
                } else {
                    setDone(need.id, { text: result });
                    if (paid) showSuccess(result, "The booking stands.");
                    else if (!said) showSuccess(result);
                }
            },
        });
    }

    /**
     * Send payment link on a booking awaiting payment (DEC-171): held ten
     * seconds, since the new link stops the one sent before; then the
     * booking's own pay link (`POST bookings/:id/pay-link`), handed back to
     * copy. Saroh doesn't send it.
     */
    function payLink(need: HomeNeed, inline: HomeInline) {
        let refused: string | null = null;
        let url: string | null = null;
        hold(need, inline, {
            text: heldText(inline),
            commit: async () => {
                const res = await makePayLink(inline.target);
                if (!res.ok) {
                    // The plan's own notice has already been shown.
                    refused = res.plan ? null : res.error;
                    throw new Error(res.error);
                }
                url = res.url;
            },
            settled: (state) => {
                if (state.status === "undone") {
                    setDone(need.id, null);
                    showSuccess(undoneText(inline, false));
                } else if (state.status === "failed") {
                    setDone(need.id, null);
                    if (refused !== null)
                        showError(failedText(inline), refused || undefined);
                } else {
                    setDone(need.id, {
                        text: inline.done,
                        ...(url ? { link: url } : {}),
                    });
                    showSuccess(
                        inline.done,
                        "Copy it and send it yourself. Saroh doesn't send it.",
                    );
                }
            },
        });
    }

    async function retry(need: HomeNeed, inline: HomeInline) {
        const res = await runAction(
            () => retrySubscription(inline.target, inline.via ?? "PAY_LINK"),
            { setBusy: (on) => setBusy(on ? need.id : null) },
        );
        if (!res) return;
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
        const res = await runAction(() => refundMismatch(inline.target), {
            setBusy: (on) => setBusy(on ? need.id : null),
        });
        if (!res) return;
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

    /**
     * Remind all on the bills group (DEC-171, U8): held ten seconds with
     * Undo, on the same one slot as every other held action, then one call
     * sends them (`POST invoices/reminders`, U5), which reads each bill again:
     * one reminded elsewhere meanwhile, or paid, is skipped and named. Undo
     * in the ten seconds sends nothing; leaving Home sends them, as asked.
     */
    function remindAll(pick: RemindAllPick) {
        let refused: string | null = null;
        let toastId: ToastId | null = null;
        const text = heldToast(pick.invoiceIds.length, pick.skipped);
        const remind: RemindAllState = {
            phase: "held",
            people: pick.people,
            skipped: pick.skipped,
            reasons: pick.reasons,
        };
        const held = slot().start({
            commit: async () => {
                const res = await sendReminders({
                    invoiceIds: pick.invoiceIds,
                    ...(pick.quietDays ? { quietDays: pick.quietDays } : {}),
                });
                if (!res.ok) {
                    refused = res.error;
                    throw new Error(res.error);
                }
                const result = fromResult(res.data);
                // A reminder mints a fresh link: the one this tab kept is gone.
                for (const s of result.sent) forgetLink(s.invoiceId);
                const said = resultWords(result);
                setDone(REMIND_ALL_KEY, {
                    text: said.title,
                    remind: {
                        ...remind,
                        phase: "sent",
                        sent: result.sent.length,
                    },
                });
                showSuccess(said.title, said.body);
            },
            onChange: (state) => {
                if (state.status === "held") return;
                if (state.status === "committing" || state.status === "undoing")
                    return;
                if (toastId !== null) dismissToast(toastId);
                if (state.status === "undone") {
                    setDone(REMIND_ALL_KEY, null);
                    showSuccess("Nothing was sent.");
                } else if (state.status === "failed") {
                    setDone(REMIND_ALL_KEY, null);
                    showError(
                        "Those reminders weren't sent.",
                        refused ?? "Try again.",
                    );
                }
            },
        });
        setDone(REMIND_ALL_KEY, {
            text,
            undo: () => void held.undo(),
            remind,
        });
        toastId = showUndo(text, () => void held.undo(), {
            duration: HOLD_UNDO_MS,
        });
    }

    /** The confirm's button: run the row's action, or the one beside it. */
    function confirm(need: HomeNeed, which: InlineWhich = "inline") {
        const inline = inlineOf(need, which);
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
                if (inline.kind === "TURN_DOWN") turnDown(need, inline);
                else if (inline.kind === "SEND_PAY_LINK") payLink(need, inline);
                else sendHeld(need, inline);
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
        remindAll,
    };
}

export type InlineActions = ReturnType<typeof useInlineActions>;

function errorOf(state: HoldState): string | null {
    if (state.status !== "failed") return null;
    return state.error instanceof Error ? state.error.message : null;
}
