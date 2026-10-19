import { describe, expect, it } from "vitest";

import type { Service } from "./service";
import {
    businessModeFor,
    changedSections,
    chargedAsSaved,
    depositNote,
    draftOf,
    gstGoesOnTop,
    serviceInput,
} from "./service-editor";

/**
 * "GST on this price" in the Service Editor (12 Oct 2026): a service's own
 * way of carrying GST is null for "same as the business", is sent with the
 * rest of the save, and the amounts the Price card says are the API's.
 */
const service = (over: Partial<Service> = {}): Service => ({
    id: "sv_1",
    organizationId: "org_1",
    siteId: null,
    name: "Personal training",
    description: null,
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 15,
    capacity: 1,
    priceCents: 100_000,
    currency: "INR",
    gstRate: "18.00",
    sacCode: null,
    timezone: "Asia/Kolkata",
    status: "ACTIVE",
    locationType: "IN_PERSON",
    meetingUrl: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    visits: 1,
    depositMode: "PERCENT_50",
    depositCents: 59_000,
    showOnBookingPage: true,
    bookableByTeam: true,
    gstPriceMode: "ADDED",
    payCents: 118_000,
    gst: {
        mode: "ADDED",
        rate: "18",
        listCents: 100_000,
        gstCents: 18_000,
        payCents: 118_000,
    },
    ...over,
});

const draft = (s: Service | null = service()) => draftOf(s, [], "Asia/Kolkata");

describe("the draft and what it sends", () => {
    it("null, or an older API's silence, is the same as the business", () => {
        expect(draft(null).gstPriceMode).toBe("");
        expect(draft(service({ gstPriceMode: null })).gstPriceMode).toBe("");
        expect(draft(service({ gstPriceMode: undefined })).gstPriceMode).toBe(
            "",
        );
        expect(draft().gstPriceMode).toBe("ADDED");
    });

    it("sends the choice with the rest of the save, and null for the business's way", () => {
        const send = (gstPriceMode: "" | "INCLUDED" | "ADDED") =>
            serviceInput({ ...draft(), gstPriceMode }, "INR").gstPriceMode;
        expect(send("ADDED")).toBe("ADDED");
        expect(send("INCLUDED")).toBe("INCLUDED");
        expect(send("")).toBeNull();
    });

    it("a change to it is a change to Money", () => {
        const saved = draft();
        expect(changedSections(saved, { ...saved, gstPriceMode: "" })).toEqual([
            "Money",
        ]);
    });
});

describe("the business's own way, for Same as the business", () => {
    it("is what its settings said", () => {
        expect(businessModeFor(service(), "INCLUDED")).toBe("INCLUDED");
        expect(businessModeFor(null, "ADDED")).toBe("ADDED");
    });

    it("else what a service priced the business's way is charged under", () => {
        expect(businessModeFor(service({ gstPriceMode: null }), null)).toBe(
            "ADDED",
        );
        // Its own way says nothing of the business's.
        expect(businessModeFor(service(), null)).toBeNull();
        expect(
            businessModeFor(service({ gstPriceMode: null, gst: null }), null),
        ).toBeNull();
        expect(businessModeFor(null, null)).toBeNull();
    });
});

describe("the amounts the Price card says", () => {
    it("are the API's while the price is as it was read", () => {
        expect(chargedAsSaved(service(), draft())).toEqual({
            payCents: 118_000,
            depositCents: 59_000,
        });
    });

    it("are not known once the price, rate, way or deposit is changed, for a new service, or from an older API", () => {
        const d = draft();
        expect(chargedAsSaved(service(), { ...d, price: "1200" })).toBeNull();
        expect(chargedAsSaved(service(), { ...d, gstRate: "5" })).toBeNull();
        expect(
            chargedAsSaved(service(), { ...d, gstPriceMode: "" }),
        ).toBeNull();
        expect(chargedAsSaved(service(), { ...d, deposit: "FULL" })).toBeNull();
        expect(chargedAsSaved(null, draft(null))).toBeNull();
        const old = service({ payCents: undefined });
        expect(chargedAsSaved(old, draft(old))).toBeNull();
    });

    it("GST goes on top only for a registered business's rate above 0 under GST is added", () => {
        const at = (gstRate: string, gstPriceMode: "" | "INCLUDED" | "ADDED") =>
            ({ gstRate, gstPriceMode }) as const;
        expect(gstGoesOnTop(at("18", ""), "ADDED", true)).toBe(true);
        expect(gstGoesOnTop(at("18", "ADDED"), "INCLUDED", true)).toBe(true);
        expect(gstGoesOnTop(at("18", "INCLUDED"), "ADDED", true)).toBe(false);
        expect(gstGoesOnTop(at("18", ""), "INCLUDED", true)).toBe(false);
        expect(gstGoesOnTop(at("0", ""), "ADDED", true)).toBe(false);
        expect(gstGoesOnTop(at("", ""), "ADDED", true)).toBe(false);
        expect(gstGoesOnTop(at("18", ""), "ADDED", false)).toBe(false);
        // The business's way couldn't be told, and the service follows it.
        expect(gstGoesOnTop(at("18", ""), null, true)).toBe(false);
        expect(gstGoesOnTop(at("18", "ADDED"), null, true)).toBe(true);
    });

    it("the deposit note reads the API's amount to pay and deposit", () => {
        const charged = { payCents: 118_000, depositCents: 59_000 };
        expect(
            depositNote("PERCENT_50", "1000", "INR", 1, "BOTH", { charged }),
        ).toBe(
            "They pay ₹590 when booking, and the rest (₹590) at the visit. Refunded if they cancel in time.",
        );
        expect(
            depositNote("FULL", "1000", "INR", 1, "BOTH", {
                charged: { payCents: 118_000, depositCents: 118_000 },
            }),
        ).toBe(
            "They pay ₹1,180 when booking. Refunded if they cancel in time.",
        );
        expect(
            depositNote("PERCENT_50", "1000", "INR", 1, "DESK", { charged }),
        ).toBe("They pay ₹1,180 at the visit.");
        expect(
            depositNote("NONE", "1000", "INR", 1, "ONLINE", {
                charged: { payCents: 118_000, depositCents: null },
            }),
        ).toBe(
            "They pay ₹1,180 online when booking: your booking rules take payment online only.",
        );
    });

    it("a price with GST on top that isn't saved yet is said in words, never summed here", () => {
        const gst = { charged: null, gstOnTop: true };
        expect(depositNote("PERCENT_25", "1000", "INR", 1, "BOTH", gst)).toBe(
            "They pay 25% of the price plus GST when booking, and the rest at the visit. Refunded if they cancel in time.",
        );
        expect(depositNote("FULL", "1000", "INR", 1, "BOTH", gst)).toBe(
            "They pay the price plus GST when booking. Refunded if they cancel in time.",
        );
        expect(depositNote("PERCENT_50", "1000", "INR", 3, "DESK", gst)).toBe(
            "They pay the price plus GST over the visits.",
        );
        expect(depositNote("NONE", "1000", "INR", 1, "ONLINE", gst)).toBe(
            "They pay the price plus GST online when booking: your booking rules take payment online only.",
        );
        expect(depositNote("NONE", "1000", "INR", 1, "BOTH", gst)).toBe(
            "No card needed to book. If they don't come, you lose the time.",
        );
    });
});
