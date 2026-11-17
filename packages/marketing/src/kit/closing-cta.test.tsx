// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClosingNamesProvider } from "./closing-address";
import { ClosingCTA } from "./closing-cta";
import { TRADE_LOOKS } from "./trade-looks";

const NAMES = [
    { name: "Rye & Co.", slug: "rye-and-co", look: TRADE_LOOKS.bakery },
    { name: "Petal Lane", slug: "petal-lane", look: TRADE_LOOKS.florist },
];

const band = (visual?: React.ReactNode) => (
    <ClosingNamesProvider names={NAMES}>
        <ClosingCTA
            title="Your place is one name away."
            primary={<a href="/start">Start free</a>}
            visual={visual}
        />
    </ClosingNamesProvider>
);

const address = (c: HTMLElement) =>
    c.querySelector("[data-address]")?.textContent;

const motion = (reduce: boolean) =>
    vi.stubGlobal("matchMedia", () => ({ matches: reduce }));

beforeEach(() => motion(false));

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("ClosingCTA, the K band (#46)", () => {
    it("server-renders the title, the first address whole and the default note", () => {
        const html = renderToString(band());
        expect(html).toContain("Your place is one name away.");
        expect(html).toContain("data-closing");
        expect(html).toContain("rye-and-co</span>");
        expect(html).toContain(".saroh.app");
        expect(html).toContain("Free to start, no card.");
        // No caret before the script runs.
        expect(html).not.toContain("mk-caret");
    });

    it("draws each name as a pressed-or-not button, and a click jumps the address", () => {
        const { container } = render(band());
        const rye = screen.getByRole("button", { name: "Rye & Co." });
        const petal = screen.getByRole("button", { name: "Petal Lane" });
        expect(rye.getAttribute("aria-pressed")).toBe("true");
        expect(petal.getAttribute("aria-pressed")).toBe("false");
        fireEvent.click(petal);
        expect(address(container)).toBe("petal-lane.saroh.app");
        expect(petal.getAttribute("aria-pressed")).toBe("true");
        expect(
            screen.getByText(
                "petal-lane.saroh.app, one of the businesses on Saroh",
            ),
        ).toBeTruthy();
    });

    it("types: after the hold the address deletes letter by letter", () => {
        vi.useFakeTimers();
        const { container } = render(band());
        act(() => {
            vi.advanceTimersByTime(90 * 22);
        });
        expect(address(container)).not.toBe("rye-and-co.saroh.app");
        expect(container.innerHTML).toContain("mk-caret");
    });

    it("under reduced motion stays on the first address, with no caret", () => {
        vi.useFakeTimers();
        motion(true);
        const { container } = render(band());
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(address(container)).toBe("rye-and-co.saroh.app");
        expect(container.innerHTML).not.toContain("mk-caret");
    });

    it("a page's own visual replaces the address and chips", () => {
        const { container } = render(band(<p>Ask anything</p>));
        expect(container.textContent).toContain("Ask anything");
        expect(screen.queryByRole("button")).toBeNull();
        expect(address(container)).toBeUndefined();
    });
});
