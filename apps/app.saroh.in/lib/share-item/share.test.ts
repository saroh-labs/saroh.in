import { describe, expect, it } from "vitest";

import type { ShareItem } from "./share";
import {
    cardFileName,
    cardImageUrl,
    cardsFor,
    colourName,
    facebookHref,
    firstStyle,
    shareSwatches,
    shownLink,
    whatsappHref,
    withLink,
} from "./share";
import { captionFor, captionKinds } from "./words";

const BUNS: ShareItem = {
    kind: "product",
    ref: "cardamom-bun-box",
    name: "Cardamom bun box",
    price: "₹360",
    url: "https://rye.example.com/shop/cardamom-bun-box",
    offerId: null,
};
const SETUP = { apiOrigin: "https://api.example.com/", siteId: "site_1" };

describe("share as a post (#1375 U2)", () => {
    it("asks the API for the card's style and size", () => {
        expect(cardImageUrl(SETUP, BUNS, "price", "story")).toBe(
            "https://api.example.com/public/share/site_1/product/cardamom-bun-box/image?style=price&size=story",
        );
    });

    it("draws the Offer card only with a live offer, from the offer itself, for this product", () => {
        // No photo of its own, no Photo or Price tag: the API would draw a letter.
        expect(cardsFor(BUNS)).toEqual(["simple", "colour"]);
        expect(firstStyle(BUNS)).toBe("simple");
        expect(firstStyle({ ...BUNS, hasPhoto: true })).toBe("price");
        const onOffer = { ...BUNS, offerId: "disc_1", hasPhoto: true };
        expect(cardsFor(onOffer)).toEqual([
            "photo",
            "price",
            "offer",
            "simple",
            "colour",
        ]);
        // The product being shared rides with the offer, so a discount on
        // several draws this one.
        expect(cardImageUrl(SETUP, onOffer, "offer", "post")).toBe(
            "https://api.example.com/public/share/site_1/offer/disc_1/image?style=offer&size=post&product=cardamom-bun-box",
        );
        // The other cards still draw the product.
        expect(cardImageUrl(SETUP, onOffer, "photo", "post")).toContain(
            "/product/cardamom-bun-box/",
        );
    });

    it("names the link without its scheme or query, for the caption's chip", () => {
        expect(shownLink(BUNS.url)).toBe(
            "rye.example.com/shop/cardamom-bun-box",
        );
        expect(shownLink("https://rye.example.com/book?service=sv_1")).toBe(
            "rye.example.com/book",
        );
        expect(shownLink("https://rye.example.com/")).toBe("rye.example.com");
    });

    it("names swatches by colour, never by hex", () => {
        expect(colourName("#3e5a45")).toBe("Deep green");
        expect(colourName("#b5532a")).toBe("Orange");
        expect(colourName("#f4ebdd")).toBe("Cream");
        expect(colourName("#d9d6cc")).toBe("Stone");
        expect(colourName("#1c1c1a")).toBe("Black");
        expect(colourName("#f2b896")).toBe("Light orange");
        expect(colourName("nope")).toBe("Colour");
    });

    it("keeps the link at the caption's end, whatever was typed", () => {
        const link = BUNS.url;
        expect(withLink("Fresh buns.", link)).toBe(`Fresh buns. ${link}`);
        expect(withLink(`Fresh buns. ${link}`, link)).toBe(
            `Fresh buns. ${link}`,
        );
        expect(withLink("  ", link)).toBe(link);
    });

    it("encodes the caption for WhatsApp and the link for Facebook", () => {
        const text = "Buns & tea, ₹360? https://x.example/a?b=1&c=2";
        expect(whatsappHref(text)).toBe(
            `https://wa.me/?text=${encodeURIComponent(text)}`,
        );
        expect(decodeURIComponent(whatsappHref(text).split("text=")[1])).toBe(
            text,
        );
        expect(facebookHref("https://x.example/a?b=1&c=2")).toBe(
            "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fx.example%2Fa%3Fb%3D1%26c%3D2",
        );
    });

    it("starts captions from the name and price, never the link; no price, no With price", () => {
        expect(captionFor("price", BUNS)).toBe(
            `Cardamom bun box, for ₹360. Order here:`,
        );
        expect(captionFor("short", BUNS)).toBe(
            `Cardamom bun box. See it here:`,
        );
        expect(captionFor("hinglish", BUNS)).toBe(
            `Cardamom bun box ab available hai sirf ₹360 mein. Order karne ke liye yahan dekhein:`,
        );
        const free = { ...BUNS, kind: "service" as const, price: null };
        expect(captionKinds(free, true)).toEqual(["short", "hinglish"]);
        expect(captionFor("short", free)).toBe(`Cardamom bun box. Book here:`);
    });

    it("offers each kind its own cards (owner, 12 Nov 2026)", () => {
        const post: ShareItem = {
            kind: "post",
            ref: "how-we-shape-a-bun",
            name: "How we shape a bun",
            price: null,
            url: "https://rye.example.com/blog/how-we-shape-a-bun",
            offerId: null,
        };
        expect(cardsFor(post)).toEqual(["colour", "simple"]);
        expect(cardsFor({ ...post, hasPhoto: true })).toEqual([
            "photo",
            "colour",
            "simple",
        ]);
        const book = { ...post, kind: "book" as const, ref: "page" };
        expect(cardsFor(book)).toEqual(["colour", "simple"]);
        // The site's own share image, when it has one; else no letter tile.
        expect(cardsFor({ ...book, hasPhoto: true })).toEqual([
            "colour",
            "simple",
            "photo",
        ]);
        const own = { ...post, kind: "own" as const, ref: "sp_1" };
        expect(cardsFor(own)).toEqual(["colour", "simple"]);
        expect(cardsFor({ ...own, hasPhoto: true })).toEqual([
            "colour",
            "simple",
            "photo",
        ]);
        expect(cardImageUrl(SETUP, own, "colour", "post")).toBe(
            "https://api.example.com/public/share/own/sp_1/image?style=colour&size=post",
        );
    });

    it("sends a picked colour, the booking headline and a thumbnail width", () => {
        const book: ShareItem = {
            kind: "book",
            ref: "page",
            name: "your booking page",
            price: null,
            url: "https://rye.example.com/book",
            offerId: null,
        };
        const path = cardImageUrl(SETUP, book, "colour", "story", {
            bg: "#3e5a45",
            headline: "  Cake consults open  ",
            w: 240,
        });
        // The app's own signed-in route: a headline is never in a public address.
        expect(path.startsWith("/api/share/book/image?")).toBe(true);
        const url = new URL(path, "https://app.example.com");
        expect(url.searchParams.get("bg")).toBe("#3e5a45");
        expect(url.searchParams.get("headline")).toBe("Cake consults open");
        expect(url.searchParams.get("w")).toBe("240");
        // A headline is the booking page's only; site colours send no bg.
        const bun = new URL(
            cardImageUrl(SETUP, BUNS, "photo", "post", { headline: "x" }),
        );
        expect(bun.searchParams.has("headline")).toBe(false);
        expect(bun.searchParams.has("bg")).toBe(false);
    });

    it("draws the colour row's swatches: one row of four, no two that look alike", () => {
        const swatches = shareSwatches(["#3E5A45", "#b5532a", "nope"]);
        expect(swatches.slice(0, 2)).toEqual(["#3e5a45", "#b5532a"]);
        expect(swatches.length).toBeLessThanOrEqual(4);
        expect(new Set(swatches).size).toBe(swatches.length);
        for (const hex of swatches) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
        // Greys a step apart are one choice; the row never passes four.
        const greys = shareSwatches([
            "#999999",
            "#9c9c9c",
            "#a3a3a3",
            "#1c1c1a",
            "#000000",
            "#ffffff",
            "#b5532a",
            "#c25a2d",
        ]);
        expect(greys).toEqual(
            ["#999999", "#1c1c1a", "#ffffff", "#b5532a"].concat(greys.slice(4)),
        );
        expect(greys).not.toContain("#9c9c9c");
        expect(greys).not.toContain("#000000");
        expect(greys).not.toContain("#c25a2d");
        expect(shareSwatches([])).toEqual([]);
    });

    it("offers blog captions with a summary, and Hinglish only where the edition does", () => {
        const link = "https://l.example/p";
        const post: ShareItem = {
            kind: "post",
            ref: "p",
            name: "How we shape a bun",
            price: null,
            url: link,
            offerId: null,
            summary: "Four folds and a long rest.",
        };
        expect(captionKinds(post, true)).toEqual([
            "short",
            "summary",
            "hinglish",
        ]);
        expect(captionKinds(post, false)).toEqual(["short", "summary"]);
        expect(captionKinds({ ...post, summary: " " }, false)).toEqual([
            "short",
        ]);
        expect(captionKinds(BUNS, false)).toEqual(["short", "price"]);
        expect(captionFor("summary", post)).toBe(
            `How we shape a bun: Four folds and a long rest. Read it here:`,
        );
        expect(captionFor("short", post)).toBe(
            `How we shape a bun. Read it here:`,
        );
        const book = { ...post, kind: "book" as const, name: "Book your slot" };
        expect(captionFor("short", book)).toBe(`Book your slot. Book here:`);
    });

    it("names the file after the item, card and size", () => {
        expect(cardFileName(BUNS, "price", "post")).toBe(
            "cardamom-bun-box-price-post.png",
        );
    });
});
