import { publicPackView, singlePriceOf } from "./public-packs.service";

/**
 * G20 — a pack as the site shows it, and the one class's price it is
 * compared with. Pure; the real rows are in public-packs.db.spec.ts.
 */

function covered(
    priceCents: number | null,
    over: { currency?: string | null; status?: string; deleted?: boolean } = {},
) {
    return {
        service: {
            priceCents,
            currency: over.currency === undefined ? "INR" : over.currency,
            status: over.status ?? "ACTIVE",
            deletedAt: over.deleted ? new Date() : null,
        },
    };
}

describe("one class's price to compare", () => {
    it("is the cheapest live, priced service the pack covers", () => {
        expect(
            singlePriceOf("INR", [
                covered(60_000),
                covered(45_000),
                covered(70_000),
            ]),
        ).toBe("450.00");
    });

    it("skips an archived, deleted, unpriced, free or other-currency service", () => {
        expect(
            singlePriceOf("INR", [
                covered(10_000, { status: "ARCHIVED" }),
                covered(10_000, { deleted: true }),
                covered(null),
                covered(0),
                covered(10_000, { currency: "USD" }),
                covered(55_000),
            ]),
        ).toBe("550.00");
    });

    it("is null when nothing it covers has a price", () => {
        expect(singlePriceOf("INR", [])).toBeNull();
        expect(singlePriceOf("INR", [covered(null)])).toBeNull();
    });
});

describe("a pack as the site shows it", () => {
    const row = {
        id: "pack_1",
        name: "10 classes",
        description: "  ",
        credits: 10,
        validityDays: 60,
        price: { toString: () => "4500" },
        currency: "INR",
        kind: "CLASSES",
        services: [covered(50_000)],
    };

    it("is an allow-list: money as a decimal, a blank description as none", () => {
        expect(publicPackView(row)).toEqual({
            id: "pack_1",
            name: "10 classes",
            description: null,
            credits: 10,
            validityDays: 60,
            price: "4500.00",
            currency: "INR",
            kind: "CLASSES",
            singlePrice: "500.00",
        });
    });

    it("reads an unknown kind as classes", () => {
        expect(publicPackView({ ...row, kind: "ONE_TO_ONE" }).kind).toBe(
            "ONE_TO_ONE",
        );
        expect(publicPackView({ ...row, kind: "OTHER" }).kind).toBe("CLASSES");
    });
});
