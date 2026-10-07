// @vitest-environment jsdom
/**
 * "Ask for changes" says what needs changing (UX-043): the press opens a
 * field, nothing is recorded without a reason, and Approve still records on
 * the press.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reasonProblem, VerdictControls } from "./verdict-controls";

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

function button(name: string): HTMLButtonElement {
    const found = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!found) throw new Error(`no button ${name}`);
    return found;
}

function type(el: HTMLTextAreaElement, value: string) {
    Reflect.set(HTMLTextAreaElement.prototype, "value", value, el);
    el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Press and let the promise it starts settle. */
async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
}

describe("reasonProblem", () => {
    it("asks for a few words, and no more than the API keeps", () => {
        expect(reasonProblem("  ")).toBe("Say what needs changing.");
        expect(reasonProblem("ok")).toBe("Say what needs changing.");
        expect(reasonProblem("Fix the hours")).toBeNull();
        expect(reasonProblem("x".repeat(501))).toMatch(/under 500/);
    });
});

describe("VerdictControls (UX-043)", () => {
    it("records nothing until a reason is given, then sends it", async () => {
        const onRecord = vi.fn().mockResolvedValue(true);
        act(() =>
            root.render(
                <VerdictControls onRecord={onRecord} recording={false} />,
            ),
        );

        act(() => button("Ask for changes").click());
        expect(onRecord).not.toHaveBeenCalled();
        const field = container.querySelector("textarea");
        expect(field).not.toBeNull();

        await press(button("Ask for changes"));
        expect(onRecord).not.toHaveBeenCalled();
        expect(container.textContent).toContain("Say what needs changing.");

        if (!field) throw new Error("no field");
        act(() => type(field, "  Fix the hours  "));
        await press(button("Ask for changes"));
        expect(onRecord).toHaveBeenCalledWith(
            "CHANGES_REQUESTED",
            "Fix the hours",
        );
        // Recorded: the field closes.
        expect(container.querySelector("textarea")).toBeNull();
    });

    it("approves on the press", async () => {
        const onRecord = vi.fn().mockResolvedValue(true);
        act(() =>
            root.render(
                <VerdictControls onRecord={onRecord} recording={false} />,
            ),
        );
        await press(button("Approve"));
        expect(onRecord).toHaveBeenCalledWith("APPROVED");
    });
});
