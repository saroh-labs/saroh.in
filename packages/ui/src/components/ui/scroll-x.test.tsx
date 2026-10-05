import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    edgeMask,
    overflowEdges,
    resetScrollHintForTests,
    SCROLL_HINT_KEY,
    ScrollX,
} from "./scroll-x";

/**
 * The signifier for content wider than its box (Phone Tables audit T9): a
 * fade on the side with more, a once-per-browser hint, and a focus stop —
 * each only while the content really overflows.
 */
describe("overflowEdges", () => {
    it("says nothing when the content fits", () => {
        expect(
            overflowEdges({
                scrollLeft: 0,
                scrollWidth: 300,
                clientWidth: 300,
            }),
        ).toEqual({ left: false, right: false });
    });

    it("marks the right edge at the start, both in the middle, the left at the end", () => {
        const at = (scrollLeft: number) =>
            overflowEdges({ scrollLeft, scrollWidth: 600, clientWidth: 300 });
        expect(at(0)).toEqual({ left: false, right: true });
        expect(at(150)).toEqual({ left: true, right: true });
        expect(at(300)).toEqual({ left: true, right: false });
    });

    it("reads a right-to-left scroller by distance travelled", () => {
        expect(
            overflowEdges({
                scrollLeft: -300,
                scrollWidth: 600,
                clientWidth: 300,
            }),
        ).toEqual({ left: true, right: false });
    });
});

describe("edgeMask", () => {
    it("is absent when nothing hides", () => {
        expect(edgeMask({ left: false, right: false })).toBeUndefined();
    });

    it("fades only the side with more", () => {
        const mask = edgeMask({ left: false, right: true });
        expect(mask).toMatch(/^linear-gradient\(to right, #000,/);
        expect(mask).toMatch(/transparent\)$/);
    });
});

/** jsdom lays nothing out, so the observer and the widths are stand-ins. */
let observed: (() => void)[] = [];
function sizes(scrollWidth: number, clientWidth: number) {
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(
        scrollWidth,
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
        clientWidth,
    );
}

describe("ScrollX", () => {
    beforeEach(() => {
        observed = [];
        window.localStorage.clear();
        resetScrollHintForTests();
        vi.stubGlobal(
            "ResizeObserver",
            class {
                cb: () => void;
                constructor(cb: () => void) {
                    this.cb = cb;
                    observed.push(cb);
                }
                observe() {
                    this.cb();
                }
                disconnect() {
                    observed.length = 0;
                }
            },
        );
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("is a plain labelled region when the content fits", () => {
        sizes(300, 300);
        render(
            <ScrollX label="Audit events">
                <table />
            </ScrollX>,
        );
        const region = screen.getByRole("region", { name: "Audit events" });
        expect(region).toHaveAttribute("data-scroll-x");
        expect(region).not.toHaveAttribute("tabindex");
        expect(region.style.maskImage).toBe("");
        expect(screen.queryByText(/for more/)).toBeNull();
    });

    it("fades, takes focus and hints once when it overflows", () => {
        sizes(900, 300);
        const { unmount } = render(
            <ScrollX label="Audit events">
                <table />
            </ScrollX>,
        );
        const region = screen.getByRole("region", { name: "Audit events" });
        expect(region).toHaveAttribute("tabindex", "0");
        expect(region.style.maskImage).toContain("transparent");
        expect(screen.getByText(/for more/)).toBeInTheDocument();
        expect(window.localStorage.getItem(SCROLL_HINT_KEY)).toBe("1");
        unmount();

        // The next one, in this browser, keeps the fade and drops the words.
        resetScrollHintForTests();
        render(
            <ScrollX label="Audit events">
                <table />
            </ScrollX>,
        );
        expect(
            screen.getByRole("region", { name: "Audit events" }),
        ).toHaveAttribute("tabindex", "0");
        expect(screen.queryByText(/for more/)).toBeNull();
    });

    it("drops the hint at the first scroll", () => {
        sizes(900, 300);
        render(
            <ScrollX label="Audit events">
                <table />
            </ScrollX>,
        );
        const region = screen.getByRole("region", { name: "Audit events" });
        expect(screen.getByText(/for more/)).toBeInTheDocument();
        act(() => {
            region.scrollLeft = 40;
            region.dispatchEvent(new Event("scroll"));
        });
        expect(screen.queryByText(/for more/)).toBeNull();
    });
});
