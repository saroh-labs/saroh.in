import { describe, expect, it } from "vitest";

import type { LayerStyle } from "./layers";
import { filterLabel, layersOn, listed, showLabel } from "./what-to-show";

/** Kaya Physio's layers, as the Calendar month boards draw them (U13). */
const LAYERS: LayerStyle[] = [
    {
        key: "bookings",
        label: "Bookings",
        one: "booking",
        many: "bookings",
        tone: 1,
    },
    {
        key: "classes",
        label: "Classes",
        one: "class",
        many: "classes",
        tone: 3,
    },
    {
        key: "invoices",
        label: "Invoices",
        one: "invoice",
        many: "invoices",
        tone: 7,
    },
];
const PEOPLE = [
    { id: "meera", name: "Meera Iyer" },
    { id: "pillai", name: "Dr. Arun Pillai" },
];

describe("What to show's words", () => {
    it("lists one, two or three as a sentence does", () => {
        expect(listed([])).toBe("");
        expect(listed(["a"])).toBe("a");
        expect(listed(["a", "b"])).toBe("a and b");
        expect(listed(["a", "b", "c"])).toBe("a, b and c");
    });

    it("says the layers on, or nothing", () => {
        expect(layersOn(LAYERS, {})).toBe("bookings, classes and invoices");
        expect(layersOn(LAYERS, { invoices: true })).toBe(
            "bookings and classes",
        );
        expect(
            layersOn(LAYERS, { bookings: true, classes: true, invoices: true }),
        ).toBe("nothing");
    });

    it("the button says whose and what", () => {
        const base = { layers: LAYERS, people: PEOPLE };
        expect(filterLabel({ ...base, off: {}, person: null })).toBe(
            "Everyone · bookings, classes and invoices",
        );
        expect(
            filterLabel({ ...base, off: { classes: true }, person: "meera" }),
        ).toBe("Meera · bookings and invoices");
        expect(filterLabel({ ...base, off: {}, person: "pillai" })).toBe(
            "Dr. Pillai · bookings, classes and invoices",
        );
    });

    it("a business with no team to pick says only the layers", () => {
        expect(
            filterLabel({ layers: LAYERS, people: [], off: {}, person: null }),
        ).toBe("Bookings, classes and invoices");
    });

    it("Show says it as each board does", () => {
        expect(showLabel(LAYERS, {}, true)).toBe("Show all 3");
        expect(showLabel(LAYERS, { invoices: true }, true)).toBe("Show 2");
        expect(
            showLabel(
                LAYERS,
                { bookings: true, classes: true, invoices: true },
                true,
            ),
        ).toBe("Show nothing");
        expect(showLabel(LAYERS, {}, false)).toBe("Show everything");
        expect(showLabel(LAYERS, { invoices: true }, false)).toBe(
            "Show bookings and classes",
        );
    });
});
