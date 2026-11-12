import { describe, expect, it } from "vitest";

import type { ShareItem } from "./share";
import {
    cardFileName,
    cardImageUrl,
    cardsFor,
    facebookHref,
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

    it("draws the Offer card only with a live offer, from the offer itself", () => {
        expect(cardsFor(BUNS)).toEqual(["photo", "price", "simple"]);
        const onOffer = { ...BUNS, offerId: "disc_1" };
        expect(cardsFor(onOffer)).toEqual([
            "photo",
            "price",
            "offer",
            "simple",
        ]);
        expect(cardImageUrl(SETUP, onOffer, "offer", "post")).toBe(
            "https://api.example.com/public/share/site_1/offer/disc_1/image?style=offer&size=post",
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
        expect(captionKinds(free)).toEqual(["short", "hinglish"]);
        expect(captionFor("short", free, link)).toBe(
            `Cardamom bun box. Book here: ${link}`,
        );
    });

    it("names the file after the item, card and size", () => {
        expect(cardFileName(BUNS, "price", "post")).toBe(
            "cardamom-bun-box-price-post.png",
        );
    });
});
