import { describe, expect, it } from "vitest";

import { inStorefront, mergeCustomers } from "./directory";
import type { CustomerListItem } from "./service";

/**
 * The merge is where a business's customer list is decided: one person who
 * buys at two storefronts is one row, their orders added up — and their money
 * added up only where it is the same currency.
 */

const STORES = [
    { id: "market", name: "Market stall" },
    { id: "trade", name: "Trade counter" },
];

function customer(over: Partial<CustomerListItem> = {}): CustomerListItem {
    return {
        id: "cus_1",
        email: "priya@example.com",
        firstName: "Priya",
        lastName: "Raman",
        phone: null,
        country: null,
        state: null,
        city: null,
        zipCode: null,
        orderCount: 1,
        spent: "500.00",
        currency: "INR",
        mixedCurrency: false,
        lastOrderAt: "2026-06-01T00:00:00.000Z",
        ...over,
    };
}

describe("mergeCustomers", () => {
    it("makes one row of a person who buys at two storefronts", () => {
        const rows = mergeCustomers(STORES, {
            market: [customer({ orderCount: 2, spent: "500.00" })],
            trade: [
                customer({
                    id: "cus_2",
                    email: "PRIYA@example.com",
                    orderCount: 1,
                    spent: "250.50",
                    lastOrderAt: "2026-07-01T00:00:00.000Z",
                }),
            ],
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            name: "Priya Raman",
            orderCount: 3,
            spent: "750.50",
            currency: "INR",
            lastOrderAt: "2026-07-01T00:00:00.000Z",
        });
        expect(rows[0]?.places.map((p) => p.storeName)).toEqual([
            "Market stall",
            "Trade counter",
        ]);
    });

    it("marks a subset rather than adding two currencies", () => {
        const rows = mergeCustomers(STORES, {
            market: [customer({ spent: "500.00", currency: "INR" })],
            trade: [
                customer({
                    id: "cus_2",
                    spent: "40.00",
                    currency: "USD",
                }),
            ],
        });

        expect(rows[0]?.spent).toBe("500.00");
        expect(rows[0]?.currency).toBe("INR");
        expect(rows[0]?.mixedCurrency).toBe(true);
    });

    it("falls back to the email when no name was given", () => {
        const rows = mergeCustomers(STORES, {
            market: [customer({ firstName: null, lastName: null })],
            trade: [],
        });

        expect(rows[0]?.name).toBe("priya@example.com");
    });

    it("puts the most recent buyer first and someone who never ordered last", () => {
        const rows = mergeCustomers(STORES, {
            market: [
                customer({
                    email: "old@example.com",
                    lastOrderAt: "2026-01-01T00:00:00.000Z",
                }),
                customer({
                    email: "new@example.com",
                    lastOrderAt: "2026-08-01T00:00:00.000Z",
                }),
                customer({
                    email: "never@example.com",
                    orderCount: 0,
                    spent: null,
                    currency: null,
                    lastOrderAt: null,
                }),
            ],
            trade: [],
        });

        expect(rows.map((r) => r.email)).toEqual([
            "new@example.com",
            "old@example.com",
            "never@example.com",
        ]);
    });
});

describe("inStorefront", () => {
    it("shows what they did at one storefront, keeping where else they buy", () => {
        const [row] = mergeCustomers(STORES, {
            market: [customer({ orderCount: 2, spent: "500.00" })],
            trade: [
                customer({
                    id: "cus_2",
                    orderCount: 1,
                    spent: "250.50",
                }),
            ],
        });

        const here = inStorefront(row, "trade");

        expect(here).toMatchObject({ orderCount: 1, spent: "250.50" });
        expect(here?.places).toHaveLength(2);
    });

    it("is null for a storefront they have never bought from", () => {
        const [row] = mergeCustomers(STORES, {
            market: [customer()],
            trade: [],
        });

        expect(inStorefront(row, "trade")).toBeNull();
    });
});
