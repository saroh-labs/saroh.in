import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { readBag } from "../shop/bag-store";
import type { ShopListingCard } from "./shop-listing";
import ShopListing, { categoriesOf, ShopUnavailable } from "./shop-listing";

const sourdough: ShopListingCard = {
    slug: "sourdough",
    name: "Sourdough",
    currency: "INR",
    price: "250.00",
    mrp: null,
    priceFrom: true,
    image: { url: "https://img.test/loaf.jpg", alt: "A dark rye loaf" },
    variantTitles: ["Small", "Large"],
    optionName: "Size",
    blurb: "Slow rye. Baked at dawn.",
    soldOut: false,
};

describe("ShopListing (G11)", () => {
    it("lists each product as a link to its page, with its sizes and price", () => {
        render(<ShopListing products={[sourdough]} />);
        expect(
            screen.getByRole("heading", { level: 1, name: "Shop" }),
        ).toBeInTheDocument();
        const link = screen.getByRole("link", { name: /Sourdough/ });
        expect(link).toHaveAttribute("href", "/shop/sourdough");
        expect(link).toHaveTextContent("2 sizes");
        expect(link).toHaveTextContent("From ₹250");
        expect(screen.getByAltText("A dark rye loaf")).toBeInTheDocument();
    });

    it("says Sold out on a card with nothing to sell, and strikes an MRP only when it is higher", () => {
        render(
            <ShopListing
                products={[
                    {
                        ...sourdough,
                        slug: "focaccia",
                        name: "Focaccia",
                        priceFrom: false,
                        price: "300.00",
                        mrp: "350.00",
                        image: null,
                        variantTitles: [],
                        soldOut: true,
                    },
                    {
                        ...sourdough,
                        slug: "bun",
                        name: "Bun",
                        priceFrom: false,
                        price: "40.00",
                        mrp: "40.00",
                    },
                ]}
            />,
        );
        const focaccia = screen.getByRole("link", { name: /Focaccia/ });
        expect(focaccia).toHaveTextContent("Sold out");
        expect(focaccia).toHaveTextContent("MRP ₹350");
        // An owner's note never reaches a customer.
        expect(focaccia).not.toHaveTextContent("No photo yet");
        expect(screen.getByRole("link", { name: /Bun/ })).not.toHaveTextContent(
            "MRP",
        );
    });

    describe("Add to bag on the card (the design's shop, G13)", () => {
        beforeEach(() => window.localStorage.clear());

        // One option on offer: nothing to choose, so the card adds it.
        const offered: ShopListingCard = {
            ...sourdough,
            variantTitles: ["Large"],
            listingId: "listing-sourdough",
            bagVariantId: "variant-large",
        };
        // Two sizes on offer: the card can't know which is wanted.
        const sized: ShopListingCard = {
            ...sourdough,
            listingId: "listing-sourdough",
            bagVariantId: "variant-small",
        };

        it("sends a product with several options to its page to choose, adding nothing", () => {
            render(<ShopListing products={[sized]} bagSite="site-1" />);
            const choose = screen.getByRole("link", {
                name: "Choose size for Sourdough",
            });
            expect(choose).toHaveTextContent("Choose size");
            expect(choose).toHaveAttribute("href", "/shop/sourdough");
            // A link, not a button: nothing is added from the card.
            expect(screen.queryByRole("button")).toBeNull();
            expect(readBag("site-1")).toEqual([]);
        });

        it("says Choose options where the options have no name", () => {
            render(
                <ShopListing
                    products={[{ ...sized, optionName: null }]}
                    bagSite="site-1"
                />,
            );
            expect(
                screen.getByRole("link", {
                    name: "Choose options for Sourdough",
                }),
            ).toHaveTextContent("Choose options");
        });

        it("keeps Add to bag for a product with no options at all", () => {
            render(
                <ShopListing
                    products={[
                        { ...offered, variantTitles: [], bagVariantId: null },
                    ]}
                    bagSite="site-1"
                />,
            );
            expect(
                screen.getByRole("button", {
                    name: "Add Sourdough to your bag",
                }),
            ).toHaveTextContent("Add to bag");
        });

        it("adds the one option on offer, then says Add another and offers the bag", () => {
            render(<ShopListing products={[offered]} bagSite="site-1" />);
            fireEvent.click(
                screen.getByRole("button", {
                    name: "Add Sourdough to your bag",
                }),
            );
            expect(readBag("site-1")).toEqual([
                {
                    listingId: "listing-sourdough",
                    variantId: "variant-large",
                    quantity: 1,
                },
            ]);
            expect(
                screen.getByRole("button", {
                    name: "Add Sourdough to your bag",
                }),
            ).toHaveTextContent("Add another");
            expect(screen.getByRole("status")).toHaveTextContent(
                "Sourdough added to your bag.",
            );
            expect(
                screen.getByRole("button", { name: "View bag" }),
            ).toBeInTheDocument();
            // The rest of the card still opens the product.
            expect(
                screen.getByRole("link", { name: /Sourdough/ }),
            ).toHaveAttribute("href", "/shop/sourdough");
        });

        it("is off and says Sold out when nothing can be sold", () => {
            render(
                <ShopListing
                    products={[{ ...sized, soldOut: true, bagVariantId: null }]}
                    bagSite="site-1"
                />,
            );
            const button = screen.getByRole("button", {
                name: "Sourdough: sold out",
            });
            expect(button).toBeDisabled();
            expect(button).toHaveTextContent("Sold out");
        });

        it("stops at what is left, as the product page does (UX-058)", () => {
            render(
                <ShopListing
                    products={[{ ...offered, bagLeft: 1 }]}
                    bagSite="site-1"
                />,
            );
            fireEvent.click(
                screen.getByRole("button", {
                    name: "Add Sourdough to your bag",
                }),
            );
            const button = screen.getByRole("button", {
                name: "Sourdough: the last one is in your bag",
            });
            expect(button).toBeDisabled();
            expect(button).toHaveTextContent("In your bag");
            fireEvent.click(button);
            expect(readBag("site-1")).toEqual([
                {
                    listingId: "listing-sourdough",
                    variantId: "variant-large",
                    quantity: 1,
                },
            ]);
        });

        it("draws no button where the site takes no online orders", () => {
            render(<ShopListing products={[offered]} />);
            expect(screen.queryByRole("button")).toBeNull();
        });
    });
});

describe("browsing the shop by category", () => {
    const card = (
        slug: string,
        categoryName: string | null,
    ): ShopListingCard => ({
        slug,
        name: slug,
        currency: "INR",
        price: "100.00",
        mrp: null,
        priceFrom: false,
        image: { url: `https://img.test/${slug}.jpg`, alt: slug },
        variantTitles: [],
        blurb: null,
        categoryName,
        soldOut: false,
    });
    const products = [
        card("sourdough", "Bread"),
        card("croissant", "Pastry"),
        card("rye", " Bread "),
        card("gift-card", null),
    ];

    it("offers the products' own categories as chips, All first, and narrows the list", () => {
        render(<ShopListing products={products} />);
        const chips = screen.getByRole("radiogroup", { name: "Category" });
        expect(
            Array.from(chips.querySelectorAll("button")).map(
                (b) => b.textContent,
            ),
        ).toEqual(["All", "Bread", "Pastry"]);
        expect(screen.getByRole("radio", { name: "All" })).toHaveAttribute(
            "aria-checked",
            "true",
        );
        expect(screen.getAllByRole("listitem")).toHaveLength(4);

        fireEvent.click(screen.getByRole("radio", { name: "Bread" }));
        expect(
            screen.getAllByRole("listitem").map((li) => li.textContent),
        ).toEqual([
            expect.stringContaining("sourdough"),
            expect.stringContaining("rye"),
        ]);
        fireEvent.click(screen.getByRole("radio", { name: "All" }));
        expect(screen.getAllByRole("listitem")).toHaveLength(4);
        // 44px under a finger.
        expect(
            screen.getByRole("radio", { name: "Pastry" }).className,
        ).toContain("coarse:min-h-11");
    });

    it("offers no chips without a choice to make", () => {
        render(
            <ShopListing
                products={[card("sourdough", "Bread"), card("rye", "Bread")]}
            />,
        );
        expect(
            screen.queryByRole("radiogroup", { name: "Category" }),
        ).toBeNull();
        expect(
            categoriesOf([card("a", null), card("b", undefined as never)]),
        ).toEqual([]);
    });

    it("draws each card's photo square", () => {
        const { container } = render(<ShopListing products={products} />);
        const photo = container.querySelector("img");
        expect(photo?.parentElement?.className).toContain("aspect-square");
        expect(photo?.parentElement?.className).not.toContain("h-[140px]");
    });
});

describe("a product with no photo (starter audit)", () => {
    const plain = (slug: string, more: Partial<ShopListingCard> = {}) => ({
        ...sourdough,
        slug,
        name: slug,
        image: null,
        variantTitles: [],
        priceFrom: false,
        ...more,
    });

    it("draws a shop with no photos as text cards: no frame, no panel, no owner's note", () => {
        const { container } = render(
            <ShopListing products={[plain("crate"), plain("pallet")]} />,
        );
        expect(container.querySelectorAll("img")).toHaveLength(0);
        expect(container.querySelector("[data-name-plate]")).toBeNull();
        expect(container.querySelector(".aspect-square")).toBeNull();
        expect(container).not.toHaveTextContent("No photo yet");
        expect(
            Array.from(container.querySelectorAll("[data-card]")).map((a) =>
                a.getAttribute("data-card"),
            ),
        ).toEqual(["text", "text"]);
        // The card still says what it is and what it costs.
        const crate = screen.getByRole("link", { name: /crate/ });
        expect(crate).toHaveAttribute("href", "/shop/crate");
        expect(crate).toHaveTextContent("₹250");
    });

    it("gives it the photo's own square in a mixed grid, so the row lines up", () => {
        const { container } = render(
            <ShopListing products={[sourdough, plain("crate")]} />,
        );
        const photo = container.querySelector("img")?.parentElement;
        const plate = container.querySelector("[data-name-plate]");
        expect(photo?.className).toContain("aspect-square");
        expect(plate?.className).toContain("aspect-square");
        // Decoration: the card's own words name it, once.
        expect(plate).toHaveAttribute("aria-hidden", "true");
        expect(screen.getByRole("link", { name: /crate/ })).toHaveAttribute(
            "data-card",
            "plate",
        );
        expect(container).not.toHaveTextContent("No photo yet");
    });

    it("goes back to text cards when the category shown has no photos", () => {
        const { container } = render(
            <ShopListing
                products={[
                    { ...sourdough, categoryName: "Bread" },
                    plain("crate", { categoryName: "Packing" }),
                ]}
            />,
        );
        expect(container.querySelector("[data-name-plate]")).not.toBeNull();
        fireEvent.click(screen.getByRole("radio", { name: "Packing" }));
        expect(container.querySelector("[data-name-plate]")).toBeNull();
        expect(container.querySelector("img")).toBeNull();
    });
});

describe("the shop's cards", () => {
    it("keeps each photo's room before it arrives, and waits for those below the first row", () => {
        const many = Array.from({ length: 6 }, (_, i) => ({
            ...sourdough,
            slug: `loaf-${i}`,
            name: `Loaf ${i}`,
        }));
        const { container } = render(<ShopListing products={many} />);
        const photos = Array.from(container.querySelectorAll("img"));
        expect(photos).toHaveLength(6);
        for (const photo of photos) {
            expect(photo).toHaveAttribute("width", "600");
            expect(photo).toHaveAttribute("height", "600");
        }
        expect(photos.map((p) => p.getAttribute("loading"))).toEqual([
            "eager",
            "eager",
            "eager",
            "eager",
            "lazy",
            "lazy",
        ]);
    });

    it("puts the button under the price, 44px and as wide as the card, quiet when it can't be pressed", () => {
        window.localStorage.clear();
        const offered: ShopListingCard = {
            ...sourdough,
            variantTitles: [],
            listingId: "listing-sourdough",
            bagVariantId: null,
        };
        render(
            <ShopListing
                products={[
                    offered,
                    {
                        ...offered,
                        slug: "bun",
                        name: "Bun",
                        listingId: "listing-bun",
                        soldOut: true,
                    },
                ]}
                bagSite="site-1"
            />,
        );
        const add = screen.getByRole("button", {
            name: "Add Sourdough to your bag",
        });
        expect(add.className).toContain("h-11");
        expect(add.className).toContain("inset-x-3.5");
        expect(add.className).toContain("bg-site-accent");
        const off = screen.getByRole("button", { name: "Bun: sold out" });
        expect(off).toBeDisabled();
        // Quiet, not faded: its words still read.
        expect(off.className).not.toContain("bg-site-accent");
        expect(off.className).not.toContain("opacity-50");
        // The price keeps its own line: nothing is held back beside it.
        expect(
            screen.getByRole("link", { name: /Sourdough/ }).innerHTML,
        ).not.toContain("pr-36");
    });

    it("keeps a row's names level: the options row is on every card when any card has one", () => {
        const { container } = render(
            <ShopListing
                products={[
                    sourdough,
                    {
                        ...sourdough,
                        slug: "bun",
                        name: "Bun",
                        variantTitles: [],
                    },
                ]}
            />,
        );
        expect(container.querySelectorAll(".min-h-5")).toHaveLength(2);
    });
});

describe("the line under the shop's heading", () => {
    it("says how an order reaches the customer when the page was given it", () => {
        const { container } = render(
            <ShopListing
                products={[sourdough]}
                lead="Order online for pick-up or local delivery."
            />,
        );
        const lead = container.querySelector("[data-shop-lead]");
        expect(lead).toHaveTextContent(
            "Order online for pick-up or local delivery.",
        );
        // What a customer decides on: the body colour, 16px.
        expect(lead?.className).toContain("text-site-body");
        expect(lead?.className).toContain("text-base");
    });

    it("draws no line, and no empty paragraph, without one", () => {
        const { container } = render(<ShopListing products={[sourdough]} />);
        expect(container.querySelector("[data-shop-lead]")).toBeNull();
        expect(container.querySelector("h1 + p")).toBeNull();
    });
});

describe("a shop with nothing to show", () => {
    it("says nothing is on sale yet, with the ways to reach the business", () => {
        const { container } = render(
            <ShopListing
                products={[]}
                business="Northwind Supply"
                reach={{ phone: "+918040992210", whatsapp: null }}
            />,
        );
        expect(
            screen.getByRole("heading", { level: 1, name: "Shop" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { level: 2, name: "No products yet" }),
        ).toBeInTheDocument();
        expect(container).toHaveTextContent(
            "Northwind Supply hasn't put anything on sale here yet.",
        );
        expect(screen.getByRole("link", { name: /^Call / })).toHaveAttribute(
            "href",
            "tel:+918040992210",
        );
        expect(screen.queryByRole("list")).toBeNull();
    });

    it("says a failed read as a failure, never as an empty shop, and offers another go", () => {
        render(
            <ShopUnavailable
                business="Northwind Supply"
                retryHref="/shop"
                reach={{ phone: "+918040992210", whatsapp: null }}
            />,
        );
        const alert = screen.getByRole("alert");
        expect(alert).toHaveAttribute("data-page-state", "failed");
        expect(
            screen.getByRole("heading", {
                level: 1,
                name: "We couldn't open the shop",
            }),
        ).toBeInTheDocument();
        expect(alert).not.toHaveTextContent("No products yet");
        expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
            "href",
            "/shop",
        );
        expect(screen.getByRole("link", { name: /^Call / })).toBeVisible();
    });

    it("draws nothing to press when it was given no way on", () => {
        render(<ShopUnavailable business="Northwind Supply" />);
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
    });
});
