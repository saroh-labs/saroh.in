import { describe, expect, it } from "vitest";

import {
    failedText,
    keepsUndo,
    openTotal,
    REPLY_MAX,
    replyLabel,
    replyMax,
    replyReady,
    REVIEW_REPLY_MAX,
    runOf,
    undoneText,
    writesReply,
} from "./inline-actions";
import type { HomeInline } from "./service";

/**
 * Home's inline actions (round 2, F4): how each runs, and what is said
 * around it. The API decides what is offered and its confirm; these are
 * the rules the row follows once pressed.
 */

function inline(over: Partial<HomeInline> = {}): HomeInline {
    return {
        kind: "SEND_REMINDER",
        label: "Send reminder",
        confirm: "This reminds Farah by email…",
        yes: "Send reminder",
        done: "Reminder sent to Farah",
        sends: true,
        undoable: true,
        target: "inv_1",
        person: "Farah",
        ...over,
    };
}

describe("runOf", () => {
    it("holds a message ten seconds before it goes: a reminder, a reply", () => {
        expect(runOf(inline())).toBe("held");
        expect(runOf(inline({ kind: "REPLY" }))).toBe("held");
    });

    it("moves the order at once and undoes it with the stage's own Undo", () => {
        expect(runOf(inline({ kind: "MARK_SENT", sends: true }))).toBe("undo");
        expect(runOf(inline({ kind: "MARK_SENT", sends: false }))).toBe("undo");
    });

    it("makes a new pay link at once, with nothing to take back", () => {
        expect(
            runOf(
                inline({
                    kind: "RETRY",
                    sends: false,
                    undoable: false,
                    via: "PAY_LINK",
                }),
            ),
        ).toBe("once");
    });
});

describe("keepsUndo", () => {
    it("keeps Undo on the row only for a Mark sent that told nobody", () => {
        expect(keepsUndo(inline({ kind: "MARK_SENT", sends: false }))).toBe(
            true,
        );
        // Once the customer's notice has gone, there is no silent Undo.
        expect(keepsUndo(inline({ kind: "MARK_SENT", sends: true }))).toBe(
            false,
        );
        expect(keepsUndo(inline())).toBe(false);
    });
});

describe("the reply box", () => {
    it("can't send nothing, or past the thread's limit", () => {
        expect(replyReady("")).toBe(false);
        expect(replyReady("   \n ")).toBe(false);
        expect(replyReady("On its way today.")).toBe(true);
        expect(replyReady("a".repeat(REPLY_MAX))).toBe(true);
        expect(replyReady("a".repeat(REPLY_MAX + 1))).toBe(false);
    });

    it("names the box after the row", () => {
        expect(replyLabel({ title: "Farah Khan is waiting for a reply" })).toBe(
            "Reply to Farah Khan is waiting for a reply",
        );
    });
});

describe("what is said after", () => {
    it("says a step's notice had already gone, rather than that it was pulled back", () => {
        expect(undoneText(inline({ kind: "MARK_SENT" }), true)).toBe(
            "Undone. They've already been told.",
        );
        expect(undoneText(inline({ kind: "MARK_SENT" }), false)).toBe(
            "Undone. The order is no longer marked sent.",
        );
    });

    it("says an undone reminder or reply never went", () => {
        expect(undoneText(inline(), false)).toBe(
            "Not sent. The reminder didn't go.",
        );
        expect(undoneText(inline({ kind: "REPLY" }), false)).toContain(
            "still in the box",
        );
    });

    it("names what failed, and the API's reason goes under it", () => {
        expect(failedText(inline())).toBe("The reminder wasn't sent.");
        expect(failedText(inline({ kind: "MARK_SENT" }))).toBe(
            "The order wasn't marked sent.",
        );
        expect(failedText(inline({ kind: "RETRY" }))).toBe(
            "No new pay link was made.",
        );
        // D13: a retry by autopay.
        expect(failedText(inline({ kind: "RETRY", via: "MANDATE" }))).toBe(
            "Autopay wasn't charged.",
        );
        expect(failedText(inline({ kind: "REPLY" }))).toBe(
            "Your reply wasn't sent.",
        );
    });

    it("drops the heading's count as rows are done, never below none", () => {
        expect(openTotal(4, 1)).toBe(3);
        expect(openTotal(1, 2)).toBe(0);
    });
});

describe("a reply to a low-star review (F2)", () => {
    const review = inline({
        kind: "REVIEW_REPLY",
        label: "Reply",
        yes: "Post reply",
        done: "Reply posted",
        target: "review_1",
        person: "Dev",
    });

    it("is written in the row, held ten seconds like any reply", () => {
        expect(writesReply(review)).toBe(true);
        expect(writesReply(inline({ kind: "REPLY" }))).toBe(true);
        expect(writesReply(inline())).toBe(false);
        expect(runOf(review)).toBe("held");
    });

    it("stops at the review API's limit, not the thread's", () => {
        expect(replyMax(review)).toBe(REVIEW_REPLY_MAX);
        expect(replyMax(inline({ kind: "REPLY" }))).toBe(REPLY_MAX);
        const long = "x".repeat(REVIEW_REPLY_MAX + 1);
        expect(replyReady(long, replyMax(review))).toBe(false);
        expect(replyReady(long, replyMax(inline({ kind: "REPLY" })))).toBe(
            true,
        );
    });

    it("says posted, not sent", () => {
        expect(undoneText(review, false)).toBe(
            "Not posted. Your reply is still in the box.",
        );
        expect(failedText(review)).toBe("Your reply wasn't posted.");
    });
});

describe("Refund on a payment taken at the wrong amount (PAY-06)", () => {
    const refund = inline({ kind: "REFUND", sends: false, undoable: false });

    it("is made at once, with nothing to take back", () => {
        expect(runOf(refund)).toBe("once");
        expect(keepsUndo(refund)).toBe(false);
    });

    it("says nothing went back when the refund is refused", () => {
        expect(failedText(refund)).toBe("Nothing was refunded.");
    });
});
