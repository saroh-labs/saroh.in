import { describe, expect, it } from "vitest";

import { formatOrderNumber, orderNumberValue } from "./order-number";

// The allocator itself runs on Postgres: apps/api.saroh.in's
// order-numbers.db.spec.ts. Here, the shape of a number (P3, DEC-066).
describe("order numbers", () => {
    it("keeps the ORD- format, padded to three digits", () => {
        expect(formatOrderNumber(1)).toBe("ORD-001");
        expect(formatOrderNumber(42)).toBe("ORD-042");
        expect(formatOrderNumber(1234)).toBe("ORD-1234");
    });

    it("reads back the counter of a number in the series", () => {
        expect(orderNumberValue("ORD-001")).toBe(1);
        expect(orderNumberValue("ORD-1234")).toBe(1234);
        expect(orderNumberValue(formatOrderNumber(907))).toBe(907);
    });

    it("leaves any other shape out of the series", () => {
        expect(orderNumberValue("1001")).toBeNull();
        expect(orderNumberValue("LL-1001")).toBeNull();
        expect(orderNumberValue("ORD-")).toBeNull();
        expect(orderNumberValue("ord-001")).toBeNull();
        expect(orderNumberValue("ORD-0012a")).toBeNull();
        // More digits than the SQL's int cast reads.
        expect(orderNumberValue("ORD-1234567890")).toBeNull();
    });
});
