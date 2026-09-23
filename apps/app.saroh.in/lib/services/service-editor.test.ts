import { describe, expect, it } from "vitest";

import type { ServiceDraft } from "./service-editor";
import {
    changeNote,
    fromMinor,
    serviceRefusal,
    toMinor,
} from "./service-editor";

const draft = (over: Partial<ServiceDraft> = {}): ServiceDraft => ({
    kind: "one",
    name: "Personal training",
    minutes: "60",
    gap: "15",
    price: "1200",
    places: "",
    staffIds: ["st_vikram"],
    ...over,
});

describe("toMinor", () => {
    it("reads rupees as typed, without floating point", () => {
        expect(toMinor("1200")).toBe(120_000);
        expect(toMinor("1,200.5")).toBe(120_050);
        expect(toMinor("₹ 499.99")).toBe(49_999);
        expect(toMinor("")).toBeNull();
        expect(toMinor("twelve")).toBeNaN();
        expect(toMinor("1.234")).toBeNaN();
        expect(fromMinor(120_050)).toBe("1200.50");
        expect(fromMinor(120_000)).toBe("1200");
    });
});

describe("serviceRefusal", () => {
    it("refuses no name, under 15 minutes, nobody, and a class under 2 places", () => {
        expect(serviceRefusal(draft({ name: " " }), true)).toBe(
            "A service needs a name.",
        );
        expect(serviceRefusal(draft({ minutes: "10" }), true)).toBe(
            "Make it at least 15 minutes.",
        );
        expect(serviceRefusal(draft({ staffIds: [] }), true)).toBe(
            "Pick who takes it.",
        );
        expect(
            serviceRefusal(draft({ kind: "class", places: "1" }), true),
        ).toBe("A class needs at least 2 places.");
        expect(serviceRefusal(draft(), true)).toBeNull();
    });

    it("lets a business with nobody on the diary save a service", () => {
        expect(serviceRefusal(draft({ staffIds: [] }), false)).toBeNull();
    });
});

describe("changeNote", () => {
    const before = { priceCents: 120_000, durationMinutes: 60 };

    it("says a new price applies to new bookings, and what those booked keep", () => {
        expect(changeNote(before, draft({ price: "1500" }), 3)).toBe(
            "The new price applies to bookings made from now; the 3 already booked keep the price they were booked at.",
        );
        expect(changeNote(before, draft({ price: "1500" }), 1)).toContain(
            "the 1 already booked keeps",
        );
    });

    it("says nothing when nothing that matters changed", () => {
        expect(changeNote(before, draft({ name: "PT" }), 3)).toBe("");
        expect(changeNote(null, draft(), 3)).toBe("");
    });
});
