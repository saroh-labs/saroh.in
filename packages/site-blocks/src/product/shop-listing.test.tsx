import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { readBag } from "../shop/bag-store";
import type { ShopListingCard } from "./shop-listing";
import ShopListing from "./shop-listing";

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
        expect(focaccia).toHaveTextContent("No photo yet");
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
