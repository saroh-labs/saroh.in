import { toRendered } from "@saroh/block-contract";
import type { TemplateContext } from "@saroh/templates";
import { ceramicsTemplate, instantiateTemplate } from "@saroh/templates";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProductGridFeed } from "./blocks/product-grid";
import type { ShopListingCard } from "./product/shop-listing";
import { PageSections } from "./section-renderer";

/**
 * The ceramics template (the gallery's "Store", U5) on a live site, drawn
 * with the real blocks and the feed the server reads.
 *
 * The design's first question is "is the work good, and is any of it left":
 * the collection is the top of the page, under nothing but the name. The
 * pieces, their prices and what is sold out come from the catalogue; the
 * template's own words are the headings and placeholders.
 */

const selling: TemplateContext = {
    organizationName: "Sample Pottery",
    tagline: "Stoneware, thrown and fired in small runs.",
    modules: ["WEBSITE", "COMMERCE"],
};

const piece = (over: Partial<ShopListingCard>): ShopListingCard => ({
    slug: "piece",
    name: "Piece",
    currency: "INR",
    price: "100.00",
    mrp: null,
    priceFrom: false,
    image: null,
    variantTitles: [],
    blurb: null,
    soldOut: false,
    ...over,
});

/** A fixture catalogue: six pieces, one sold out. */
const PIECES: ShopListingCard[] = [
    piece({ slug: "plate", name: "Fixture plate", blurb: "Stoneware." }),
    piece({ slug: "mug", name: "Fixture mug" }),
    piece({ slug: "bowl", name: "Fixture bowl", soldOut: true }),
    piece({ slug: "tumblers", name: "Fixture tumblers" }),
    piece({ slug: "vase", name: "Fixture vase" }),
    piece({ slug: "jug", name: "Fixture jug" }),
];

function renderHome(ctx: TemplateContext, feed?: ProductGridFeed) {
    const page = instantiateTemplate(ceramicsTemplate, ctx).pages[0];
    const resolvePage = () => undefined;
    const sections = page.sections.map((s) => ({
        type: s.type,
        content: toRendered(s.type, s.content, { resolvePage }),
    }));
    return render(
        <PageSections
            sections={sections}
            siteId="site-ceramics"
            productGrids={page.sections.map((s) =>
                s.type === "productGrid" ? feed : undefined,
            )}
        />,
    );
}

describe("the ceramics template, rendered live", () => {
    it("opens on the name and goes straight to the collection, then Material and the studio", () => {
        const { container } = renderHome(selling, {
            products: PIECES,
            basePath: "/shop",
        });
        const headings = Array.from(container.querySelectorAll("h1, h2")).map(
            (h) => `${h.tagName} ${h.textContent.trim()}`,
        );
        expect(headings).toEqual([
            "H1 Sample Pottery",
            "H2 Current collection",
            "H2 Material",
            "H2 The studio",
        ]);
        // The h1 is for screen readers: the header already shows the name.
        expect(container.querySelector("h1")?.className).toBe("sr-only");
        expect(container.textContent).not.toContain(
            "Stoneware, thrown and fired in small runs.",
        );
        // Collection and Material are the menu's in-page links.
        expect(container.querySelector("#collection")).not.toBeNull();
        expect(container.querySelector("#material")).not.toBeNull();
    });

    it("shows the catalogue's own pieces as plates, the first given the lead, five of them", () => {
        const { container } = renderHome(selling, {
            products: PIECES,
            basePath: "/shop",
        });
        const section = within(container)
            .getByRole("heading", { level: 2, name: "Current collection" })
            .closest("section");
        if (!section) throw new Error("No collection section");
        const grid = within(section);
        const items = grid.getAllByRole("listitem");
        expect(items).toHaveLength(5);
        expect(
            section.querySelector('[data-grid-look="plates"]'),
        ).not.toBeNull();
        expect(items[0].className).toContain("md:row-span-2");
        // Counted from the pieces shown, and the note under them.
        expect(grid.getByText("4 of 5 available")).toBeTruthy();
        expect(
            grid.getByText(
                "Everything not marked sold out can be bought here.",
            ),
        ).toBeTruthy();
        expect(items.map((li) => li.textContent)).toEqual([
            expect.stringContaining("Fixture plate"),
            expect.stringContaining("Fixture mug"),
            expect.stringContaining("Fixture bowl"),
            expect.stringContaining("Fixture tumblers"),
            expect.stringContaining("Fixture vase"),
        ]);
        // Sold out in words, from the catalogue.
        expect(within(items[2]).getByText("Sold out")).toBeTruthy();
        expect(within(items[0]).getByRole("link").getAttribute("href")).toBe(
            "/shop/plate",
        );
        expect(container.textContent).not.toContain("Fixture jug");
    });

    it("with nothing on sale, the collection draws nothing, and nothing else promises it", () => {
        const { container } = renderHome(selling, {
            products: [],
            basePath: "/shop",
        });
        expect(container.textContent).not.toContain("Current collection");
        expect(container.textContent).not.toMatch(/sold out|available/i);
    });

    it("draws the material notes as placeholders, and no photo until there is one", () => {
        const { container } = renderHome(selling, {
            products: PIECES,
            basePath: "/shop",
        });
        const page = within(container);
        for (const name of ["The clay", "The glaze", "The firing"]) {
            expect(page.getByRole("heading", { level: 3, name })).toBeTruthy();
        }
        expect(page.getAllByText(/^A placeholder\./)).toHaveLength(3);
        // The briefs are notes to the owner, never drawn for a visitor.
        expect(container.textContent).not.toMatch(/grog|mid-throw/);
        expect(container.querySelectorAll("img")).toHaveLength(0);
        // The studio's facts, as a definition list.
        const term = page.getByText("Throwing since");
        expect(term.tagName).toBe("DT");
        expect(term.nextElementSibling?.tagName).toBe("DD");
    });

    it("without Commerce, the page is the name, Material and the studio", () => {
        const { container } = renderHome({ organizationName: "Sample Maker" });
        expect(
            Array.from(container.querySelectorAll("h1, h2")).map(
                (h) => h.textContent,
            ),
        ).toEqual(["Sample Maker", "Material", "The studio"]);
    });
});
