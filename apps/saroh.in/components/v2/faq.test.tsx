// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Faq } from "./faq";

const items = [
    { q: "Can I start free?", a: "Yes." },
    { q: "Do you do GST?", a: "Yes." },
];

describe("Faq", () => {
    it("draws a chevron, not the browser's marker, that turns when open (D-9)", () => {
        const { container } = render(<Faq items={items} />);
        const details = container.querySelectorAll("details");
        expect(details).toHaveLength(2);
        const summary = details[0].querySelector("summary");
        expect(summary?.className).toContain("list-none");
        expect(summary?.className).toContain(
            "[&::-webkit-details-marker]:hidden",
        );
        const chevron = summary?.querySelector("[data-chevron]");
        expect(chevron?.getAttribute("aria-hidden")).toBe("true");
        // It turns with the <details> it sits in: `group-open:` keys off
        // the open attribute, which the browser toggles.
        expect(details[0].classList.contains("group")).toBe(true);
        expect(chevron?.getAttribute("class")).toContain(
            "group-open:rotate-180",
        );
        expect(details[0].open).toBe(false);
        details[0].open = true;
        expect(details[0].matches("[open]")).toBe(true);
        // The summary's accessible name is the question alone.
        expect(summary?.textContent).toBe("Can I start free?");
    });
});
