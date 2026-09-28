import "reflect-metadata";

import { filterOptionsFrom } from "./order-list-options";

/**
 * What the Orders list's filter bar offers (B4), without a database: the
 * ways and steps a business's orders show, in the order the menus list
 * them. The query itself runs in `order-list.db.spec.ts`.
 */

const combo = (
    fulfilment: string,
    stage: string,
    status = "PENDING",
    paymentStatus = "PAID",
) => ({ fulfilment, stage, status, paymentStatus });

describe("filterOptionsFrom", () => {
    it("offers only the ways the business's orders leave, in table order", () => {
        const { types } = filterOptionsFrom([
            combo("SHIPPING", "NEW"),
            combo("PICKUP", "READY"),
        ]);
        expect(types).toEqual([
            { type: "PICKUP", label: "Pick-up" },
            { type: "SHIPPING", label: "Shipping" },
        ]);
    });

    it("offers each step word once, first steps first and done steps last", () => {
        const { steps } = filterOptionsFrom([
            combo("PICKUP", "COLLECTED", "DELIVERED"),
            combo("SHIPPING", "HANDED_TO_COURIER", "SHIPPED"),
            combo("PICKUP", "READY", "PROCESSING"),
            combo("DIGITAL", "NEW"),
            combo("PICKUP", "NEW"),
            combo("SHIPPING", "NEW"),
            combo("SHIPPING", "DELIVERED", "DELIVERED"),
        ]);
        expect(steps.map((s) => s.label)).toEqual([
            "New",
            "Paid",
            "Ready",
            "Handed to courier",
            "Collected",
            "Delivered",
        ]);
        expect(steps[0]).toEqual({
            key: "new",
            label: "New",
            types: ["PICKUP", "SHIPPING"],
        });
    });

    it("says Refunded and Cancelled, as the pill does, after the steps", () => {
        const { steps, types } = filterOptionsFrom([
            combo("PICKUP", "READY", "PROCESSING", "REFUNDED"),
            combo("SHIPPING", "NEW", "CANCELLED"),
            combo("PICKUP", "NEW"),
        ]);
        expect(steps.map((s) => s.key)).toEqual([
            "new",
            "refunded",
            "cancelled",
        ]);
        expect(steps[1]!.types).toEqual([]);
        // A refunded or cancelled order still says how it was to leave.
        expect(types.map((t) => t.type)).toEqual(["PICKUP", "SHIPPING"]);
    });

    it("reads a local delivery still with a courier as Handed to courier", () => {
        const { steps } = filterOptionsFrom([
            combo("LOCAL_DELIVERY", "HANDED_TO_COURIER", "SHIPPED"),
            combo("LOCAL_DELIVERY", "OUT_FOR_DELIVERY", "SHIPPED"),
        ]);
        // Both sit at the same point of the same type: by word.
        expect(steps).toEqual([
            {
                key: "handed-to-courier",
                label: "Handed to courier",
                types: ["LOCAL_DELIVERY"],
            },
            {
                key: "out-for-delivery",
                label: "Out for delivery",
                types: ["LOCAL_DELIVERY"],
            },
        ]);
    });

    it("offers nothing to a business with no orders", () => {
        expect(filterOptionsFrom([])).toEqual({ types: [], steps: [] });
    });
});
