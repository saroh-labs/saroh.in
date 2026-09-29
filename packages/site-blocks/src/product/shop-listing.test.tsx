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
        expect(link).toHaveTextContent("Small · Large");
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

        const offered: ShopListingCard = {
            ...sourdough,
            listingId: "listing-sourdough",
            bagVariantId: "variant-large",
        };

        it("adds the first option on offer, then says Add another and offers the bag", () => {
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
                    products={[
                        { ...offered, soldOut: true, bagVariantId: null },
                    ]}
                    bagSite="site-1"
                />,
            );
            const button = screen.getByRole("button", {
                name: "Sourdough: sold out",
            });
            expect(button).toBeDisabled();
            expect(button).toHaveTextContent("Sold out");
        });

        it("draws no button where the site takes no online orders", () => {
            render(<ShopListing products={[offered]} />);
            expect(screen.queryByRole("button")).toBeNull();
        });
    });
});
