import { describe, expect, it } from "vitest";

import {
    checkoutLine,
    draftProblems,
    LATE_PRESETS,
    lateShort,
    wayDraft,
    wayInput,
    waySaved,
    waySheetSays,
    waySummary,
} from "./delivery-summary";
import type { StorefrontSettings } from "./storefronts";

/**
 * Location › Delivery's sentences and its one Save (the 9 Oct second
 * pass). Made-up amounts only.
 */

const base: StorefrontSettings = {
    id: "st_1",
    name: "Hill Road",
    orderCount: 0,
    kind: "SHOP",
    paused: false,
    currency: "INR",
    currencyLocked: false,
    taxEnabled: false,
    taxRate: "0.00",
    shippingEnabled: true,
    freeShippingThreshold: null,
    unfulfilled: 0,
    address: "12 Hill Road",
    openingHours: null,
    collectionEnabled: true,
    fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"],
    lateAfterMinutes: { PICKUP: 120, LOCAL_DELIVERY: 1440, SHIPPING: 2880 },
    tipsEnabled: false,
    guestCheckout: true,
    pausedAt: null,
    checkoutProvider: null,
    effectiveProvider: null,
    providers: [],
    siteShop: true,
    localDeliveryFee: null,
    shippingFee: null,
};

describe("lateShort", () => {
    it("says a late time in a row's few words", () => {
        expect(lateShort(120)).toBe("2 h");
        expect(lateShort(1440)).toBe("24 h");
        expect(lateShort(2880)).toBe("2 days");
        expect(lateShort(90)).toBe("90 min");
        expect(lateShort(4320)).toBe("3 days");
    });
});

describe("waySummary", () => {
    it("a fee, the free-over amount beside it, and the late time", () => {
        expect(
            waySummary(
                {
                    ...base,
                    localDeliveryFee: "40.00",
                    freeShippingThreshold: "999.00",
                },
                "LOCAL_DELIVERY",
            ).text,
        ).toBe("₹40 · free over ₹999 · late after 24 h");
    });

    it("free, with no free-over amount to speak of", () => {
        expect(
            waySummary({ ...base, freeShippingThreshold: "999.00" }, "SHIPPING")
                .text,
        ).toBe("Free · late after 2 days");
    });

    it("a fee with no free-over amount", () => {
        expect(
            waySummary({ ...base, shippingFee: "60.50" }, "SHIPPING").text,
        ).toBe("₹60.50 · late after 2 days");
    });

    it("no fee to say without an online shop", () => {
        expect(
            waySummary(
                { ...base, siteShop: false, localDeliveryFee: "40.00" },
                "LOCAL_DELIVERY",
            ).text,
        ).toBe("On · late after 24 h");
    });

    it("off", () => {
        expect(
            waySummary({ ...base, fulfilmentTypes: ["PICKUP"] }, "SHIPPING"),
        ).toMatchObject({ text: "Off", note: null, notOffered: false });
    });

    it("Pick-up where customers can't visit: not offered, and the way to a counter", () => {
        expect(
            waySummary(
                { ...base, kind: "ONLINE", address: null, fulfilmentTypes: [] },
                "PICKUP",
            ),
        ).toEqual({
            text: "Not offered",
            note: "Customers can't visit this location.",
            notOffered: true,
            stranded: false,
            fix: "counter",
        });
    });

    it("Pick-up saved on where customers can't visit: says so, to turn off", () => {
        expect(
            waySummary({ ...base, kind: "ONLINE", address: null }, "PICKUP"),
        ).toMatchObject({
            note: "Not on your website: customers can't visit this location.",
            stranded: true,
            fix: null,
        });
    });

    it("Pick-up at a counter with no address: not on the website until it has one", () => {
        expect(waySummary({ ...base, address: " " }, "PICKUP")).toMatchObject({
            text: "Free · late after 2 h",
            note: "Not on your website until the address is added.",
            fix: "address",
        });
    });
});

describe("the Edit panel's draft", () => {
    it("starts from what is saved, a preset chosen when the time matches one", () => {
        expect(
            wayDraft(
                {
                    ...base,
                    localDeliveryFee: "40.00",
                    freeShippingThreshold: "999.00",
                },
                "LOCAL_DELIVERY",
            ),
        ).toEqual({
            on: true,
            charge: true,
            fee: "40",
            threshold: "999",
            preset: 1440,
            amount: "24",
            unit: "hours",
        });
    });

    it("a time no preset holds is Other…, in its own unit", () => {
        const draft = wayDraft(
            {
                ...base,
                lateAfterMinutes: {
                    PICKUP: 90,
                    LOCAL_DELIVERY: 1440,
                    SHIPPING: 2880,
                },
            },
            "PICKUP",
        );
        expect(draft).toMatchObject({
            preset: null,
            amount: "90",
            unit: "minutes",
        });
    });

    it("has no Same day: late is minutes after the order is placed", () => {
        expect(LATE_PRESETS.map((p) => p.label)).toEqual([
            "2 h",
            "4 h",
            "8 h",
            "24 h",
            "2 days",
        ]);
    });
});

describe("wayInput: the one update Save sends", () => {
    it("nothing changed, nothing to send", () => {
        const draft = wayDraft(base, "LOCAL_DELIVERY");
        expect(wayInput(base, "LOCAL_DELIVERY", draft)).toEqual({});
    });

    it("the ways, the fee, the free-over amount and the late time together", () => {
        const store = { ...base, fulfilmentTypes: ["PICKUP" as const] };
        const draft = {
            ...wayDraft(store, "LOCAL_DELIVERY"),
            on: true,
            charge: true,
            fee: "40",
            threshold: "999",
            preset: 240,
        };
        expect(wayInput(store, "LOCAL_DELIVERY", draft)).toEqual({
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
            localDeliveryFee: "40",
            freeShippingThreshold: "999",
            lateAfterMinutes: { LOCAL_DELIVERY: 240 },
        });
    });

    it("Free clears the fee; the location's free-over amount is left alone", () => {
        const store = {
            ...base,
            shippingFee: "60.00",
            freeShippingThreshold: "999.00",
        };
        const draft = { ...wayDraft(store, "SHIPPING"), charge: false };
        expect(wayInput(store, "SHIPPING", draft)).toEqual({
            shippingFee: null,
        });
    });

    it("the same amount written differently isn't a change", () => {
        const store = { ...base, localDeliveryFee: "40.00" };
        const draft = { ...wayDraft(store, "LOCAL_DELIVERY"), fee: "40.0" };
        expect(wayInput(store, "LOCAL_DELIVERY", draft)).toEqual({});
    });

    it("turned off, only the ways change", () => {
        const draft = {
            ...wayDraft(base, "SHIPPING"),
            on: false,
            preset: 120,
        };
        expect(wayInput(base, "SHIPPING", draft)).toEqual({
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
        });
    });

    it("no fee is sent without an online shop", () => {
        const store = { ...base, siteShop: false };
        const draft = {
            ...wayDraft(store, "SHIPPING"),
            charge: true,
            fee: "60",
        };
        expect(wayInput(store, "SHIPPING", draft)).toEqual({});
    });
});

describe("draftProblems", () => {
    it("Charge needs an amount above zero", () => {
        const draft = { ...wayDraft(base, "SHIPPING"), charge: true, fee: "" };
        expect(draftProblems(base, "SHIPPING", draft).fee).toMatch(
            /Enter what customers pay/,
        );
        expect(
            draftProblems(base, "SHIPPING", { ...draft, fee: "0" }).fee,
        ).toBeDefined();
    });

    it("the free-over amount is a number or empty", () => {
        const draft = {
            ...wayDraft(base, "SHIPPING"),
            charge: true,
            fee: "60",
            threshold: "lots",
        };
        expect(draftProblems(base, "SHIPPING", draft).threshold).toBeDefined();
    });

    it("Other… needs a time within the bounds", () => {
        const draft = {
            ...wayDraft(base, "PICKUP"),
            preset: null,
            amount: "3",
            unit: "minutes" as const,
        };
        expect(draftProblems(base, "PICKUP", draft).late).toBe(
            "5 minutes at the soonest. Between 5 minutes and 30 days.",
        );
    });

    it("an off way has nothing to fix", () => {
        const draft = {
            ...wayDraft(base, "SHIPPING"),
            on: false,
            charge: true,
            fee: "",
        };
        expect(draftProblems(base, "SHIPPING", draft)).toEqual({});
    });
});

describe("waySaved and checkoutLine", () => {
    it("says each save in the words it has always used", () => {
        expect(
            waySaved("SHIPPING", {
                fulfilmentTypes: ["PICKUP", "SHIPPING"],
            }),
        ).toBe("Shipping turned on");
        expect(waySaved("PICKUP", { lateAfterMinutes: { PICKUP: 180 } })).toBe(
            "Pick-up orders now count as late after 3 hours",
        );
        expect(
            waySaved("LOCAL_DELIVERY", {
                localDeliveryFee: "40",
                lateAfterMinutes: { LOCAL_DELIVERY: 240 },
            }),
        ).toBe("Local delivery saved");
    });

    it("shows what a customer will see, as it is typed", () => {
        const draft = wayDraft(base, "LOCAL_DELIVERY");
        expect(checkoutLine(base, "LOCAL_DELIVERY", draft)).toBe(
            "At checkout: Local delivery · Free",
        );
        expect(
            checkoutLine(base, "LOCAL_DELIVERY", {
                ...draft,
                charge: true,
                fee: "40",
                threshold: "999",
            }),
        ).toBe("At checkout: Local delivery · ₹40, free over ₹999");
        expect(
            checkoutLine(base, "LOCAL_DELIVERY", { ...draft, on: false }),
        ).toBe("At checkout: Local delivery isn't offered.");
        expect(
            checkoutLine({ ...base, siteShop: false }, "LOCAL_DELIVERY", draft),
        ).toBeNull();
    });
});

describe("waySheetSays", () => {
    it("says what a way's sheet controls, naming the price only where it asks for one", () => {
        expect(waySheetSays(base, "LOCAL_DELIVERY")).toBe(
            "Whether you deliver nearby from here, what customers pay and when an order counts as late.",
        );
        expect(waySheetSays(base, "SHIPPING")).toBe(
            "Whether you ship from here, what customers pay and when an order counts as late.",
        );
        // Pick-up is never charged for, and nothing is with no online shop.
        expect(waySheetSays(base, "PICKUP")).toBe(
            "Whether customers can collect from here, and when an order counts as late.",
        );
        expect(waySheetSays({ ...base, siteShop: false }, "SHIPPING")).toBe(
            "Whether you ship from here, and when an order counts as late.",
        );
    });
});
