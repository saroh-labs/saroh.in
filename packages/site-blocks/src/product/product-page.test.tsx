import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProductPageData } from "./product-page";
import ProductPage, { formatAmount, percentOff } from "./product-page";

const dress: ProductPageData = {
    name: "Linen Wrap Dress",
    currency: "INR",
    price: "2499.00",
    mrp: "3299.00",
    categoryName: "Dresses",
    description: "<p>A breezy wrap in washed linen.</p>",
    keyPoints: ["Adjustable tie waist", "Side pockets"],
    howToUse: "Hand wash cold, dry in shade.",
    materials: "100% linen",
    materialsLabel: "Fabric",
    maker: "Tanvi Studio, Jaipur",
    warranty: null,
    returns: "Exchange within 7 days, tags on",
    images: [
        {
            id: "i1",
            url: "https://img.test/cover.jpg",
            alt: "Sage wrap dress, front",
        },
        {
            id: "i2",
            url: "https://img.test/back.jpg",
            alt: "Sage wrap dress, back",
        },
    ],
    optionName: "Size",
    variants: [
        {
            id: "s",
            title: "S",
            price: null,
            mrp: null,
            imageId: null,
            stock: "SOLD_OUT",
            left: 0,
        },
        {
            id: "m",
            title: "M",
            price: null,
            mrp: null,
            imageId: null,
            stock: "LOW",
            left: 2,
        },
        {
            id: "l",
            title: "L",
            price: "2699.00",
            mrp: null,
            imageId: "i2",
            stock: "IN_STOCK",
            left: 9,
        },
    ],
    stock: null,
    rating: { average: 4.5, count: 2 },
    reviews: [
        {
            id: "r1",
            rating: 5,
            body: "Fits true to size.",
            displayName: "Meera K.",
            variantTitle: "M",
            reply: "Thank you, Meera!",
            dateLabel: "12 Sep",
        },
    ],
};

describe("ProductPage", () => {
    it("formats rupees without paise when whole, and rounds the saving down", () => {
        expect(formatAmount("2499.00", "INR")).toBe("₹2,499");
        expect(formatAmount("24.50", "INR")).toBe("₹24.50");
        expect(percentOff("649", "999")).toBe(35);
        expect(percentOff("799", "799")).toBeNull();
    });

    it("starts on the first variant that can be sold, with its stock word", () => {
        render(<ProductPage product={dress} />);
        expect(screen.getByRole("button", { name: "M" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.getByText("Only 2 left")).toBeInTheDocument();
        expect(screen.getByText("24% off")).toBeInTheDocument();
    });

    it("picking a variant changes the price, the saving and the photo", () => {
        render(<ProductPage product={dress} />);
        fireEvent.click(screen.getByRole("button", { name: "L" }));
        expect(screen.getByText("₹2,699")).toBeInTheDocument();
        // 2699 against the product's 3299 MRP.
        expect(screen.getByText("18% off")).toBeInTheDocument();
        expect(
            screen.getByAltText("Sage wrap dress, back"),
        ).toBeInTheDocument();
        expect(screen.getByText("In stock")).toBeInTheDocument();
    });

    it("a sold-out variant can be looked at but not bought", () => {
        render(<ProductPage product={dress} />);
        fireEvent.click(screen.getByRole("button", { name: "S — sold out" }));
        expect(screen.getByRole("button", { name: "Sold out" })).toBeDisabled();
    });

    it("in preview, the basket says nothing was added", () => {
        const add = vi.fn();
        render(<ProductPage product={dress} onAddToBasket={add} />);
        fireEvent.click(screen.getByRole("button", { name: "Add to basket" }));
        expect(screen.getByRole("status")).toHaveTextContent(/preview/);
        expect(add).not.toHaveBeenCalled();
    });

    it("leaves out a field that is team only, and draws markers only when asked", () => {
        const { rerender } = render(
            <ProductPage product={{ ...dress, maker: null, howToUse: null }} />,
        );
        expect(screen.queryByText("Made by")).not.toBeInTheDocument();
        expect(screen.queryByText(/Hand wash/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Note 1")).not.toBeInTheDocument();
        rerender(<ProductPage product={dress} markers />);
        expect(screen.getByLabelText("Note 1")).toBeInTheDocument();
        expect(screen.getByLabelText("Note 7")).toBeInTheDocument();
    });

    it("lists the merchant's own fields shown on the shop", () => {
        render(
            <ProductPage
                product={{
                    ...dress,
                    extras: [{ label: "Fabric care", value: "Dry clean only" }],
                }}
            />,
        );
        expect(screen.getByText("Fabric care")).toBeInTheDocument();
        expect(screen.getByText("Dry clean only")).toBeInTheDocument();
    });

    it("renders with no photos, no variants and no reviews", () => {
        render(
            <ProductPage
                product={{
                    ...dress,
                    images: [],
                    variants: [],
                    optionName: null,
                    stock: { word: "IN_STOCK", left: 12 },
                    rating: null,
                    reviews: [],
                }}
            />,
        );
        expect(screen.getByText("No photo yet")).toBeInTheDocument();
        expect(screen.getByText(/No reviews yet/)).toBeInTheDocument();
        expect(screen.getByText("₹2,499")).toBeInTheDocument();
    });

    it("shows a video with its length, and its poster with Open video when it can't play", () => {
        const { container } = render(
            <ProductPage
                product={{
                    ...dress,
                    images: [
                        ...dress.images,
                        {
                            id: "v1",
                            url: "https://img.test/twirl.mov",
                            alt: "The dress, twirling",
                            kind: "video",
                            durationSec: 24,
                            posterUrl: "https://img.test/twirl.jpg",
                        },
                    ],
                }}
            />,
        );
        const thumb = screen.getByRole("button", {
            name: "Show video 3: The dress, twirling, 0:24",
        });
        expect(thumb).toHaveTextContent("0:24");
        fireEvent.click(thumb);
        const video = container.querySelector("video");
        expect(video).toHaveAttribute("src", "https://img.test/twirl.mov");
        expect(video).toHaveAttribute("poster", "https://img.test/twirl.jpg");

        if (!video) throw new Error("No video on the page");
        fireEvent.error(video);
        expect(container.querySelector("video")).toBeNull();
        expect(
            screen.getByRole("img", { name: "The dress, twirling" }),
        ).toHaveAttribute("src", "https://img.test/twirl.jpg");
        expect(
            screen.getByRole("link", { name: "Open video" }),
        ).toHaveAttribute("href", "https://img.test/twirl.mov");
    });
});
