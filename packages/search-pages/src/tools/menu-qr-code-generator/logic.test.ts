import { describe, expect, it } from "vitest";

import { decodeQr } from "../../test-qr";
import {
    cardFavourites,
    isDriveLink,
    menuLinkProblem,
    shortLink,
} from "./logic";

describe("the menu QR code", () => {
    it("holds the menu link exactly as pasted", () => {
        const link = "https://example.com/northwind-bakes/menu";
        expect(menuLinkProblem(link)).toBeNull();
        expect(decodeQr(link)).toBe(link);
        expect(shortLink(link)).toBe("example.com/northwind-bakes/menu");
    });

    it("asks for a full link, and flags a Drive file's sharing", () => {
        expect(menuLinkProblem("northwind menu pdf")).toBe("not-link");
        expect(isDriveLink("https://drive.google.com/file/d/abc/view")).toBe(
            true,
        );
        expect(isDriveLink("https://example.com/menu")).toBe(false);
    });

    it("prints up to 8 named favourites, with Indian rupee prices", () => {
        const rows = [
            { name: "Masala chai", price: "40" },
            { name: "", price: "50" },
            { name: "Banana walnut loaf", price: "1200" },
            { name: "Paneer puff", price: "" },
            ...Array.from({ length: 8 }, (_, i) => ({
                name: `Item ${i}`,
                price: "10",
            })),
        ];
        const card = cardFavourites(rows);
        expect(card).toHaveLength(8);
        expect(card.slice(0, 3)).toEqual([
            { name: "Masala chai", price: "₹40" },
            { name: "Banana walnut loaf", price: "₹1,200" },
            { name: "Paneer puff", price: null },
        ]);
    });
});
