import { describe, expect, it } from "vitest";

import {
    FULFILMENT_CHOICES,
    fulfilmentLine,
    inTableOrder,
} from "./fulfilment-types";

describe("a product's fulfilment types (B12)", () => {
    it("offers the storefront's three ways and Digital, never an appointment", () => {
        expect(FULFILMENT_CHOICES.map((c) => c.label)).toEqual([
            "Pick-up",
            "Local delivery",
            "Shipping",
            "Digital",
        ]);
    });

    it("keeps picked ways in table order, each once", () => {
        expect(inTableOrder(["DIGITAL", "PICKUP", "DIGITAL"])).toEqual([
            "PICKUP",
            "DIGITAL",
        ]);
        expect(inTableOrder([])).toEqual([]);
    });

    it("says what the product page shows: the ways, or its storefronts'", () => {
        expect(fulfilmentLine(["SHIPPING", "PICKUP"])).toBe(
            "Pick-up, Shipping",
        );
        expect(fulfilmentLine([])).toBe("Every way its storefronts offer");
        expect(fulfilmentLine(undefined)).toBe(
            "Every way its storefronts offer",
        );
    });
});
