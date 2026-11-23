// @vitest-environment jsdom
// The optional stars (ERVReviewStars): one radio group, named stars, arrows
// move and pick, Clear only once set.
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StarRating } from "./star-rating";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const stars = () =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("[role=radio]"));

describe("StarRating", () => {
    it("is one labelled group of five named radios, with no Clear while empty", () => {
        act(() => root.render(<StarRating value={null} onChange={vi.fn()} />));
        expect(
            host.querySelector("[role=radiogroup]")?.getAttribute("aria-label"),
        ).toBe("Stars (optional)");
        expect(stars().map((s) => s.getAttribute("aria-label"))).toEqual([
            "1 star",
            "2 stars",
            "3 stars",
            "4 stars",
            "5 stars",
        ]);
        expect(
            stars().every((s) => s.getAttribute("aria-checked") === "false"),
        ).toBe(true);
        expect(host.textContent).toContain("Leave empty and no stars show.");
        expect(host.textContent).not.toContain("Clear");
    });

    it("picks a star on a click and says what shows", () => {
        const onChange = vi.fn();
        act(() => root.render(<StarRating value={null} onChange={onChange} />));
        act(() => stars()[2]?.click());
        expect(onChange).toHaveBeenCalledWith(3);
    });

    it("keeps one Tab stop and moves with the arrow keys", () => {
        const onChange = vi.fn();
        act(() => root.render(<StarRating value={2} onChange={onChange} />));
        // Roving focus: the group is the one Tab stop; the arrows go inside.
        expect(
            host.querySelector<HTMLElement>("[role=radiogroup]")?.tabIndex,
        ).toBe(0);
        act(() => {
            stars()[1]?.focus();
            stars()[1]?.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowRight",
                    bubbles: true,
                }),
            );
        });
        // The arrow moves AND picks (WAI-ARIA), at once.
        expect(onChange).toHaveBeenCalledWith(3);
        expect(document.activeElement).toBe(stars()[2]);
    });

    it("wraps the arrows and goes back with ArrowLeft", () => {
        const onChange = vi.fn();
        act(() => root.render(<StarRating value={1} onChange={onChange} />));
        act(() => {
            stars()[0]?.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowLeft",
                    bubbles: true,
                }),
            );
        });
        expect(onChange).toHaveBeenCalledWith(5);
    });

    it("shows Clear once set, and clears to none", () => {
        const onChange = vi.fn();
        act(() => root.render(<StarRating value={4} onChange={onChange} />));
        expect(host.textContent).toContain(
            "Shows 4 of 5 stars with the quote.",
        );
        const clear = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Clear",
        );
        act(() => clear?.click());
        expect(onChange).toHaveBeenCalledWith(null);
    });
});
