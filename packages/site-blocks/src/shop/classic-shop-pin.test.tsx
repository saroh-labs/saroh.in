import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProductPageData } from "../product/product-page";
import ProductPage from "../product/product-page";
import { SheetFrame } from "./sheet-frame";

/**
 * Classic's shop, pinned (DEC-172, plan U11, #1102). A site with no look
 * draws its product page and its bag sheet exactly as before looks: these
 * snapshots were written from the code before U11's look branches landed,
 * so a change here is a change to every live shop.
 */

const product: ProductPageData = {
    name: "Country sourdough",
    currency: "INR",
    price: "280.00",
    mrp: "320.00",
    categoryName: "Bread",
    description: "Slow, three-day loaf.",
    keyPoints: ["Wild yeast"],
    howToUse: null,
    materials: null,
    maker: null,
    warranty: null,
    returns: null,
    images: [
        {
            id: "img-1",
            kind: "photo",
            url: "https://example.com/bread.jpg",
            alt: "A loaf",
        },
    ],
    optionName: "Whole or sliced",
    variants: [
        {
            id: "v-whole",
            title: "Whole",
            price: null,
            mrp: null,
            imageId: null,
            stock: "IN_STOCK",
            left: null,
        },
        {
            id: "v-sliced",
            title: "Sliced",
            price: null,
            mrp: null,
            imageId: null,
            stock: "IN_STOCK",
            left: null,
        },
    ],
    stock: null,
    rating: null,
    reviews: [],
};

describe("Classic's shop is pinned", () => {
    it("the product page, with a photo and options", () => {
        expect(
            renderToStaticMarkup(
                <ProductPage
                    product={product}
                    preview={false}
                    action={<button type="button">Add</button>}
                />,
            ),
        ).toMatchSnapshot();
    });

    it("the product page, with no photo", () => {
        expect(
            renderToStaticMarkup(
                <ProductPage
                    product={{ ...product, images: [] }}
                    preview={false}
                />,
            ),
        ).toMatchSnapshot();
    });

    it("the bag's sheet", () => {
        expect(
            renderToStaticMarkup(
                <SheetFrame
                    title="Your bag"
                    onClose={() => undefined}
                    footer={<p>foot</p>}
                >
                    <p>lines</p>
                </SheetFrame>,
            ),
        ).toMatchSnapshot();
    });
});
