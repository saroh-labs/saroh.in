/**
 * A staff order's lines under each way a business carries GST (12 Oct
 * 2026): `priceOrderLines` snapshots the amount to pay, the typed price and
 * the mode, so the counter, an edit and the site price the same product the
 * same way. Prisma is mocked; `price-terms.spec` style reads are below.
 */
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            product: { findFirst: jest.fn() },
            storeSettings: { findUnique: jest.fn() },
            store: { findUnique: jest.fn() },
            businessProfile: { findUnique: jest.fn() },
        },
    };
});

import { prisma } from "@saroh/database";

import type { PriceTerms } from "../invoices/gst-price";
import { NO_GST_TERMS, soldColumns } from "../invoices/gst-price";
import { loadPriceTerms } from "../invoices/price-terms";
import { priceOrderLines } from "./order-pricing";

const db = prisma as unknown as {
    product: { findFirst: jest.Mock };
    storeSettings: { findUnique: jest.Mock };
    businessProfile: { findUnique: jest.Mock };
};

const INCLUDES: PriceTerms = { registered: true, mode: "INCLUDED" };
const ADDS: PriceTerms = { registered: true, mode: "ADDED" };

const serum = (over: Record<string, unknown> = {}) => ({
    name: "Face serum",
    price: "1000.00",
    currency: "INR",
    status: "PUBLISHED",
    categoryId: null,
    fulfilmentTypes: [],
    gstRate: "18",
    gstPriceMode: null,
    variants: [],
    ...over,
});

const one = [{ productId: "p_1", quantity: 2 }];

beforeEach(() => {
    jest.clearAllMocks();
    db.storeSettings.findUnique.mockResolvedValue({ currency: "INR" });
    db.product.findFirst.mockResolvedValue(serum());
});

describe("priceOrderLines", () => {
    it("an existing registered business: the line is the typed price", async () => {
        const [line] = await priceOrderLines("store_1", one, INCLUDES);
        expect(line).toMatchObject({
            priceCents: 100_000,
            listCents: 100_000,
            gstPriceMode: "INCLUDED",
            quantity: 2,
        });
        expect(soldColumns({ listCents: 100_000, mode: "INCLUDED" })).toEqual({
            gstPriceMode: "INCLUDED",
            listPrice: "1000.00",
        });
    });

    it("'GST is added': the line is ₹1,180, with ₹1,000 kept as what was typed", async () => {
        const [line] = await priceOrderLines("store_1", one, ADDS);
        expect(line).toMatchObject({
            priceCents: 118_000,
            listCents: 100_000,
            gstPriceMode: "ADDED",
        });
        expect(
            soldColumns({
                listCents: line!.listCents,
                mode: line!.gstPriceMode,
            }),
        ).toEqual({ gstPriceMode: "ADDED", listPrice: "1000.00" });
    });

    it("a product's own choice wins over the business's", async () => {
        db.product.findFirst.mockResolvedValue(
            serum({ gstPriceMode: "INCLUDED" }),
        );
        const [kept] = await priceOrderLines("store_1", one, ADDS);
        expect(kept?.priceCents).toBe(100_000);
        db.product.findFirst.mockResolvedValue(
            serum({ gstPriceMode: "ADDED" }),
        );
        const [added] = await priceOrderLines("store_1", one, INCLUDES);
        expect(added?.priceCents).toBe(118_000);
    });

    it("an option's own price is the one GST is added to", async () => {
        db.product.findFirst.mockResolvedValue(
            serum({
                variants: [
                    { id: "v_1", price: "99.99", listings: [{ id: "lv_1" }] },
                ],
            }),
        );
        const [line] = await priceOrderLines(
            "store_1",
            [{ productId: "p_1", variantId: "v_1", quantity: 7 }],
            ADDS,
        );
        // ₹99.99 + ₹18.00 = ₹117.99 each.
        expect(line).toMatchObject({
            priceCents: 11_799,
            listCents: 9_999,
            variantId: "v_1",
        });
    });

    it("a business that charges no GST: the typed price, and nothing recorded", async () => {
        const [line] = await priceOrderLines("store_1", one, NO_GST_TERMS);
        expect(line).toMatchObject({
            priceCents: 100_000,
            listCents: 100_000,
            gstPriceMode: null,
        });
        expect(soldColumns({ listCents: 100_000, mode: null })).toEqual({
            gstPriceMode: null,
            listPrice: null,
        });
    });

    it("no rate chosen, or exempt: nothing is added even where GST is added", async () => {
        for (const gstRate of [null, "0"]) {
            db.product.findFirst.mockResolvedValue(serum({ gstRate }));
            const [line] = await priceOrderLines("store_1", one, ADDS);
            expect(line).toMatchObject({
                priceCents: 100_000,
                gstPriceMode: null,
            });
        }
    });

    it("asks for the product's rate and its own mode", async () => {
        await priceOrderLines("store_1", one, ADDS);
        expect(db.product.findFirst.mock.calls[0][0].select).toMatchObject({
            gstRate: true,
            gstPriceMode: true,
        });
    });
});

describe("loadPriceTerms", () => {
    const row = (over: Record<string, unknown> = {}) => ({
        gstRegistered: true,
        gstState: "29",
        taxId: "29AAGCR4375J1ZU",
        gstPriceMode: "ADDED",
        ...over,
    });

    it("reads a registered business's choice", async () => {
        db.businessProfile.findUnique.mockResolvedValue(row());
        await expect(loadPriceTerms(prisma, "org_1")).resolves.toEqual({
            registered: true,
            mode: "ADDED",
        });
    });

    it("every business from before the choice includes GST", async () => {
        db.businessProfile.findUnique.mockResolvedValue(
            row({ gstPriceMode: "INCLUDED" }),
        );
        await expect(loadPriceTerms(prisma, "org_1")).resolves.toEqual({
            registered: true,
            mode: "INCLUDED",
        });
    });

    it("is not registered without the switch, a GSTIN and a state, as the paper judges it", async () => {
        for (const missing of [
            { gstRegistered: false },
            { taxId: null },
            { gstState: null },
        ]) {
            db.businessProfile.findUnique.mockResolvedValue(row(missing));
            await expect(loadPriceTerms(prisma, "org_1")).resolves.toEqual({
                registered: false,
                mode: "ADDED",
            });
        }
    });

    it("a business with no profile charges no GST", async () => {
        db.businessProfile.findUnique.mockResolvedValue(null);
        await expect(loadPriceTerms(prisma, "org_1")).resolves.toEqual({
            registered: false,
            mode: "INCLUDED",
        });
    });
});
