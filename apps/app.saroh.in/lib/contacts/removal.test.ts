import { describe, expect, it } from "vitest";

import { deletedLine } from "./removal";

const base = {
    id: "c_1",
    deleted: true as const,
    leads: 0,
    subscriptions: 0,
    packs: 0,
    bookingsCancelled: 0,
};

describe("deletedLine", () => {
    it("says only the name when nothing went with them", () => {
        expect(deletedLine("Asha Rao", base)).toBe("Asha Rao deleted");
    });

    it("names what went with them", () => {
        expect(deletedLine("Asha Rao", { ...base, leads: 2 })).toBe(
            "Asha Rao deleted, with 2 leads",
        );
        expect(
            deletedLine("Asha Rao", {
                ...base,
                leads: 2,
                subscriptions: 1,
                packs: 1,
            }),
        ).toBe(
            "Asha Rao deleted, with 2 leads, 1 subscription and 1 class pack",
        );
    });

    it("says which bookings were cancelled", () => {
        expect(
            deletedLine("Asha Rao", {
                ...base,
                packs: 1,
                bookingsCancelled: 2,
            }),
        ).toBe(
            "Asha Rao deleted, with 1 class pack. 2 bookings paid with a pack were cancelled",
        );
    });
});
