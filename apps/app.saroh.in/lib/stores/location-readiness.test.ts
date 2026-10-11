import { describe, expect, it } from "vitest";

import type { SiteSelling } from "@/lib/sites/sells-from";

import {
    locationReadiness,
    locationSubtitle,
    savedWays,
    waysWords,
    websiteWays,
} from "./location-readiness";
import type { StorefrontSettings } from "./storefronts";

/**
 * A location's readiness card reads only what the page holds, and counts
 * only true facts: a website it couldn't read, or a shop not open to the
 * business, adds no item rather than a guess. Made-up names only.
 */

const base: StorefrontSettings = {
    id: "st_1",
    name: "Rye Online",
    orderCount: 0,
    kind: "ONLINE",
    paused: false,
    currency: "INR",
    currencyLocked: false,
    taxEnabled: false,
    taxRate: "0.00",
    shippingEnabled: false,
    freeShippingThreshold: null,
    unfulfilled: 0,
    address: null,
    openingHours: null,
    collectionEnabled: false,
    fulfilmentTypes: [],
    tipsEnabled: false,
    guestCheckout: true,
    pausedAt: null,
    checkoutProvider: null,
    effectiveProvider: null,
    providers: [],
};

const site = (
    over: Partial<SiteSelling> = {},
    sellsFrom: SiteSelling["sellsFrom"] = {
        storefront: { id: "st_1", name: "Rye Online" },
        choices: [{ id: "st_1", name: "Rye Online", products: 4 }],
    },
): SiteSelling => ({
    siteId: "site_1",
    origin: "https://rye.saroh.app",
    sellsFrom,
    ...over,
});

const keys = (r: ReturnType<typeof locationReadiness>) =>
    r.items.map((i) => `${i.done ? "✓" : "·"} ${i.key}`);

describe("locationSubtitle", () => {
    it("names a place customers visit by its address's first line", () => {
        expect(
            locationSubtitle({
                kind: "SHOP",
                address: "\n12 Hill Road\nBandra",
            }),
        ).toBe("Customers visit · 12 Hill Road");
        expect(locationSubtitle({ kind: "SHOP", address: "  " })).toBe(
            "Customers visit · no address yet",
        );
    });

    it("says what a location with no counter is for", () => {
        expect(locationSubtitle({ kind: "ONLINE", address: null })).toBe(
            "No counter · stock for online orders",
        );
    });
});

describe("the ways", () => {
    it("reads an older API's two switches when there are no chips", () => {
        expect(
            savedWays({
                ...base,
                kind: "SHOP",
                fulfilmentTypes: undefined,
                collectionEnabled: true,
                shippingEnabled: true,
            }),
        ).toEqual(["PICKUP", "SHIPPING"]);
    });

    it("leaves Pick-up off the website without a counter and its address", () => {
        const on = { ...base, fulfilmentTypes: ["PICKUP" as const] };
        expect(websiteWays(on)).toEqual([]);
        expect(websiteWays({ ...on, kind: "SHOP" })).toEqual([]);
        expect(
            websiteWays({ ...on, kind: "SHOP", address: "12 Hill Road" }),
        ).toEqual(["PICKUP"]);
    });

    it("says them as a sentence", () => {
        expect(waysWords(["SHIPPING"])).toBe("Shipping");
        expect(waysWords(["LOCAL_DELIVERY", "SHIPPING"])).toBe(
            "Local delivery and shipping",
        );
        expect(waysWords(["PICKUP", "LOCAL_DELIVERY", "SHIPPING"])).toBe(
            "Pick-up, local delivery and shipping",
        );
    });
});

describe("locationReadiness", () => {
    it("a new location with no counter: three steps, each with its link", () => {
        const r = locationReadiness(
            base,
            site({}, { storefront: null, choices: [] }),
        );
        expect(r.heading).toBe("Ready for online orders");
        expect(r.done).toBe(0);
        expect(r.total).toBe(3);
        expect(r.items.map((i) => i.action?.label)).toEqual([
            "Set up delivery",
            "Connect a provider",
            "Turn on your shop",
        ]);
        expect(r.items[2]?.action?.href).toBe(
            "/sites/site_1/settings#sells-from",
        );
    });

    it("puts what's done first", () => {
        const r = locationReadiness(
            { ...base, fulfilmentTypes: ["SHIPPING"] },
            site(),
        );
        expect(keys(r)).toEqual(["✓ ways", "✓ listed", "· payments"]);
        expect(r.items[0]?.label).toBe("Shipping on");
    });

    it("a website it couldn't read adds no item", () => {
        expect(keys(locationReadiness(base, undefined))).toEqual([
            "· ways",
            "· payments",
        ]);
    });

    it("a shop not open to the business adds no item", () => {
        expect(
            keys(locationReadiness(base, site({ sellsFrom: null }))),
        ).toEqual(["· ways", "· payments"]);
    });

    it("no website: make one", () => {
        const r = locationReadiness(base, null);
        expect(r.items.at(-1)).toMatchObject({
            label: "Sell on your website",
            action: { href: "/sites/new" },
        });
    });

    it("the shop sells from another location: says which", () => {
        const r = locationReadiness(
            base,
            site(
                {},
                {
                    storefront: { id: "st_2", name: "Hill Road" },
                    choices: [],
                },
            ),
        );
        expect(r.items.at(-1)).toMatchObject({
            done: false,
            label: "Your online shop sells from Hill Road",
            action: { label: "Sell from here instead" },
        });
    });

    it("sells from here with nothing listed, or not published yet", () => {
        expect(
            locationReadiness(
                base,
                site(
                    {},
                    {
                        storefront: { id: "st_1", name: "Rye Online" },
                        choices: [
                            { id: "st_1", name: "Rye Online", products: 0 },
                        ],
                    },
                ),
            ).items.at(-1)?.label,
        ).toBe("Put products in your online shop");
        expect(
            locationReadiness(base, site({ origin: null })).items.at(-1)?.label,
        ).toBe("Publish your website");
    });

    it("payments: a provider in use, paying on handover, or a plan without online payments", () => {
        const done = (s: Partial<StorefrontSettings>) =>
            locationReadiness({ ...base, ...s }, undefined).items.find(
                (i) => i.key === "payments",
            );
        expect(done({ effectiveProvider: "RAZORPAY" })).toMatchObject({
            done: true,
            label: "Takes payments through Razorpay",
        });
        expect(done({ offerPayOnHandover: true })?.done).toBe(true);
        expect(done({ onlinePaymentsPlan: false })?.done).toBe(true);
        expect(
            done({
                providers: [
                    { provider: "RAZORPAY", status: "CONNECTED" },
                    { provider: "CASHFREE", status: "CONNECTED" },
                ],
            }),
        ).toMatchObject({
            done: false,
            label: "Choose which provider checkout uses",
            action: {
                href: "?section=payments",
                inPage: true,
                tab: "payments",
            },
        });
    });

    it("a counter that sells in person only counts its address and hours", () => {
        const r = locationReadiness(
            { ...base, kind: "SHOP", address: "12 Hill Road" },
            site(
                {},
                { storefront: { id: "st_2", name: "Other" }, choices: [] },
            ),
        );
        expect(r.heading).toBe("Ready for the counter");
        expect(keys(r)).toEqual(["✓ address", "· hours"]);
    });

    it("a counter the online shop sells from counts both", () => {
        const r = locationReadiness(
            {
                ...base,
                kind: "SHOP",
                address: "12 Hill Road",
                fulfilmentTypes: ["PICKUP"],
            },
            site(),
        );
        expect(r.heading).toBe("Ready for the counter and online orders");
        expect(keys(r)).toEqual([
            "✓ address",
            "✓ ways",
            "✓ listed",
            "· hours",
            "· payments",
        ]);
    });

    it("paused, or past the plan's locations (#800): a step left", () => {
        const r = locationReadiness(
            { ...base, pausedAt: "2026-10-01T00:00:00Z" },
            undefined,
            { notTakingOrders: true },
        );
        expect(keys(r).slice(0, 2)).toEqual(["· plan", "· paused"]);
    });

    it("each step on this page names its tab and the field to focus", () => {
        const r = locationReadiness({ ...base, kind: "SHOP" }, undefined);
        expect(r.items.map((i) => i.action)).toEqual([
            {
                label: "Add address",
                href: "?section=the-place",
                inPage: true,
                tab: "the-place",
                focus: "storefront-address",
            },
            {
                label: "Set hours",
                href: "?section=the-place",
                inPage: true,
                tab: "the-place",
                focus: "storefront-hours",
            },
        ]);
        expect(
            locationReadiness(base, undefined).items[0]?.action,
        ).toMatchObject({ label: "Set up delivery", tab: "delivery" });
    });

    it("says where a counter sells only when the website was read", () => {
        const counter = { ...base, kind: "SHOP" as const };
        expect(locationReadiness(counter, null).note).toBe(
            "Sells in person only",
        );
        expect(locationReadiness(counter, undefined).note).toBeUndefined();
        expect(locationReadiness(base, null).note).toBeUndefined();
    });

    it("a live shop's step links to it", () => {
        expect(
            locationReadiness(base, site()).items.find(
                (i) => i.key === "listed",
            )?.view,
        ).toEqual({
            label: "Your online shop",
            href: "https://rye.saroh.app/shop",
        });
    });
});
