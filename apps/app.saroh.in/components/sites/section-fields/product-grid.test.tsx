// @vitest-environment jsdom
/**
 * The Product grid in the inspector (round 2 G12): which products (the
 * newest, a collection or picked), how many, and prices on or off. A
 * product's name, photo or price is never a field.
 *
 * `react-dom/client` + `act` directly, as `plans.test.tsx` does. The
 * catalogue read is handed in, so no action runs.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BOUND_BLOCKS, boundHref } from "@/components/sites/block-kinds";
import {
    SECTION_ORDER,
    addableSections,
} from "@/components/sites/editor-constants";
import { emptySection } from "@/components/sites/empty-section";
import type { GridCatalogueLoad } from "@/components/sites/use-grid-catalogue";
import type { ProductGridContent, Section } from "@/lib/sites/service";

import { ProductGridFieldsView } from "./product-grid";

vi.mock("@/lib/sites/actions", () => ({
    listGridCatalogue: vi.fn(),
}));

let root: Root;
let host: HTMLDivElement;

type GridSection = Extract<Section, { type: "productGrid" }>;

const READY: GridCatalogueLoad = {
    status: "ready",
    products: [
        { id: "p_focaccia", name: "Focaccia", status: "PUBLISHED" },
        { id: "p_old", name: "Old loaf", status: "ARCHIVED" },
        { id: "p_sourdough", name: "Sourdough", status: "PUBLISHED" },
        { id: "p_wip", name: "Test cake", status: "DRAFT" },
    ],
    collections: [{ id: "col_breads", name: "Breads", productCount: 5 }],
};

function render(
    content: ProductGridContent,
    catalogue: GridCatalogueLoad = READY,
) {
    const onChange = vi.fn<(next: Section) => void>();
    const section: GridSection = {
        key: "sec_grid",
        type: "productGrid",
        contractVersion: 1,
        content,
    };
    act(() => {
        root.render(
            <ProductGridFieldsView
                section={section}
                catalogue={catalogue}
                onChange={onChange}
            />,
        );
    });
    return onChange;
}

function lastContent(onChange: ReturnType<typeof render>): ProductGridContent {
    const next = onChange.mock.calls.at(-1)?.[0];
    if (next?.type !== "productGrid") throw new Error("No grid change");
    return next.content;
}

function byText(selector: string, text: string): HTMLElement {
    const found = Array.from(host.querySelectorAll<HTMLElement>(selector)).find(
        (el) => el.textContent.trim() === text,
    );
    if (!found) throw new Error(`No "${text}"`);
    return found;
}

function byLabel(label: string): HTMLElement {
    const found = host.querySelector<HTMLElement>(`[aria-label="${label}"]`);
    if (!found) throw new Error(`No [aria-label="${label}"]`);
    return found;
}

function click(el: HTMLElement) {
    act(() => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("the Product grid's fields (G12)", () => {
    it("shows the newest four, with prices, until told otherwise", () => {
        render({ title: "Our products" });
        expect(byText("button", "Newest").getAttribute("data-state")).toBe(
            "on",
        );
        expect(byText("button", "Up to 4").getAttribute("data-state")).toBe(
            "on",
        );
        expect(
            host
                .querySelector("#sec_grid-prices")
                ?.getAttribute("aria-checked"),
        ).toBe("true");
    });

    it("switching to a collection keeps no picked products", () => {
        const onChange = render({
            source: "picked",
            productIds: ["p_focaccia"],
        });
        click(byText("button", "A collection"));
        expect(lastContent(onChange)).toEqual({
            source: "collection",
            productIds: undefined,
        });
    });

    it("switching back to the newest stores it as the default, with no ids", () => {
        const onChange = render({
            source: "collection",
            collectionId: "col_breads",
        });
        click(byText("button", "Newest"));
        expect(lastContent(onChange)).toEqual({
            source: undefined,
            collectionId: undefined,
            productIds: undefined,
        });
    });

    it("stores eight, and four as the default", () => {
        const onChange = render({});
        click(byText("button", "Up to 8"));
        expect(lastContent(onChange)).toEqual({ count: 8 });
        const back = render({ count: 12 });
        click(byText("button", "Up to 4"));
        expect(lastContent(back)).toEqual({ count: undefined });
    });

    it("turns prices off, and back on as the default", () => {
        const prices = () => {
            const found = host.querySelector<HTMLElement>("#sec_grid-prices");
            if (!found) throw new Error("No prices switch");
            return found;
        };
        const onChange = render({});
        click(prices());
        expect(lastContent(onChange)).toEqual({ showPrices: false });
        const back = render({ showPrices: false });
        click(prices());
        expect(lastContent(back)).toEqual({ showPrices: undefined });
    });

    it("lists picked products in order, saying which won't show", () => {
        render({
            source: "picked",
            productIds: ["p_sourdough", "p_old", "p_wip", "p_gone"],
        });
        const rows = Array.from(host.querySelectorAll("ol > li")).map((li) =>
            li.textContent.replace(/UpDownRemove$/, ""),
        );
        expect(rows).toEqual([
            "Sourdough",
            "Old loafArchived — not shown on the site",
            "Test cakeDraft — not shown until published",
            "Unknown productDeleted — not shown on the site",
        ]);
    });

    it("moves and removes a picked product", () => {
        const onChange = render({
            source: "picked",
            productIds: ["p_sourdough", "p_focaccia"],
        });
        click(byLabel("Move Focaccia up"));
        expect(lastContent(onChange).productIds).toEqual([
            "p_focaccia",
            "p_sourdough",
        ]);
        click(byLabel("Remove Sourdough"));
        expect(lastContent(onChange).productIds).toEqual(["p_focaccia"]);
    });

    it("says a chosen collection has been deleted", () => {
        render({ source: "collection", collectionId: "col_gone" });
        expect(host.textContent).toContain(
            "The collection this grid showed has been deleted.",
        );
    });

    it("points to Sell › Products when there are no collections yet", () => {
        render({ source: "collection" }, { ...READY, collections: [] });
        const link = byText("a", "Make one in Sell › Products");
        expect(link.getAttribute("href")).toBe(
            "/commerce/products?view=collections",
        );
    });

    it("a failed read is never 'no products', and offers to try again", () => {
        const retry = vi.fn();
        render(
            { source: "picked", productIds: ["p_sourdough"] },
            { status: "failed", forbidden: false, retry },
        );
        expect(host.textContent).toContain("We couldn't load your products.");
        expect(host.textContent).toContain("1 product picked.");
        expect(host.textContent).not.toContain("Deleted");
        click(byText("button", "Try again"));
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it("says so when the role can't see the catalogue", () => {
        render(
            { source: "picked" },
            { status: "failed", forbidden: true, retry: vi.fn() },
        );
        expect(host.textContent).toContain("Your role can't see the catalogue");
    });

    it("never offers a product's name, price or photo as a field", () => {
        render({});
        expect(host.querySelectorAll("input")).toHaveLength(1);
        expect(host.textContent).toContain(
            "Each card uses that product's own photo",
        );
    });
});

describe("the Product grid in the editor (G12)", () => {
    it("says products live in Sell › Products and links there", () => {
        const bound = BOUND_BLOCKS.productGrid;
        expect(bound?.notice).toContain("Products live in Sell › Products");
        expect(bound && boundHref(bound, "site_1")).toBe("/commerce/products");
    });

    it("starts as the newest, with a title", () => {
        const section = emptySection("productGrid");
        expect(section.type).toBe("productGrid");
        expect(section.content).toEqual({ title: "Our products" });
    });

    it("is offered only while the shop is open for the business", () => {
        expect(addableSections(false)).not.toContain("productGrid");
        expect(addableSections(true)).toContain("productGrid");
        expect(addableSections(true)).toEqual(SECTION_ORDER);
        expect(addableSections(false)).toEqual(
            SECTION_ORDER.filter((t) => t !== "productGrid"),
        );
    });
});
