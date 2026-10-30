// @vitest-environment jsdom
/**
 * Where a Reviewer's review stands, above their Feedback (DEC-200, U4, RVD4):
 * one message, the most useful first.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewState } from "@/lib/sites/service";
import { ReviewerStatus } from "./reviewer-status";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

const BASE: ReviewState = {
    openNotes: 0,
    latestApproval: null,
    outstanding: false,
    pending: false,
    approvalIsStale: false,
};
const ASKED = { by: "Asha Example", at: "2026-10-28T09:00:00.000Z" };

function draw(review: Partial<ReviewState>, loadFailed = false) {
    const onRetry = vi.fn();
    const onSeeSettled = vi.fn();
    act(() =>
        root.render(
            <ReviewerStatus
                review={{ ...BASE, ...review }}
                loadFailed={loadFailed}
                onRetry={onRetry}
                onSeeSettled={onSeeSettled}
            />,
        ),
    );
    return { onRetry, onSeeSettled, text: container.textContent };
}
const press = (name: string) =>
    act(() =>
        Array.from(container.querySelectorAll("button"))
            .find((b) => b.textContent.trim() === name)
            ?.click(),
    );

describe("ReviewerStatus (RVD4)", () => {
    it("nobody asked: says so, and that notes still reach the owner", () => {
        const { text } = draw({ request: null });
        expect(text).toContain("Nobody has asked for a review yet.");
        expect(text).toContain(
            "You can still read the draft and leave feedback, and the owner sees it in the editor.",
        );
    });

    it("names who asked and when", () => {
        const { text } = draw({ request: ASKED, pending: true });
        expect(text).toMatch(/Asha Example asked you to review · .*28 Oct/);
    });

    it("you approved: when, and that approving doesn't publish", () => {
        const { text } = draw({
            request: ASKED,
            yourVerdict: {
                outcome: "APPROVED",
                at: "2026-10-29T09:00:00.000Z",
            },
        });
        expect(text).toMatch(/You approved this on .*29 Oct/);
        expect(text).toContain(
            "Approving doesn’t publish. Asha Example decides when it goes live.",
        );
    });

    it("asked again after you approved: the request, not the approval", () => {
        const { text } = draw({
            request: ASKED,
            pending: true,
            yourVerdict: {
                outcome: "APPROVED",
                at: "2026-10-27T09:00:00.000Z",
            },
        });
        expect(text).toContain("asked you to review");
        expect(text).not.toContain("You approved");
    });

    it("your notes settled since you looked: how many, and See the notes", () => {
        const { text, onSeeSettled } = draw({
            request: ASKED,
            settledForYou: { count: 2, at: "2026-10-30T09:00:00.000Z" },
        });
        expect(text).toContain("Asha Example settled 2 of your notes");
        press("See the notes");
        expect(onSeeSettled).toHaveBeenCalled();
    });

    it("couldn't load: says nothing is lost, and tries again", () => {
        const { text, onRetry } = draw({ request: ASKED }, true);
        expect(text).toContain("Couldn't load the draft");
        expect(text).toContain("Nothing you wrote is lost.");
        press("Try again");
        expect(onRetry).toHaveBeenCalled();
    });
});
