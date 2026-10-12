import {
    payEachOf,
    publicPackView,
    singlePayOf,
    singlePriceOf,
} from "./public-packs.service";

/**
 * G20 — a pack as the site shows it, and the one class's price it is
 * compared with. Pure; the real rows are in public-packs.db.spec.ts.
 */

function covered(
    priceCents: number | null,
    over: {
        currency?: string | null;
        status?: string;
        deleted?: boolean;
        gstRate?: string | null;
        gstPriceMode?: string | null;
    } = {},
) {
    return {
        service: {
            priceCents,
            currency: over.currency === undefined ? "INR" : over.currency,
            status: over.status ?? "ACTIVE",
            deletedAt: over.deleted ? new Date() : null,
            gstRate: over.gstRate ?? null,
            gstPriceMode: over.gstPriceMode ?? null,
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
            // The two sides of "₹450 a class instead of ₹500", as what is
            // paid: with no GST on top they are the typed figures.
            payEach: "450.00",
            singlePay: "500.00",
            // No rate on the pack: nothing is said about GST.
            gst: null,
        });
    });

    // 12 Oct 2026: two figures compared are the same kind, both amounts
    // to pay. A 10-class pack at ₹4,500 against a ₹600 class, both 18%.
    describe("a class in the pack against a class alone", () => {
        const pack = {
            ...row,
            gstRate: "18",
            services: [covered(60_000, { gstRate: "18" })],
        };

        it("GST is added: ₹531 a class instead of ₹708", () => {
            const view = publicPackView(pack, {
                registered: true,
                mode: "ADDED",
            });
            // ₹4,500 + ₹810 is ₹5,310 for 10; ₹600 + ₹108 is ₹708.
            expect(view.payEach).toBe("531.00");
            expect(view.singlePay).toBe("708.00");
            // The typed figures stay as they were, for an older site.
            expect(view.price).toBe("4500.00");
            expect(view.singlePrice).toBe("600.00");
        });

        it("prices include GST: ₹450 a class instead of ₹600, to the paisa as before", () => {
            const view = publicPackView(pack, {
                registered: true,
                mode: "INCLUDED",
            });
            expect(view.payEach).toBe("450.00");
            expect(view.singlePay).toBe("600.00");
        });

        it("not registered: ₹450 a class instead of ₹600, whatever the rates", () => {
            const view = publicPackView(pack);
            expect(view.payEach).toBe("450.00");
            expect(view.singlePay).toBe("600.00");
        });

        it("a class priced its own way is compared by what it costs to pay", () => {
            // The business adds GST, but this class's price includes it.
            const view = publicPackView(
                {
                    ...pack,
                    services: [
                        covered(60_000, {
                            gstRate: "18",
                            gstPriceMode: "INCLUDED",
                        }),
                    ],
                },
                { registered: true, mode: "ADDED" },
            );
            expect(view.payEach).toBe("531.00");
            expect(view.singlePay).toBe("600.00");
        });

        it("the cheapest class is the cheapest to pay, not the cheapest typed", () => {
            // ₹560 with 18% added is ₹660.80; ₹600 with GST inside is ₹600.
            expect(
                singlePayOf(
                    "INR",
                    [
                        covered(56_000, { gstRate: "18" }),
                        covered(60_000, {
                            gstRate: "18",
                            gstPriceMode: "INCLUDED",
                        }),
                    ],
                    { registered: true, mode: "ADDED" },
                ),
            ).toBe("600.00");
        });

        it("rounds a class's share to the whole rupee, half up", () => {
            expect(payEachOf(531_000, 10)).toBe("531.00");
            // ₹1,000 for 3 is ₹333.33; ₹1,001.50 for 2 is ₹500.75.
            expect(payEachOf(100_000, 3)).toBe("333.00");
            expect(payEachOf(100_150, 2)).toBe("501.00");
            expect(payEachOf(100_000, 0)).toBeNull();
        });
    });

    it("says the GST a customer pays, by the business's choice (12 Oct 2026)", () => {
        const rated = { ...row, gstRate: "18" };
        // Not registered: never said.
        expect(publicPackView(rated).gst).toBeNull();
        // Includes GST: ₹4,500 to pay, ₹686.44 of it GST.
        expect(
            publicPackView(rated, { registered: true, mode: "INCLUDED" }).gst,
        ).toEqual({
            mode: "INCLUDED",
            rate: "18",
            listCents: 450_000,
            gstCents: 68_644,
            payCents: 450_000,
        });
        // GST is added: ₹4,500 + ₹810 is ₹5,310 to pay.
        const added = publicPackView(rated, {
            registered: true,
            mode: "ADDED",
        });
        expect(added.price).toBe("4500.00");
        expect(added.gst).toEqual({
            mode: "ADDED",
            rate: "18",
            listCents: 450_000,
            gstCents: 81_000,
            payCents: 531_000,
        });
    });

    it("reads an unknown kind as classes", () => {
        expect(publicPackView({ ...row, kind: "ONE_TO_ONE" }).kind).toBe(
            "ONE_TO_ONE",
        );
        expect(publicPackView({ ...row, kind: "OTHER" }).kind).toBe("CLASSES");
    });
});
