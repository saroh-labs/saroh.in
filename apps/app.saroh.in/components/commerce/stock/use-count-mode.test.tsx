// @vitest-environment jsdom
/**
 * A stock count's Cancel: it leaves count mode unasked, and when numbers
 * had been typed its Undo puts every one back and returns to counting.
 */
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { countCancelled, useCountMode } from "./use-count-mode";

const toast = vi.hoisted(() => ({
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

let root: Root;
let host: HTMLDivElement;
let count: ReturnType<typeof useCountMode>;
const onBack = vi.fn();

/** Hands each render's hook out to the test, after it commits. */
function Harness({
    report,
}: {
    report: (c: ReturnType<typeof useCountMode>) => void;
}) {
    const c = useCountMode({ onBack });
    useEffect(() => {
        report(c);
    });
    return null;
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    toast.showUndo.mockReset();
    toast.dismissToasts.mockReset();
    onBack.mockReset();
    act(() =>
        root.render(
            <Harness
                report={(c) => {
                    count = c;
                }}
            />,
        ),
    );
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("useCountMode", () => {
    it("Cancel with nothing typed leaves count mode and offers no Undo", () => {
        act(() => count.start());
        expect(count.counting).toBe(true);
        act(() => count.cancel());
        expect(count.counting).toBe(false);
        expect(toast.showUndo).not.toHaveBeenCalled();
    });

    it("a box typed then emptied isn't typed work", () => {
        act(() => count.start());
        act(() => count.onValue("v1:s1", "4", 6));
        act(() => count.onValue("v1:s1", "", 6));
        expect(count.typed).toBe(0);
        act(() => count.cancel());
        expect(toast.showUndo).not.toHaveBeenCalled();
    });

    it("Cancel with numbers typed asks nothing and offers Undo", () => {
        act(() => count.start());
        act(() => count.onValue("v1:s1", "4", 6));
        act(() => count.onValue("v2:s1", "12", 12));
        expect(count.typed).toBe(2);
        act(() => count.cancel());

        expect(count.counting).toBe(false);
        expect(count.values).toEqual({});
        expect(toast.showUndo).toHaveBeenCalledTimes(1);
        expect(toast.showUndo.mock.calls[0]?.[0]).toBe(
            "Count cancelled. The 2 numbers you typed weren't saved.",
        );
        // No dialog stands between Cancel and leaving count mode.
        expect(document.querySelector("[role=alertdialog]")).toBeNull();
    });

    it("Undo restores every number and returns to count mode", () => {
        act(() => count.start());
        act(() => count.onValue("v1:s1", "4", 6));
        act(() => count.onValue("v2:s1", "12", 12));
        act(() => count.cancel());
        onBack.mockReset();

        const undo = toast.showUndo.mock.calls[0]?.[1] as () => void;
        act(() => undo());

        expect(count.counting).toBe(true);
        expect(count.values).toEqual({ "v1:s1": "4", "v2:s1": "12" });
        expect(count.logSays).toEqual({ "v1:s1": 6, "v2:s1": 12 });
        expect(count.typed).toBe(2);
        // Back on the levels, where the boxes are.
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it("starting a new count clears an older Undo, so it can't overwrite this one", () => {
        act(() => count.start());
        act(() => count.onValue("v1:s1", "4", 6));
        act(() => count.cancel());
        toast.dismissToasts.mockReset();
        act(() => count.start());
        expect(toast.dismissToasts).toHaveBeenCalledTimes(1);
        expect(count.values).toEqual({});
    });

    it("words one number and several", () => {
        expect(countCancelled(1)).toBe(
            "Count cancelled. The number you typed wasn't saved.",
        );
        expect(countCancelled(3)).toBe(
            "Count cancelled. The 3 numbers you typed weren't saved.",
        );
    });
});
