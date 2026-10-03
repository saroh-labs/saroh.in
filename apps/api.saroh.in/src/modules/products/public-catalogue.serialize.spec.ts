import { hashClientIp } from "../../common/client-ip";
import { signSiteRelay, visitorKey } from "../site-accounts/site-relay";
import {
    allergenText,
    blurbOf,
    fieldText,
    madeByLine,
    onTheShop,
    priceOf,
    publicStock,
    shelfFor,
} from "./public-catalogue.serialize";

/** The public catalogue's allow-list rules (G11), pure. */
describe("publicStock", () => {
    const row = (onHand: number, promised: number, lowStockAlert = 3) => ({
        productId: "p1",
        variantId: null,
        onHand,
        promised,
        lowStockAlert,
    });

    it("says Sold out when on hand equals promised", () => {
        expect(
            publicStock({
                tracked: true,
                markedSoldOut: false,
                row: row(4, 4),
            }),
        ).toEqual({ word: "SOLD_OUT", left: null });
    });

    it("gives a number only at or under the warning level", () => {
        expect(
            publicStock({
                tracked: true,
                markedSoldOut: false,
                row: row(5, 3),
            }),
        ).toEqual({ word: "LOW", left: 2 });
        expect(
            publicStock({
                tracked: true,
                markedSoldOut: false,
                row: row(40, 0),
            }),
        ).toEqual({ word: "IN_STOCK", left: null });
    });

    it("reads a tracked line with no shelf here as nothing to sell", () => {
        expect(
            publicStock({
                tracked: true,
                markedSoldOut: false,
                row: undefined,
            }),
        ).toEqual({ word: "SOLD_OUT", left: null });
    });

    it("says nothing about an untracked product unless it was marked Sold out by hand", () => {
        expect(
            publicStock({
                tracked: false,
                markedSoldOut: false,
                row: row(0, 0),
            }),
        ).toEqual({ word: "UNTRACKED", left: null });
        expect(
            publicStock({
                tracked: false,
                markedSoldOut: true,
                row: undefined,
            }),
        ).toEqual({ word: "SOLD_OUT", left: null });
    });
});

describe("shelfFor", () => {
    const rows = [
        {
            productId: "p1",
            variantId: null,
            onHand: 1,
            promised: 0,
            lowStockAlert: 0,
        },
        {
            productId: "p1",
            variantId: "v1",
            onHand: 2,
            promised: 0,
            lowStockAlert: 0,
        },
        {
            productId: "p2",
            variantId: null,
            onHand: 3,
            promised: 0,
            lowStockAlert: 0,
        },
    ];
    it("prefers the variant's own shelf, then the product's whole one", () => {
        expect(shelfFor(rows, "p1", "v1")?.onHand).toBe(2);
        expect(shelfFor(rows, "p1", "v2")?.onHand).toBe(1);
        expect(shelfFor(rows, "p2", null)?.onHand).toBe(3);
        expect(shelfFor(rows, "p3", null)).toBeUndefined();
    });
});

describe("priceOf", () => {
    it("shows the cheapest line, 'from' when lines differ", () => {
        expect(
            priceOf({ price: "300.00", mrp: null }, [
                { price: "450.00", mrp: "500.00" },
                { price: null, mrp: null },
            ]),
        ).toEqual({ price: "300.00", mrp: null, priceFrom: true });
        expect(
            priceOf({ price: "300.00", mrp: "350.00" }, [
                { price: null, mrp: null },
            ]),
        ).toEqual({ price: "300.00", mrp: "350.00", priceFrom: false });
        expect(priceOf({ price: "90.00", mrp: null }, [])).toEqual({
            price: "90.00",
            mrp: null,
            priceFrom: false,
        });
    });
});

describe("blurbOf", () => {
    it("keeps two sentences of plain words", () => {
        expect(
            blurbOf(
                "<p>Slow rye. Baked at dawn &amp; sold by noon.</p><p>Keeps a week.</p>",
            ),
        ).toBe("Slow rye. Baked at dawn & sold by noon.");
        expect(blurbOf(null)).toBeNull();
        expect(blurbOf("<p> </p>")).toBeNull();
        expect(blurbOf(`<p>${"a".repeat(300)}</p>`)?.length).toBe(158);
    });

    it("unescapes once: an escaped entity stays as its own text", () => {
        expect(blurbOf("<p>Write &amp;lt;b&amp;gt; for bold.</p>")).toBe(
            "Write &lt;b&gt; for bold.",
        );
        expect(blurbOf("<p>Salt &amp;amp; pepper.</p>")).toBe(
            "Salt &amp; pepper.",
        );
    });
});

describe("details", () => {
    it("reads a custom field and the allergens as people do", () => {
        expect(fieldText("YES_NO", "true")).toBe("Yes");
        expect(fieldText("DATE", "2026-09-24")).toBe("24 Sep 2026");
        expect(fieldText("TEXT", "Stone-milled")).toBe("Stone-milled");
        expect(
            allergenText([
                { kind: "CONTAINS", name: "Gluten" },
                { kind: "MAY_CONTAIN", name: "Sesame" },
            ]),
        ).toBe("Contains gluten. May contain sesame.");
        expect(allergenText([])).toBeNull();
    });

    it("shows a detail unless the merchant switched it off", () => {
        expect(onTheShop({ warranty: false }, "warranty")).toBe(false);
        expect(onTheShop({}, "warranty")).toBe(true);
        expect(onTheShop(null, "warranty")).toBe(true);
    });
});

describe("madeByLine (P5)", () => {
    it("names the product's maker and where it is made", () => {
        expect(
            madeByLine({
                maker: "Tanvi Studio",
                madeIn: "Jaipur",
                shopFields: {},
            }),
        ).toBe("Tanvi Studio, Jaipur");
        expect(
            madeByLine({ maker: "Kama Labs", madeIn: null, shopFields: null }),
        ).toBe("Kama Labs");
    });

    it("hides the row when nothing is set: never the storefront's name", () => {
        // A product made here has no maker (the editor clears it).
        expect(
            madeByLine({ maker: null, madeIn: null, shopFields: {} }),
        ).toBeNull();
        expect(
            madeByLine({ maker: "  ", madeIn: "", shopFields: {} }),
        ).toBeNull();
    });

    it("leaves out what the merchant switched off the shop", () => {
        expect(
            madeByLine({
                maker: "Tanvi Studio",
                madeIn: "Jaipur",
                shopFields: { maker: false },
            }),
        ).toBe("Jaipur");
        expect(
            madeByLine({
                maker: "Tanvi Studio",
                madeIn: "Jaipur",
                shopFields: { maker: false, madeIn: false },
            }),
        ).toBeNull();
    });
});

describe("visitorKey", () => {
    const SECRET = "test-relay-secret";
    const secret = () => SECRET;

    it("counts the relayed visitor when the relay checks", () => {
        const relay = signSiteRelay(
            { address: "203.0.113.7", host: "rye.saroh.app" },
            SECRET,
        );
        expect(visitorKey("10.0.0.1", relay, secret)).toBe(
            hashClientIp("203.0.113.7"),
        );
    });

    it("counts the caller's own address when the relay is forged or missing", () => {
        const forged = signSiteRelay(
            { address: "203.0.113.7", host: "rye.saroh.app" },
            "someone-elses-secret",
        );
        expect(visitorKey("10.0.0.1", forged, secret)).toBe(
            hashClientIp("10.0.0.1"),
        );
        expect(visitorKey("10.0.0.1", undefined, secret)).toBe(
            hashClientIp("10.0.0.1"),
        );
    });

    it("counts the caller when this instance has no relay secret", () => {
        const relay = signSiteRelay(
            { address: "203.0.113.7", host: "rye.saroh.app" },
            SECRET,
        );
        const missing = () => {
            throw new Error("SITE_RELAY_SECRET is not set");
        };
        expect(visitorKey("10.0.0.1", relay, missing)).toBe(
            hashClientIp("10.0.0.1"),
        );
    });
});
