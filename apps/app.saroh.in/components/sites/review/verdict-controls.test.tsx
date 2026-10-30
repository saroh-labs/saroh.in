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

import {
    reasonProblem,
    TopBarVerdict,
    VerdictControls,
} from "./verdict-controls";

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

describe("TopBarVerdict, a Reviewer's verdict in the top bar (DEC-200, U4)", () => {
    const NOTES = [
        { id: "n1", where: "Home · Hero", body: "Say the Saturday cut-off." },
        { id: "n2", where: "Home · Hero", body: "Browse reads like a shop." },
    ];

    function draw(over: Partial<Parameters<typeof TopBarVerdict>[0]> = {}) {
        const onRecord = over.onRecord ?? vi.fn().mockResolvedValue(true);
        act(() =>
            root.render(
                <TopBarVerdict
                    owner="Asha Example"
                    openNotes={[]}
                    approved={false}
                    pagesRead={null}
                    recording={false}
                    {...over}
                    onRecord={onRecord}
                />,
            ),
        );
        return onRecord;
    }
    const anyButton = (name: string) => {
        const found = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent.trim() === name,
        );
        if (!found) throw new Error(`no button ${name}`);
        return found;
    };
    const order = () =>
        Array.from(container.querySelectorAll("button")).map((b) =>
            b.textContent.trim(),
        );
    const isPrimary = (name: string) =>
        anyButton(name).className.includes("bg-primary");

    it("with open notes of your own, Ask for changes leads; the order never moves", () => {
        draw({ openNotes: NOTES });
        expect(order()).toEqual(["Ask for changes", "Approve"]);
        expect(isPrimary("Ask for changes")).toBe(true);
        expect(isPrimary("Approve")).toBe(false);
    });

    it("with none, Approve leads and records on the press", async () => {
        const onRecord = draw();
        expect(order()).toEqual(["Ask for changes", "Approve"]);
        expect(isPrimary("Approve")).toBe(true);
        await press(anyButton("Approve"));
        expect(onRecord).toHaveBeenCalledWith("APPROVED");
    });

    it("asks the owner, lists your open notes, and needs a reason", async () => {
        const onRecord = draw({ openNotes: NOTES });
        act(() => anyButton("Ask for changes").click());
        const text = document.body.textContent;
        expect(text).toContain("Ask Asha Example for changes");
        expect(text).toContain("Your 2 open notes go with it:");
        expect(text).toContain("Browse reads like a shop.");
        expect(text).toContain(
            "Approving doesn’t publish. Asha Example decides when it goes live.",
        );

        await press(anyButton("Send to Asha Example"));
        expect(onRecord).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("Say what needs changing.");

        const field = document.querySelector("textarea");
        if (!field) throw new Error("no field");
        act(() => type(field, "x".repeat(501)));
        await press(anyButton("Send to Asha Example"));
        expect(onRecord).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain(
            "Keep it under 500 characters.",
        );

        act(() => type(field, " Mostly small wording. "));
        await press(anyButton("Send to Asha Example"));
        expect(onRecord).toHaveBeenCalledWith(
            "CHANGES_REQUESTED",
            "Mostly small wording.",
        );
    });

    it("keeps the reason when sending fails", async () => {
        const onRecord = vi.fn().mockResolvedValue(false);
        draw({ onRecord });
        act(() => anyButton("Ask for changes").click());
        const field = document.querySelector("textarea");
        if (!field) throw new Error("no field");
        act(() => type(field, "Fix the hours"));
        await press(anyButton("Send to Asha Example"));
        expect(onRecord).toHaveBeenCalled();
        expect(document.querySelector("textarea")?.value).toBe("Fix the hours");
    });

    it("after you approve, one button: Change your review", () => {
        draw({ approved: true });
        expect(order()).toEqual(["Change your review"]);
        act(() => anyButton("Change your review").click());
        expect(order()).toEqual(["Ask for changes", "Approve"]);
    });

    it("says how many pages you've read, and nothing when it isn't known", () => {
        draw({ pagesRead: { read: 3, total: 4 } });
        expect(container.textContent).toContain("You’ve read 3 of 4 pages");
        draw({ pagesRead: null });
        expect(container.querySelector("[data-pages-read]")).toBeNull();
    });
});
