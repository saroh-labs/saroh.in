import { describe, expect, it } from "vitest";

import type { EditorStatusInput } from "./editor-status";
import { editorStatus, PENDING_UNKNOWN } from "./editor-status";

const base: EditorStatusInput = {
    saving: false,
    saveError: false,
    heldBackSummary: null,
    dirty: false,
    review: {
        pending: false,
        outcome: null,
        approvalIsStale: false,
        openNotes: 0,
    },
    neverPublished: false,
    pending: null,
    pendingKnown: true,
};

const label = (over: Partial<EditorStatusInput>) =>
    editorStatus({ ...base, ...over }).label;

describe("the editor's status pill", () => {
    it("says Published when nothing is waiting", () => {
        expect(editorStatus(base)).toEqual({
            label: "Published",
            tone: "done",
        });
    });

    it("says what publishing would put live", () => {
        expect(label({ pending: "1 block" })).toBe("Not published · 1 block");
        expect(label({ pending: "2 blocks, footer" })).toBe(
            "Not published · 2 blocks, footer",
        );
    });

    it("says a site that was never published is not published yet", () => {
        expect(label({ neverPublished: true, pendingKnown: false })).toBe(
            "Not published yet",
        );
        expect(label({ neverPublished: true, pending: "1 block" })).toBe(
            "Not published yet",
        );
    });

    it("never says Published when the count of what's changed is missing", () => {
        expect(editorStatus({ ...base, pendingKnown: false })).toEqual({
            label: PENDING_UNKNOWN,
            tone: "attention",
        });
        expect(PENDING_UNKNOWN).toBe("Couldn't check what's changed");
    });

    it("puts work that is not safe before everything else", () => {
        const busy = {
            dirty: true,
            pending: "1 block",
            review: {
                pending: true,
                outcome: "REQUESTED" as const,
                approvalIsStale: false,
                openNotes: 0,
            },
        };
        expect(label({ ...busy, saving: true })).toBe("Saving…");
        expect(label({ ...busy, saveError: true })).toBe("Not saved");
        expect(label({ ...busy, heldBackSummary: "1 block unfinished" })).toBe(
            "1 block unfinished",
        );
        expect(label(busy)).toBe("Unsaved changes");
    });

    it("says In review while a review is waiting, whatever is saved", () => {
        expect(
            label({
                pending: "1 block",
                review: { ...base.review, pending: true, outcome: "REQUESTED" },
            }),
        ).toBe("In review");
    });

    it("says a reviewer asked for changes, and how many notes are left", () => {
        const changes = {
            ...base.review,
            outcome: "CHANGES_REQUESTED" as const,
        };
        expect(editorStatus({ ...base, review: changes })).toEqual({
            label: "Changes requested",
            tone: "danger",
        });
        expect(label({ review: { ...changes, openNotes: 2 } })).toBe(
            "2 to settle",
        );
    });

    it("claims an approval only while it still covers the draft", () => {
        const approved = {
            ...base.review,
            outcome: "APPROVED" as const,
        };
        expect(
            editorStatus({
                ...base,
                pending: "1 block",
                review: approved,
            }),
        ).toEqual({ label: "Approved", tone: "done" });
        expect(
            label({
                pending: "1 block",
                review: { ...approved, approvalIsStale: true },
            }),
        ).toBe("Not published · 1 block");
        // Published after the approval: nothing is waiting, so it is live.
        expect(label({ review: approved })).toBe("Published");
    });
});
