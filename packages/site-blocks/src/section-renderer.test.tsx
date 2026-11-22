import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageSections } from "./section-renderer";

/** A section's `frame` (website editor plan KTD-E5) on its wrapper. */

const text = (extra: Record<string, unknown>) => ({
    type: "richText",
    content: { format: "html", value: "<p>Hello</p>", ...extra },
});

const wrappers = (sections: ReturnType<typeof text>[], look?: "quiet") =>
    Array.from(
        render(
            <PageSections sections={sections} look={look} />,
        ).container.querySelectorAll<HTMLElement>("[data-site-section]"),
    );

describe("a section's frame", () => {
    it("renders a section without one exactly as before", () => {
        const [plain] = wrappers([text({})]);
        expect(plain.getAttribute("class")).toBeNull();
        expect(plain.getAttribute("style")).toBeNull();
        expect(plain).not.toHaveAttribute("data-site-band");
    });

    it("hides on a phone with a class, so the page stays one document", () => {
        const [hidden] = wrappers([text({ frame: { hideOn: "phone" } })]);
        expect(hidden).toHaveClass("max-sm:hidden");
        // Still in the HTML: only the phone's CSS leaves it out.
        expect(hidden.textContent).toContain("Hello");
    });

    it.each([
        ["tint", "surface"],
        ["brand", "accent"],
        ["dark", "inverse"],
    ])("draws tone %s on the %s band", (tone, band) => {
        const [w] = wrappers([text({ frame: { tone } })]);
        expect(w).toHaveAttribute("data-site-band", band);
    });

    it("tone page puts a banded section back on the page's ground", () => {
        const [w] = wrappers([
            text({ band: "inverse", frame: { tone: "page" } }),
        ]);
        expect(w).not.toHaveAttribute("data-site-band");
    });

    it("scales the section padding its children read", () => {
        const [airy, standard] = wrappers([
            text({ frame: { spacing: "airy" } }),
            text({ frame: { spacing: "standard" } }),
        ]);
        expect(airy.style.getPropertyValue("--site-frame-padding")).toBe(
            "calc(var(--site-section-padding) * 1.25)",
        );
        expect(airy.className).toContain(
            "[&>*]:[--site-section-padding:var(--site-frame-padding)]",
        );
        // Classic's default is Standard: nothing to write.
        expect(standard.getAttribute("style")).toBeNull();
    });

    it("keeps a padding override beside a spacing", () => {
        const [w] = wrappers([
            text({ padding: 40, frame: { spacing: "compact" } }),
        ]);
        expect(w.style.getPropertyValue("--site-section-padding")).toBe("40px");
        expect(w.style.getPropertyValue("--site-frame-padding")).toBe(
            "calc(var(--site-section-padding) * 0.75)",
        );
    });
});
