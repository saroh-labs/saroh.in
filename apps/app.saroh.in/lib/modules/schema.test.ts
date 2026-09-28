import { describe, expect, it } from "vitest";

import { moduleImpactResponseSchema } from "./schema";

// `GET /modules/:key/impact` as the API sends it (F13).
const wire = {
    data: {
        moduleKey: "APPOINTMENTS",
        enabled: true,
        goesWith: ["CLASS_PACKS"],
        items: [
            {
                code: "APPOINTMENTS_UPCOMING_BOOKINGS",
                moduleKey: "APPOINTMENTS",
                count: 3,
                message:
                    "3 upcoming bookings stay booked; the booking page stops taking new ones.",
            },
            {
                code: "CLASS_PACKS_CREDITS_LEFT",
                moduleKey: "CLASS_PACKS",
                count: null,
                message: "We couldn't count the packs with classes left.",
            },
            {
                code: "APPOINTMENTS_ACCOUNT_TAB",
                moduleKey: "APPOINTMENTS",
                message:
                    "Your customers' accounts on your site lose their Bookings tab.",
            },
        ],
        blockers: [],
    },
};

describe("module impact decoding", () => {
    it("keeps a count, a count that couldn't be read, and a line with none", () => {
        const { items } = moduleImpactResponseSchema.parse(wire).data;
        expect(items.map((i) => i.count)).toEqual([3, null, undefined]);
    });

    it("refuses a shape it doesn't know rather than render garbage", () => {
        expect(
            moduleImpactResponseSchema.safeParse({ data: { items: "x" } })
                .success,
        ).toBe(false);
    });
});
