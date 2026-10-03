import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { modulePageTopOf } from "./module-page-top";
import { PageSections } from "./section-renderer";

/**
 * A module page's title and lead (DEC-073 #9): the design's Book, Prices and
 * Shop pages open with the page's title, and a rich-text intro lines up with
 * the cards under it rather than sitting in a narrow centred column.
 */

const intro = {
    type: "richText",
    content: { format: "html", value: "<p>Pick a service, then a time.</p>" },
};

describe("modulePageTopOf", () => {
    it("gives a module page its title, with no lead when it has none", () => {
        expect(modulePageTopOf({ kind: "BOOK", title: "Book" })).toEqual({
            title: "Book",
            lead: null,
        });
    });

    it("carries a lead when the page has one", () => {
        expect(
            modulePageTopOf({
                kind: "PRICES",
                title: " Prices ",
                lead: " Try one class. ",
            }),
        ).toEqual({ title: "Prices", lead: "Try one class." });
    });

    it("gives a free-form page, an old page or an untitled one no top", () => {
        expect(modulePageTopOf({ kind: "FREE", title: "About" })).toBeNull();
        expect(modulePageTopOf({ title: "About" })).toBeNull();
        expect(modulePageTopOf({ kind: "SHOP", title: "  " })).toBeNull();
        expect(modulePageTopOf({ kind: "SHOP", title: null })).toBeNull();
    });
});

describe("PageSections on a module page", () => {
    it("opens with the page's title as its heading", () => {
        render(
            <PageSections
                sections={[intro]}
                top={{ title: "Book", lead: null }}
            />,
        );
        const h1 = screen.getByRole("heading", { level: 1, name: "Book" });
        expect(h1.className).toContain("font-site-heading");
        // No lead of its own: only the intro's line follows.
        expect(screen.getAllByText(/Pick a service/)).toHaveLength(1);
    });

    it("draws a lead under the title when there is one", () => {
        render(
            <PageSections
                sections={[]}
                top={{ title: "Prices", lead: "Try one class, or join." }}
            />,
        );
        expect(screen.getByText("Try one class, or join.").tagName).toBe("P");
    });

    it("lines a rich-text intro up with the cards, close under the title", () => {
        const { container } = render(
            <PageSections sections={[intro, intro]} top={{ title: "Book" }} />,
        );
        const sections = container.querySelectorAll("section");
        expect(sections).toHaveLength(2);
        for (const section of Array.from(sections)) {
            // The cards' width and left edge (services, plans, packs).
            expect(section.className).toContain("max-w-screen-xl");
            expect(section.className).not.toContain("max-w-screen-md");
        }
        // Only the first starts close under the title.
        const wrappers = Array.from(sections).map((s) => s.parentElement);
        expect(wrappers[0]?.className).toContain("[&>*]:!pt-5");
        expect(wrappers[1]?.className ?? "").not.toContain("!pt-5");
    });

    it("keeps a free-form page's text in its centred reading column", () => {
        const { container } = render(<PageSections sections={[intro]} />);
        expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
        const section = container.querySelector("section");
        expect(section?.className).toContain("max-w-screen-md");
    });

    it("lines the intro up without a top, as the editor's canvas draws it", () => {
        const { container } = render(
            <PageSections sections={[intro]} modulePage />,
        );
        expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
        expect(container.querySelector("section")?.className).toContain(
            "max-w-screen-xl",
        );
    });
});
