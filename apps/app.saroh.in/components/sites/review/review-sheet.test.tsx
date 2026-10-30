// @vitest-environment jsdom
/**
 * A Reviewer's verdict on a phone (DEC-200, U5, RVD3Phone): one Send for
 * Approve or Ask for changes, Ask needs a reason, and after an approval
 * Change your review brings the choice back.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewState } from "@/lib/sites/service";
import { ReviewSheet } from "./review-sheet";

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

const REVIEW: ReviewState = {
    openNotes: 0,
    latestApproval: null,
    outstanding: true,
    pending: true,
    approvalIsStale: false,
};
const NOTE = { id: "n1", where: "Home · Hero", body: "Say the cut-off." };

function button(name: RegExp): HTMLElement {
    const found = Array.from(
        container.querySelectorAll<HTMLElement>("button"),
    ).find((b) => name.test(b.textContent.trim()));
    if (!found) throw new Error(`no button ${String(name)}`);
    return found;
}

/** A choice's radio, by the words on its row. */
function radio(name: RegExp): HTMLElement {
    const row = Array.from(container.querySelectorAll("label")).find((l) =>
        name.test(l.textContent.trim()),
    );
    const found = row?.querySelector<HTMLElement>("[role=radio]");
    if (!found) throw new Error(`no choice ${String(name)}`);
    return found;
}

async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await Promise.resolve();
        await Promise.resolve();
    });
}

function draw(overrides: Partial<Parameters<typeof ReviewSheet>[0]> = {}) {
    const props = {
        review: REVIEW,
        loadFailed: false,
        onRetry: vi.fn(),
        onSeeSettled: vi.fn(),
        owner: "Asha Example",
        openNotes: [],
        approved: false,
        pagesRead: { read: 2, total: 2 },
        recording: false,
        onRecord: vi.fn().mockResolvedValue(true),
        onDone: vi.fn(),
        ...overrides,
    };
    act(() => root.render(<ReviewSheet {...props} />));
    return props;
}

describe("ReviewSheet (U5)", () => {
    it("with no notes of your own, Approve is chosen and Send records it", async () => {
        const props = draw();
        expect(radio(/^Approve/).getAttribute("aria-checked")).toBe("true");
        expect(container.textContent).toContain(
            "You’ve read 2 of 2 pages · 0 open notes",
        );
        await press(button(/^Send to Asha Example$/));
        expect(props.onRecord).toHaveBeenCalledWith("APPROVED");
        expect(props.onDone).toHaveBeenCalled();
    });

    it("Ask for changes sends nothing until a reason is given", async () => {
        const props = draw({ openNotes: [NOTE] });
        expect(radio(/^Ask for changes/).getAttribute("aria-checked")).toBe(
            "true",
        );
        await press(button(/^Send to/));
        expect(props.onRecord).not.toHaveBeenCalled();
        expect(container.textContent).toContain("Say what needs changing.");
        const field = container.querySelector("textarea");
        if (!field) throw new Error("no reason field");
        act(() => {
            Reflect.set(
                HTMLTextAreaElement.prototype,
                "value",
                "  Fix the hours  ",
                field,
            );
            field.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await press(button(/^Send to/));
        expect(props.onRecord).toHaveBeenCalledWith(
            "CHANGES_REQUESTED",
            "Fix the hours",
        );
        expect(props.onDone).toHaveBeenCalled();
    });

    it("a failed send keeps the sheet and the reason", async () => {
        const props = draw({
            openNotes: [NOTE],
            onRecord: vi.fn().mockResolvedValue(false),
        });
        const field = container.querySelector("textarea");
        if (!field) throw new Error("no reason field");
        act(() => {
            Reflect.set(
                HTMLTextAreaElement.prototype,
                "value",
                "Fix the hours",
                field,
            );
            field.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await press(button(/^Send to/));
        expect(props.onDone).not.toHaveBeenCalled();
        expect(container.querySelector("textarea")?.value).toBe(
            "Fix the hours",
        );
    });

    it("after you approve: the approval, then Change your review", () => {
        draw({
            approved: true,
            review: {
                ...REVIEW,
                pending: false,
                yourVerdict: {
                    outcome: "APPROVED",
                    at: "2026-10-29T09:00:00.000Z",
                },
            },
        });
        expect(container.textContent).toContain("You approved this on");
        expect(container.textContent).not.toContain("Send to");
        act(() => button(/^Change your review$/).click());
        expect(container.textContent).toContain("Send to Asha Example");
    });
});
