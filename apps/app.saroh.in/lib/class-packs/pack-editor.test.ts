import { describe, expect, it } from "vitest";

import type {
    PackServiceOption,
    PackValues,
} from "@/lib/class-packs/pack-editor";
import {
    KIND_LOCKED,
    kindLocked,
    kindNote,
    newPackValues,
    normalPrice,
    packBlocker,
    packPayload,
    packProblems,
    parseWhole,
    servicesFor,
    switchKind,
    tidyPrice,
    toggleService,
} from "@/lib/class-packs/pack-editor";
import {
    eachNote,
    glance,
    packChanges,
    publishedToast,
    soldKeepNote,
} from "@/lib/class-packs/pack-editor-words";

/*
 * The Pack Editor's rules (E18): what stops Publish, what an autosave may
 * send, the kind lock's words, "When you publish", and the side column.
 */

const svc = (
    id: string,
    capacity: number,
    priceCents: number | null,
    active = true,
): PackServiceOption => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    capacity,
    priceCents,
    currency: "INR",
    active,
});

const SERVICES = [
    svc("hatha", 12, 50_000),
    svc("hiit", 16, 70_000),
    svc("pt", 1, 150_000),
    svc("yin", 10, 45_000, false),
];

const TEN: PackValues = {
    name: "Ten classes",
    description: null,
    credits: 10,
    validityDays: 60,
    price: "4500",
    currency: "INR",
    serviceIds: ["hatha", "hiit"],
    kind: "CLASSES",
    firstPackOnly: false,
};

const noContext: Parameters<typeof packProblems>[1] = {
    services: SERVICES,
    sold: 0,
    published: null,
};
const fields = (v: PackValues, ctx = noContext) =>
    packProblems(v, ctx).map((p) => p.field);

describe("what stops Publish", () => {
    it("a finished pack has no problems", () => {
        expect(packProblems(TEN, noContext)).toEqual([]);
    });

    it("names each missing field in the design's words", () => {
        const empty: PackValues = {
            ...TEN,
            name: " ",
            credits: null,
            price: null,
            validityDays: null,
            serviceIds: [],
        };
        expect(packProblems(empty, noContext)).toEqual([
            { field: "name", message: "Give it a name" },
            { field: "credits", message: "How many classes?" },
            { field: "price", message: "Add the price" },
            {
                field: "validityDays",
                message: "Give at least 7 days to use it",
            },
            { field: "serviceIds", message: "Pick what it's good for" },
        ]);
    });

    it("says sessions for a one-to-one pack", () => {
        const pt = { ...TEN, kind: "ONE_TO_ONE" as const, credits: null };
        expect(packProblems(pt, noContext)[0].message).toBe(
            "How many sessions?",
        );
    });

    it("validity under 7 days is marked on its field", () => {
        expect(fields({ ...TEN, validityDays: 6 })).toEqual(["validityDays"]);
        expect(fields({ ...TEN, validityDays: 7 })).toEqual([]);
    });

    it("refuses a price that isn't one, and a zero price", () => {
        expect(packProblems({ ...TEN, price: "45.678" }, noContext)).toEqual([
            { field: "price", message: "A price like 4000 or 4000.50" },
        ]);
        expect(fields({ ...TEN, price: "0" })).toEqual(["price"]);
        expect(fields({ ...TEN, price: "4,500." })).toEqual([]);
    });

    it("keeps to the API's limits", () => {
        expect(fields({ ...TEN, credits: 501 })).toEqual(["credits"]);
        expect(fields({ ...TEN, validityDays: 3651 })).toEqual([
            "validityDays",
        ]);
        expect(fields({ ...TEN, description: "x".repeat(501) })).toEqual([
            "description",
        ]);
    });

    it("a sold pack whose kind was changed can't be published (E13)", () => {
        const published = { ...TEN };
        const changed = { ...TEN, kind: "ONE_TO_ONE" as const };
        expect(
            packProblems(changed, { services: SERVICES, sold: 3, published }),
        ).toContainEqual({ field: "kind", message: KIND_LOCKED });
        // Unsold, the kind is free to change.
        expect(
            fields(changed, { services: SERVICES, sold: 0, published }),
        ).not.toContain("kind");
    });

    it("a service since deleted is named, once services are known", () => {
        const gone = { ...TEN, serviceIds: ["hatha", "spin"] };
        expect(fields(gone)).toEqual(["serviceIds"]);
        // Services unread: nothing can be said about it.
        expect(fields(gone, { ...noContext, services: null })).toEqual([]);
    });

    it("a name is all a draft needs to save", () => {
        expect(packBlocker({ ...TEN, name: "  " })).toBe(
            "Add a name to save the draft",
        );
        expect(packBlocker({ ...TEN, credits: null })).toBeNull();
    });
});

describe("what an autosave sends", () => {
    it("sends every field the API takes as it is", () => {
        expect(packPayload({ ...TEN, description: "  Any class " })).toEqual({
            name: "Ten classes",
            description: "Any class",
            credits: 10,
            validityDays: 60,
            price: "4500",
            currency: "INR",
            serviceIds: ["hatha", "hiit"],
            kind: "CLASSES",
            firstPackOnly: false,
        });
    });

    it("sends an emptied field as null", () => {
        const p = packPayload({
            ...TEN,
            credits: null,
            validityDays: null,
            price: "",
            description: " ",
        });
        expect(p.credits).toBeNull();
        expect(p.validityDays).toBeNull();
        expect(p.price).toBeNull();
        expect(p.description).toBeNull();
    });

    it("leaves out what the API would refuse, so the rest still saves", () => {
        const p = packPayload({
            ...TEN,
            name: " ",
            credits: 0,
            validityDays: 5,
            price: "45.678",
        });
        expect(p).not.toHaveProperty("name");
        expect(p).not.toHaveProperty("credits");
        expect(p).not.toHaveProperty("validityDays");
        expect(p).not.toHaveProperty("price");
        expect(p.serviceIds).toEqual(["hatha", "hiit"]);
    });

    it("tidies a price as typed", () => {
        expect(packPayload({ ...TEN, price: "4,500." }).price).toBe("4500");
        expect(normalPrice("4500.5")).toBe("4500.5");
        expect(normalPrice("abc")).toBeNull();
        expect(tidyPrice("4500.00")).toBe("4500");
        expect(tidyPrice("4500.50")).toBe("4500.5");
        expect(tidyPrice(null)).toBeNull();
    });

    it("reads a typed whole number, digits only", () => {
        expect(parseWhole("12")).toBe(12);
        expect(parseWhole("1a2")).toBe(12);
        expect(parseWhole("")).toBeNull();
    });
});

describe("kinds and services", () => {
    it("offers classes for a Classes pack and one-to-one for the other", () => {
        expect(servicesFor("CLASSES", SERVICES, []).map((s) => s.id)).toEqual([
            "hatha",
            "hiit",
        ]);
        expect(
            servicesFor("ONE_TO_ONE", SERVICES, []).map((s) => s.id),
        ).toEqual(["pt"]);
    });

    it("keeps a paused service the pack names", () => {
        expect(
            servicesFor("CLASSES", SERVICES, ["yin"]).map((s) => s.id),
        ).toEqual(["hatha", "hiit", "yin"]);
    });

    it("a new pack starts with the design's defaults", () => {
        expect(newPackValues("CLASSES", SERVICES, "INR")).toMatchObject({
            name: "",
            credits: 10,
            validityDays: 90,
            price: null,
            serviceIds: ["hatha", "hiit"],
        });
        expect(newPackValues("ONE_TO_ONE", SERVICES, "INR")).toMatchObject({
            credits: 5,
            serviceIds: ["pt"],
        });
    });

    it("switching the kind swaps what it is good for", () => {
        expect(switchKind("ONE_TO_ONE", SERVICES)).toEqual({
            kind: "ONE_TO_ONE",
            serviceIds: ["pt"],
        });
    });

    it("toggles one service, keeping the set sorted", () => {
        expect(toggleService(["hiit"], "hatha")).toEqual(["hatha", "hiit"]);
        expect(toggleService(["hatha", "hiit"], "hatha")).toEqual(["hiit"]);
    });
});

describe("the kind lock (E13)", () => {
    it("locks a sold live pack, and says how many sold", () => {
        expect(kindLocked(true, 3)).toBe(true);
        expect(kindNote(true, 3)).toBe(
            "Locked — 3 already sold. Class and one-to-one credits never mix.",
        );
    });

    it("keeps it locked when the sales couldn't be counted", () => {
        expect(kindLocked(true, null)).toBe(true);
        expect(kindNote(true, null)).toMatch(/couldn't check/);
    });

    it("leaves a draft and an unsold pack free", () => {
        expect(kindLocked(false, 0)).toBe(false);
        expect(kindLocked(true, 0)).toBe(false);
        expect(kindNote(true, 0)).toBe(
            "Class credits and one-to-one credits never mix.",
        );
    });
});

describe("When you publish", () => {
    it("lists each change in the design's words", () => {
        const next = {
            ...TEN,
            name: "Twelve classes",
            credits: 12,
            price: "5200",
            validityDays: 90,
        };
        expect(packChanges(TEN, next)).toEqual([
            "Price ₹4,500 → ₹5,200",
            "10 → 12 classes",
            "use within 60 → 90 days",
            "renamed to Twelve classes",
        ]);
    });

    it("names the other changes too", () => {
        const next = {
            ...TEN,
            serviceIds: ["hatha"],
            firstPackOnly: true,
            description: "New",
        };
        expect(packChanges(TEN, next)).toEqual([
            "good for 1 class",
            "first pack only",
            "new description",
        ]);
    });

    it("a price typed differently isn't a change", () => {
        expect(packChanges(TEN, { ...TEN, price: "4500.00" })).toEqual([]);
    });

    it("says the sold keep their terms, and the toast after", () => {
        expect(soldKeepNote("CLASSES", 3)).toBe(
            "The 3 already sold keep their classes, price and dates.",
        );
        expect(soldKeepNote("CLASSES", 0)).toBeNull();
        expect(publishedToast(TEN, true, 3)).toBe(
            "Changes published. The 3 already sold keep what they bought.",
        );
        expect(publishedToast(TEN, false, 0)).toBe(
            "Ten classes is published — you can sell it now.",
        );
    });
});

describe("the side column", () => {
    it("works out each class against the drop-in price", () => {
        expect(eachNote(TEN, SERVICES)).toBe(
            "₹450 a class · drop-in ₹500–₹700",
        );
        expect(glance(TEN, SERVICES, 3)).toEqual([
            ["Per class", "₹450"],
            ["Saving vs drop-in", "25%"],
            ["Sold so far", "3"],
        ]);
    });

    it("shows a dash for what can't be worked out", () => {
        const unpriced = { ...TEN, price: null };
        expect(eachNote(unpriced, SERVICES)).toBe("");
        expect(glance(unpriced, SERVICES, null)).toEqual([
            ["Per class", "—"],
            ["Saving vs drop-in", "—"],
            ["Sold so far", "—"],
        ]);
    });
});
