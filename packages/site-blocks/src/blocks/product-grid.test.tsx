import type { RenderedProductGrid } from "@saroh/block-contract";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ShopListingCard } from "../product/shop-listing";
import { PageSections } from "../section-renderer";
import ProductGridSection, {
    cardLine,
    productCardsOf,
    productGridQuery,
} from "./product-grid";

const card = (over: Partial<ShopListingCard>): ShopListingCard => ({
    slug: "loaf",
    name: "Loaf",
    currency: "INR",
    price: "120.00",
    mrp: null,
    priceFrom: false,
    image: null,
    variantTitles: [],
    blurb: null,
    soldOut: false,
    ...over,
});

/** Five breads, as the public read returns them for a "Breads" collection. */
const BREADS: ShopListingCard[] = [
    card({
        slug: "focaccia",
        name: "Focaccia",
        blurb: "Olive oil and rosemary. Baked at noon.",
        image: { url: "https://cdn.test/focaccia.jpg", alt: "A focaccia" },
    }),
    card({
        slug: "sourdough",
        name: "Sourdough",
        price: "250.00",
        priceFrom: true,
        variantTitles: ["Small", "Large"],
        optionName: "Size",
    }),
    card({ slug: "brioche", name: "Brioche", soldOut: true }),
    card({ slug: "rye-loaf", name: "Rye loaf" }),
    card({ slug: "baguette", name: "Baguette" }),
];

const content: RenderedProductGrid = {
    title: "Breads",
    source: "collection",
    collectionId: "col_breads",
    count: 4,
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function cards(): HTMLElement[] {
    return screen.queryAllByRole("listitem");
}

describe("the Product grid on a served page (G12)", () => {
    it("a Breads collection of five, count four: four cards linking to their pages", () => {
        render(
            <ProductGridSection
                content={content}
                feed={{ products: BREADS, basePath: "/shop" }}
            />,
        );
        expect(
            screen.getByRole("heading", { level: 2, name: "Breads" }),
        ).toBeTruthy();
        expect(cards()).toHaveLength(4);
        const hrefs = cards().map((li) =>
            within(li).getByRole("link").getAttribute("href"),
        );
        expect(hrefs).toEqual([
            "/shop/focaccia",
            "/shop/sourdough",
            "/shop/brioche",
            "/shop/rye-loaf",
        ]);
        expect(
            screen.getByRole("link", { name: "Shop" }).getAttribute("href"),
        ).toBe("/shop");
    });

    it("draws the photo, the options, the name, one line and the price", () => {
        render(
            <ProductGridSection
                content={content}
                feed={{ products: BREADS, basePath: "/shop" }}
            />,
        );
        const [focaccia, sourdough, brioche] = cards();
        expect(within(focaccia).getByRole("img").getAttribute("alt")).toBe(
            "A focaccia",
        );
        expect(
            within(focaccia).getByText("Olive oil and rosemary."),
        ).toBeTruthy();
        expect(within(focaccia).getByText("₹120")).toBeTruthy();
        expect(within(sourdough).getByText("2 sizes")).toBeTruthy();
        // The card sums its options up (DEC-073 #12), never lists them.
        expect(within(sourdough).queryByText(/Small/)).toBeNull();
        expect(within(sourdough).getByText("From ₹250")).toBeTruthy();
        expect(within(brioche).getByText("Sold out")).toBeTruthy();
    });

    it("leaves the prices off when the merchant turned them off", () => {
        render(
            <ProductGridSection
                content={{ ...content, showPrices: false }}
                feed={{ products: BREADS, basePath: "/shop" }}
            />,
        );
        expect(screen.queryByText("₹120")).toBeNull();
        expect(screen.queryByText("From ₹250")).toBeNull();
    });

    it("shows four when the count isn't set, and 'Our products' when the title isn't", () => {
        render(
            <ProductGridSection
                content={{}}
                feed={{ products: BREADS, basePath: "/shop" }}
            />,
        );
        expect(cards()).toHaveLength(4);
        expect(
            screen.getByRole("heading", { level: 2, name: "Our products" }),
        ).toBeTruthy();
    });

    it("renders nothing live with no products (every picked one archived)", () => {
        const { container } = render(
            <ProductGridSection
                content={{ source: "picked", productIds: ["p_gone"] }}
                feed={{ products: [], basePath: "/shop" }}
            />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("behind a preview, draws the cards without links", () => {
        render(
            <ProductGridSection
                content={content}
                feed={{ products: BREADS, basePath: null }}
            />,
        );
        expect(cards()).toHaveLength(4);
        expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

    it("draws nothing on a live render that could not tell its site", () => {
        const { container } = render(
            <ProductGridSection content={content} siteId={null} />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("never fetches when the page handed it the products", () => {
        const fetchMock = vi.fn();
        const realFetch = globalThis.fetch;
        globalThis.fetch = fetchMock;
        try {
            render(
                <ProductGridSection
                    content={content}
                    feed={{ products: BREADS, basePath: "/shop" }}
                    siteId="site_1"
                />,
            );
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    it("each grid on a page draws its own products", () => {
        render(
            <PageSections
                sections={[
                    { type: "productGrid", content: { title: "One" } },
                    { type: "hero", content: { heading: "Hi" } },
                    { type: "productGrid", content: { title: "Two" } },
                ]}
                productGrids={[
                    { products: [BREADS[0]], basePath: "/shop" },
                    undefined,
                    { products: [BREADS[1], BREADS[2]], basePath: "/shop" },
                ]}
            />,
        );
        const [one, two] = screen.getAllByRole("list");
        expect(within(one).getAllByRole("listitem")).toHaveLength(1);
        expect(within(two).getAllByRole("listitem")).toHaveLength(2);
    });
});

describe("the Product grid on the editor's canvas (G12)", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    async function drawWith(
        response: Response | Error,
        grid: RenderedProductGrid = content,
    ) {
        const fetchMock = vi.fn(() =>
            response instanceof Error
                ? Promise.reject(response)
                : Promise.resolve(response),
        );
        globalThis.fetch = fetchMock;
        await act(async () => {
            await Promise.resolve();
            render(
                <ProductGridSection
                    content={grid}
                    siteId="site_1"
                    apiUrl="https://api.test"
                />,
            );
        });
        return fetchMock;
    }

    it("reads the grid's own products and draws them, the cards inert", async () => {
        const fetchMock = await drawWith(
            json({ storefront: { name: "Online" }, products: BREADS }),
        );
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.test/public/sites/site_1/shop/products?source=collection&collection=col_breads&count=4",
            expect.anything(),
        );
        expect(cards()).toHaveLength(4);
        expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

    it("says every picked product is off sale, rather than vanishing", async () => {
        await drawWith(json({ storefront: { name: "Online" }, products: [] }), {
            source: "picked",
            productIds: ["p_gone"],
        });
        expect(screen.getByRole("status").textContent).toContain(
            "None of the products picked here is on sale at Online",
        );
    });

    it("asks for a collection before reading anything", async () => {
        const fetchMock = await drawWith(json({}), { source: "collection" });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByRole("status").textContent).toContain(
            "Choose a collection",
        );
    });

    it("with the shop not open here (a 404), says why the section is left off", async () => {
        await drawWith(json({ message: "Nothing to show here" }, 404));
        expect(screen.getByRole("status").textContent).toContain(
            "doesn't sell from a storefront yet",
        );
    });

    it("a failed read offers to try again, and trying again reads again", async () => {
        const fetchMock = await drawWith(new Error("offline"));
        expect(screen.getByRole("alert").textContent).toContain(
            "couldn't load your products",
        );
        fetchMock.mockImplementation(() =>
            Promise.resolve(json({ products: BREADS })),
        );
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Try again" }));
            await Promise.resolve();
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(cards()).toHaveLength(4);
    });

    it("with no site at all, says where the products come from", () => {
        render(<ProductGridSection content={content} />);
        expect(screen.getByRole("status").textContent).toContain(
            "Products from your catalogue show here",
        );
    });
});

describe("the Product grid's read", () => {
    it("asks for the newest four by default", () => {
        expect(productGridQuery({})).toBe("source=newest&count=4");
    });

    it("asks for picked products in order", () => {
        expect(
            productGridQuery({
                source: "picked",
                productIds: ["p_2", "p_1"],
                count: 2,
            }),
        ).toBe("source=picked&ids=p_2%2Cp_1&count=2");
    });

    it("asks nothing until a collection or product is chosen", () => {
        expect(productGridQuery({ source: "collection" })).toBeNull();
        expect(
            productGridQuery({ source: "picked", productIds: [] }),
        ).toBeNull();
    });

    it("keeps only well-formed cards from a body", () => {
        expect(
            productCardsOf({ products: [BREADS[0], { slug: 3 }, null] }),
        ).toEqual([BREADS[0]]);
        expect(productCardsOf({ nope: true })).toBeNull();
    });

    it("cuts a card's line at its first sentence", () => {
        expect(cardLine("Slow rye. Keeps a week.")).toBe("Slow rye.");
        expect(cardLine("No full stop")).toBe("No full stop");
        expect(cardLine("  ")).toBeNull();
        expect(cardLine(null)).toBeNull();
    });
});
