import type { RenderedGallery } from "@saroh/block-contract";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ShopListingCard } from "../product/shop-listing";
import GallerySection from "./gallery";
import type { PublicService } from "./service-words";

const colour: PublicService = {
    id: "svc_colour",
    name: "Global colour",
    description: null,
    durationMinutes: 120,
    priceCents: 380000,
    currency: "INR",
};

const kurta: ShopListingCard = {
    slug: "linen-kurta",
    name: "Linen kurta",
    currency: "INR",
    price: "2400.00",
    mrp: null,
    priceFrom: false,
    image: null,
    variantTitles: [],
    blurb: null,
    soldOut: true,
};

const content: RenderedGallery = {
    variant: "lookbook",
    images: [
        {
            src: "https://cdn.test/copper.jpg",
            alt: "Copper hair",
            name: "Soft copper",
            link: { kind: "service", serviceId: "svc_colour" },
        },
        {
            src: "https://cdn.test/kurta.jpg",
            alt: "A linen kurta",
            name: "Linen, cut to fit",
            link: { kind: "product", productId: "prod_kurta" },
        },
        {
            src: "",
            name: "Fresh roots",
            link: { kind: "service", serviceId: "svc_gone" },
        },
    ],
};

describe("Gallery Lookbook (DEC-228, U5)", () => {
    function draw(look?: "folio" | "quiet" | "live") {
        return render(
            <GallerySection
                content={content}
                look={look}
                bookHref="/book"
                linked={{
                    services: [colour],
                    products: { prod_kurta: kurta },
                }}
            />,
        );
    }

    it("a service look reads its price and books it", () => {
        draw();
        expect(screen.getByText("Soft copper")).toBeTruthy();
        expect(screen.getByText("Global colour")).toBeTruthy();
        expect(screen.getByText("₹3,800")).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "Book: Soft copper" })
                .getAttribute("href"),
        ).toBe("/book?service=svc_colour");
    });

    it("a sold-out product says so and keeps See the product", () => {
        draw();
        expect(screen.getByText("Sold out")).toBeTruthy();
        expect(
            screen
                .getByRole("link", {
                    name: "See the product: Linen, cut to fit",
                })
                .getAttribute("href"),
        ).toBe("/shop/linen-kurta");
        const photo = screen.getByAltText("A linen kurta");
        expect(photo.closest("[data-site-photo='product']")).toBeTruthy();
    });

    it("a gone service keeps its name with no price and no Book; no photo is a colour field", () => {
        draw();
        expect(screen.getByText("Fresh roots")).toBeTruthy();
        expect(screen.getAllByRole("link")).toHaveLength(2);
    });

    it("draws the same under a look", () => {
        draw("quiet");
        expect(document.querySelector("[data-gallery-lookbook]")).toBeTruthy();
        expect(document.querySelectorAll("[data-lookbook-item]")).toHaveLength(
            3,
        );
    });

    it("the owner's typed price wins over the read one", () => {
        render(
            <GallerySection
                content={{
                    variant: "lookbook",
                    images: [
                        {
                            src: "https://cdn.test/a.jpg",
                            name: "A",
                            fromPrice: "From ₹1,800",
                            link: { kind: "service", serviceId: "svc_colour" },
                        },
                    ],
                }}
                linked={{ services: [colour], products: {} }}
            />,
        );
        expect(screen.getByText("From ₹1,800")).toBeTruthy();
        expect(screen.queryByText("₹3,800")).toBeNull();
    });
});
