import type { HomeInline, HomeNeed } from "./service";

/**
 * Needs you's inline actions (round 2, F4): how each one runs, and what
 * the row and the toast say around it. The API decides whether a row
 * offers one and writes its confirm (`home-inline.ts`); this only runs it.
 * Pure, so the rules are tested without a screen.
 *
 * Three ways an action runs, all through the target's own write:
 *
 * - **held** (Send reminder, Reply): a message leaves, so nothing is called
 *   for ten seconds (`lib/hold-undo.ts`, default 51). Undo in that time
 *   means nothing was sent; after it the call is made and there is no Undo.
 * - **undo** (Mark sent): the stage moves at once; Undo is the stage's own
 *   Undo. When the step tells the customer, A14 holds that notice ten
 *   seconds too, so Undo is offered only for the hold; when nothing is
 *   sent, the row keeps its Undo for the stage's own window.
 * - **once** (Retry by pay link): made at once, and nothing to take back —
 *   a new link replaces the old one — so the confirm says so first.
 */
export type InlineRun = "held" | "undo" | "once";

export function runOf(inline: HomeInline): InlineRun {
    if (inline.kind === "MARK_SENT") return "undo";
    if (inline.kind === "RETRY" || !inline.sends) return "once";
    return "held";
}

/** After the hold, whether the row still offers Undo (only a quiet Mark sent). */
export function keepsUndo(inline: HomeInline): boolean {
    return inline.kind === "MARK_SENT" && !inline.sends && inline.undoable;
}

/** The longest reply the thread takes (A13's `MESSAGE_MAX`). */
export const REPLY_MAX = 2_000;

/** A reply can go once it says something, and not past the thread's limit. */
export function replyReady(draft: string): boolean {
    const text = draft.trim();
    return text.length > 0 && text.length <= REPLY_MAX;
}

/** What the row's reply box is called, for a screen reader. */
export function replyLabel(need: Pick<HomeNeed, "title">): string {
    return `Reply to ${need.title}`;
}

/**
 * The toast once Undo has run. A step whose notice had already gone says
 * so, rather than pretending it was pulled back (default 51).
 */
export function undoneText(inline: HomeInline, told: boolean): string {
    switch (inline.kind) {
        case "MARK_SENT":
            return told
                ? "Undone. They've already been told."
                : "Undone. The order is no longer marked sent.";
        case "SEND_REMINDER":
            return "Not sent. The reminder didn't go.";
        case "REPLY":
            return "Not sent. Your reply is still in the box.";
        case "RETRY":
            return "Undone.";
    }
}

/** The error's headline, and the line under it, when the write refuses. */
export function failedText(inline: HomeInline): string {
    switch (inline.kind) {
        case "MARK_SENT":
            return "The order wasn't marked sent.";
        case "RETRY":
            return "No new pay link was made.";
        case "SEND_REMINDER":
            return "The reminder wasn't sent.";
        case "REPLY":
            return "Your reply wasn't sent.";
    }
}

/**
 * How many things still need doing once some are done here: the heading's
 * count drops with each, as the design's does.
 */
export function openTotal(total: number, doneHere: number): number {
    return Math.max(0, total - doneHere);
}
