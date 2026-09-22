import type { RawCustomer, RawCustomerOrder } from "./serialize";
import { serializeCustomerListItem } from "./serialize";

/**
 * The aggregation is the part worth testing: what counts as "spent", what
 * happens when a customer has paid in two currencies, and that the money is
 * summed as cents rather than as floats (0.1 + 0.2 is the classic way a total
 * becomes 0.30000000000000004 on a merchant's screen).
 */

const base: Omit<RawCustomer, "orders"> = {
    id: "cus_1",
    storeId: "store_1",
    email: "priya@example.com",
    firstName: "Priya",
    lastName: "Raman",
    phone: null,
    country: null,
    state: null,
    city: null,
    zipCode: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const order = (o: Partial<RawCustomerOrder>): RawCustomerOrder => ({
    total: "10.00",
    currency: "INR",
    paymentStatus: "PAID",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    ...o,
});

describe("serializeCustomerListItem", () => {
    it("reports nothing spent for a customer who has never ordered", () => {
        const row = serializeCustomerListItem({ ...base, orders: [] });

        expect(row.orderCount).toBe(0);
        expect(row.spent).toBeNull();
        expect(row.currency).toBeNull();
        expect(row.lastOrderAt).toBeNull();
        expect(row.mixedCurrency).toBe(false);
    });

    it("sums only paid orders, but counts every one", () => {
        const row = serializeCustomerListItem({
            ...base,
            orders: [
                order({ total: "1250.50" }),
                order({ total: "99.50" }),
                order({ total: "4000.00", paymentStatus: "UNPAID" }),
            ],
        });

        expect(row.orderCount).toBe(3);
        expect(row.spent).toBe("1350.00");
        expect(row.currency).toBe("INR");
    });

    it("sums in cents, so fractions do not drift", () => {
        const row = serializeCustomerListItem({
            ...base,
            orders: [order({ total: "0.10" }), order({ total: "0.20" })],
        });

        expect(row.spent).toBe("0.30");
    });

    it("takes the last order's date, whether or not it was paid", () => {
        const row = serializeCustomerListItem({
            ...base,
            orders: [
                order({ createdAt: new Date("2026-03-01T00:00:00Z") }),
                order({
                    createdAt: new Date("2026-06-01T00:00:00Z"),
                    paymentStatus: "UNPAID",
                }),
            ],
        });

        expect(row.lastOrderAt).toEqual(new Date("2026-06-01T00:00:00Z"));
    });

    it("marks a subset rather than adding two currencies together", () => {
        const row = serializeCustomerListItem({
            ...base,
            orders: [
                order({
                    total: "500.00",
                    currency: "INR",
                    createdAt: new Date("2026-06-01T00:00:00Z"),
                }),
                order({
                    total: "40.00",
                    currency: "USD",
                    createdAt: new Date("2026-05-01T00:00:00Z"),
                }),
            ],
        });

        expect(row.currency).toBe("INR");
        expect(row.spent).toBe("500.00");
        expect(row.mixedCurrency).toBe(true);
    });
});
