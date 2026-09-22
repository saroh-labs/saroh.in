import { describe, expect, it } from "vitest";

import type { EditorStatusInput } from "./editor-status";
import { editorStatus } from "./editor-status";

const base: EditorStatusInput = {
    saving: false,
    saveError: false,
    heldBackSummary: null,
    dirty: false,
    review: { pending: false, outcome: null, approvalIsStale: false },
    neverPublished: false,
    hasPendingChanges: false,
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

    it("says what publishing would change is saved but not live", () => {
        expect(label({ hasPendingChanges: true })).toBe("Saved, not published");
        expect(label({ neverPublished: true })).toBe("Not published yet");
    });

    it("puts work that is not safe before everything else", () => {
        const busy = {
            dirty: true,
            hasPendingChanges: true,
            review: {
                pending: true,
                outcome: "REQUESTED" as const,
                approvalIsStale: false,
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
                hasPendingChanges: true,
                review: {
                    pending: true,
                    outcome: "REQUESTED",
                    approvalIsStale: false,
                },
            }),
        ).toBe("In review");
    });

    it("says a reviewer asked for changes", () => {
        expect(
            label({
                hasPendingChanges: true,
                review: {
                    pending: false,
                    outcome: "CHANGES_REQUESTED",
                    approvalIsStale: false,
                },
            }),
        ).toBe("Changes asked for");
    });

    it("claims an approval only while it still covers the draft", () => {
        const approved = { pending: false, outcome: "APPROVED" as const };
        expect(
            label({
                hasPendingChanges: true,
                review: { ...approved, approvalIsStale: false },
            }),
        ).toBe("Approved, not published");
        expect(
            label({
                hasPendingChanges: true,
                review: { ...approved, approvalIsStale: true },
            }),
        ).toBe("Saved, not published");
    });
});
