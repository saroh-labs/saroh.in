import { describe, expect, it } from "vitest";

import type { ShareItem } from "./share";
import {
    cardFileName,
    cardImageUrl,
    cardsFor,
    facebookHref,
    shareSwatches,
    taggedLink,
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
        expect(cardsFor(BUNS)).toEqual(["photo", "price", "simple", "colour"]);
        const onOffer = { ...BUNS, offerId: "disc_1" };
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

    it("tags the link so a visit from a post is counted, keeping its own query", () => {
        expect(taggedLink(BUNS.url)).toBe(
            "https://rye.example.com/shop/cardamom-bun-box?utm_source=saroh-share&utm_medium=social",
        );
        expect(taggedLink("https://rye.example.com/book?service=sv_1")).toBe(
            "https://rye.example.com/book?service=sv_1&utm_source=saroh-share&utm_medium=social",
        );
    });

    it("keeps the link at the caption's end, whatever was typed", () => {
        const link = taggedLink(BUNS.url);
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

    it("starts captions from the name, price and link; no price, no With price", () => {
        const link = "https://l.example/x";
        expect(captionFor("price", BUNS, link)).toBe(
            `Cardamom bun box, for ₹360. Order here: ${link}`,
        );
        expect(captionFor("short", BUNS, link)).toBe(
            `Cardamom bun box. See it here: ${link}`,
        );
        expect(captionFor("hinglish", BUNS, link)).toBe(
            `Cardamom bun box ab available hai sirf ₹360 mein. Order karne ke liye yahan dekhein: ${link}`,
        );
        const free = { ...BUNS, kind: "service" as const, price: null };
        expect(captionKinds(free, true)).toEqual(["short", "hinglish"]);
        expect(captionFor("short", free, link)).toBe(
            `Cardamom bun box. Book here: ${link}`,
        );
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
        expect(cardsFor(book)).toEqual(["colour", "photo", "simple"]);
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

    it("draws the colour row's swatches from the site's own colours and their tints", () => {
        const swatches = shareSwatches(["#3E5A45", "#b5532a", "nope"]);
        expect(swatches.slice(0, 2)).toEqual(["#3e5a45", "#b5532a"]);
        expect(swatches).toHaveLength(6);
        expect(new Set(swatches).size).toBe(6);
        for (const hex of swatches) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
        expect(
            shareSwatches([
                "#111111",
                "#222222",
                "#333333",
                "#444444",
                "#555555",
            ]),
        ).toHaveLength(8);
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
        expect(captionFor("summary", post, link)).toBe(
            `How we shape a bun: Four folds and a long rest. Read it here: ${link}`,
        );
        expect(captionFor("short", post, link)).toBe(
            `How we shape a bun. Read it here: ${link}`,
        );
        const book = { ...post, kind: "book" as const, name: "Book your slot" };
        expect(captionFor("short", book, link)).toBe(
            `Book your slot. Book here: ${link}`,
        );
    });

    it("names the file after the item, card and size", () => {
        expect(cardFileName(BUNS, "price", "post")).toBe(
            "cardamom-bun-box-price-post.png",
        );
    });
});
