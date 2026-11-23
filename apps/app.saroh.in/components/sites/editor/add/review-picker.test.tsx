// @vitest-environment jsdom
// A review (round 3, EBReviewPicker): a product review, one written by
// hand, or Google as coming; into a new Testimonials section or one there.
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewPicker } from "./review-picker";

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

const REVIEWS = [
    {
        id: "r1",
        rating: 5,
        quote: "Boxes arrived the next morning.",
        name: "Meera",
        productName: "Kraft Mailer Box",
        createdAt: "2026-10-04T00:00:00Z",
    },
];
const button = (label: string) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === label,
    );
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
        const proto = Object.getPrototypeOf(el) as object;
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        await Promise.resolve();
    });
}

function render(props: Partial<Parameters<typeof ReviewPicker>[0]> = {}) {
    const onAdd = vi.fn();
    act(() =>
        root.render(
            <ReviewPicker
                reviews={REVIEWS}
                targets={[]}
                below={null}
                onBack={vi.fn()}
                onAdd={onAdd}
                {...props}
            />,
        ),
    );
    return onAdd;
}

describe("ReviewPicker", () => {
    it("adds a product review with the first name and the product", () => {
        const onAdd = render();
        expect(host.textContent).toContain("Meera · Kraft Mailer Box · ");
        act(() => button("Add to the page")?.click());
        expect(onAdd).toHaveBeenCalledWith(
            {
                quote: "Boxes arrived the next morning.",
                name: "Meera",
                role: "Kraft Mailer Box",
                rating: 5,
            },
            null,
        );
    });

    it("opens on Write one with no reviews, and needs their words and name", async () => {
        const onAdd = render({ reviews: [] });
        act(() => button("Add to the page")?.click());
        expect(onAdd).not.toHaveBeenCalled();
        expect(host.textContent).toContain("Write what they said.");
        const quote = host.querySelector("textarea");
        const who = host.querySelector("input");
        if (!quote || !who) throw new Error("No fields");
        await type(quote, "Sorted our packing room.");
        await type(who, "Kavya, Joshi Hardware");
        act(() => button("Add to the page")?.click());
        expect(onAdd).toHaveBeenCalledWith(
            {
                quote: "Sorted our packing room.",
                name: "Kavya, Joshi Hardware",
            },
            null,
        );
        expect(host.textContent).toContain("without a “verified” mark");
    });

    it("draws a product review's stars in its row", () => {
        render();
        expect(
            host.querySelector('[aria-label="5 of 5 stars"]'),
        ).not.toBeNull();
    });

    it("adds a written review with the stars set, and none when left empty", async () => {
        const onAdd = render({ reviews: [] });
        const quote = host.querySelector("textarea");
        const who = host.querySelector("input");
        if (!quote || !who) throw new Error("No fields");
        await type(quote, "Sorted our packing room.");
        await type(who, "Kavya");
        expect(host.textContent).toContain("Leave empty and no stars show.");
        const star = (n: number) =>
            host.querySelector<HTMLButtonElement>(
                `[role=radio][aria-label="${n} stars"]`,
            );
        await act(async () => {
            star(4)?.click();
            await Promise.resolve();
        });
        expect(host.textContent).toContain(
            "Shows 4 of 5 stars with the quote.",
        );
        act(() => button("Add to the page")?.click());
        expect(onAdd.mock.calls[0]?.[0]).toEqual({
            quote: "Sorted our packing room.",
            name: "Kavya",
            rating: 4,
        });
        // Clear puts it back to none.
        act(() => button("Clear")?.click());
        act(() => button("Add to the page")?.click());
        expect(onAdd.mock.calls[1]?.[0]).toEqual({
            quote: "Sorted our packing room.",
            name: "Kavya",
        });
    });

    it("asks which section when a Testimonials section is on the page", () => {
        const onAdd = render({
            targets: [{ index: 3, heading: "Kind words", full: false }],
        });
        const into = Array.from(
            host.querySelectorAll<HTMLButtonElement>("[role=radio]"),
        ).find((b) => b.textContent === "Add to Kind words");
        act(() => into?.click());
        act(() => button("Add to the page")?.click());
        expect(onAdd.mock.calls[0]?.[1]).toBe(3);
    });

    it("shows Google as coming, with nothing to add", () => {
        render();
        const google = Array.from(host.querySelectorAll("button")).find((b) =>
            b.textContent.startsWith("Google"),
        );
        act(() => google?.click());
        expect(host.textContent).toContain("Pick from your Google reviews");
        expect(button("Connect Google · coming")?.disabled).toBe(true);
        expect(button("Add to the page")).toBeUndefined();
    });
});
