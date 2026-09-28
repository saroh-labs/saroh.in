import { describe, expect, it } from "vitest";

import {
    failedText,
    keepsUndo,
    openTotal,
    REPLY_MAX,
    replyLabel,
    replyReady,
    runOf,
    undoneText,
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
        expect(failedText(inline({ kind: "REPLY" }))).toBe(
            "Your reply wasn't sent.",
        );
    });

    it("drops the heading's count as rows are done, never below none", () => {
        expect(openTotal(4, 1)).toBe(3);
        expect(openTotal(1, 2)).toBe(0);
    });
});
