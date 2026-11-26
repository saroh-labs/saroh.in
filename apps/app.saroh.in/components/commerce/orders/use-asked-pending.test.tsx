// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DIM_AFTER_MS, useAskedPending } from "./use-asked-pending";

/**
 * Finding 22: the Orders rows drew greyed for a moment after the page
 * loaded. They dim only for a change the person asked for, and only once
 * it is slow.
 */
(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
const seen: { latest: ReturnType<typeof useAskedPending> | null } = {
    latest: null,
};

function Probe({
    pending,
    report,
}: {
    pending: boolean;
    report: (value: ReturnType<typeof useAskedPending>) => void;
}) {
    report(useAskedPending(pending));
    return null;
}

const show = (pending: boolean) => {
    act(() => {
        root.render(
            <Probe
                pending={pending}
                report={(value) => {
                    seen.latest = value;
                }}
            />,
        );
    });
};
const wait = (ms: number) => {
    act(() => {
        vi.advanceTimersByTime(ms);
    });
};
const latest = () => {
    if (!seen.latest) throw new Error("not rendered");
    return seen.latest;
};
const ask = () => {
    act(() => {
        latest().ask();
    });
};

describe("useAskedPending", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        root = createRoot(document.createElement("div"));
        show(false);
    });
    afterEach(() => {
        act(() => {
            root.unmount();
        });
        vi.useRealTimers();
    });

    it("never dims a read nobody asked for: a first load, a refresh", () => {
        show(true);
        wait(DIM_AFTER_MS * 3);
        expect(latest().dim).toBe(false);
    });

    it("dims an asked-for page only once it has been slow", () => {
        ask();
        show(true);
        expect(latest().dim).toBe(false);
        wait(DIM_AFTER_MS - 1);
        expect(latest().dim).toBe(false);
        wait(1);
        expect(latest().dim).toBe(true);
    });

    it("stops dimming once the page lands, and the ask is spent", () => {
        ask();
        show(true);
        wait(DIM_AFTER_MS);
        show(false);
        expect(latest().dim).toBe(false);
        // A later refresh nobody asked for stays undimmed.
        show(true);
        wait(DIM_AFTER_MS * 2);
        expect(latest().dim).toBe(false);
    });

    it("a quick page never dims at all", () => {
        ask();
        show(true);
        wait(DIM_AFTER_MS / 2);
        show(false);
        wait(DIM_AFTER_MS);
        expect(latest().dim).toBe(false);
    });
});
