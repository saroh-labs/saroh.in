import type { Service } from "@saroh/database";

import type { PriceTerms } from "../invoices/gst-price";
import { buildSnapshot } from "./reservation";
import { toServiceView } from "./service-fields";
import {
    bookedPriceMode,
    bookedPriceOf,
    bookingGstWords,
    heldAmountCents,
    serviceCharge,
} from "./service-price";

/**
 * What a service costs to book under each way a business carries GST
 * (12 Oct 2026). ₹1,000 at 18%: ₹1,000 to pay when prices include GST,
 * ₹1,180 when GST is added.
 */

const INCLUDES: PriceTerms = { registered: true, mode: "INCLUDED" };
const ADDS: PriceTerms = { registered: true, mode: "ADDED" };
const NOT_REGISTERED: PriceTerms = { registered: false, mode: "ADDED" };

const dec = (v: string) => ({ toString: () => v });

function service(over: Partial<Service> = {}): Service {
    return {
        id: "svc_1",
        organizationId: "org_1",
        name: "Facial",
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        capacity: 1,
        timezone: "Asia/Kolkata",
        priceCents: 100_000,
        currency: "INR",
        gstRate: dec("18"),
        gstPriceMode: null,
        locationType: "IN_PERSON",
        meetingUrl: null,
        depositMode: "NONE",
        ...over,
    } as unknown as Service;
}

const input = (pay?: "NOW" | "DEPOSIT" | "DESK") => ({
    startAt: "2026-10-20T05:30:00.000Z",
    bookerName: "Meera Iyer",
    bookerEmail: "Meera@Example.com",
    ...(pay ? { pay } : {}),
});
const START = new Date("2026-10-20T05:30:00.000Z");
const END = new Date("2026-10-20T06:30:00.000Z");

describe("serviceCharge", () => {
    it("an existing business pays the typed price, GST inside it", () => {
        expect(serviceCharge(service(), INCLUDES)).toEqual({
            listCents: 100_000,
            payCents: 100_000,
            mode: "INCLUDED",
            gst: {
                mode: "INCLUDED",
                rate: "18",
                listCents: 100_000,
                gstCents: 15_254,
                payCents: 100_000,
            },
        });
    });

    it("'GST is added' pays the price plus its GST", () => {
        expect(serviceCharge(service(), ADDS)).toEqual({
            listCents: 100_000,
            payCents: 118_000,
            mode: "ADDED",
            gst: {
                mode: "ADDED",
                rate: "18",
                listCents: 100_000,
                gstCents: 18_000,
                payCents: 118_000,
            },
        });
    });

    it("a service's own choice wins over the business's, both ways", () => {
        expect(
            serviceCharge(service({ gstPriceMode: "ADDED" }), INCLUDES)
                .payCents,
        ).toBe(118_000);
        expect(
            serviceCharge(service({ gstPriceMode: "INCLUDED" }), ADDS).payCents,
        ).toBe(100_000);
    });

    it("says nothing and adds nothing for a business that is not registered", () => {
        expect(serviceCharge(service(), NOT_REGISTERED)).toEqual({
            listCents: 100_000,
            payCents: 100_000,
            mode: null,
            gst: null,
        });
    });

    it("says nothing and adds nothing with no rate, or an exempt one", () => {
        for (const gstRate of [null, dec("0")]) {
            expect(serviceCharge(service({ gstRate } as never), ADDS)).toEqual({
                listCents: 100_000,
                payCents: 100_000,
                mode: null,
                gst: null,
            });
        }
    });

    it("a service with no price has nothing to pay", () => {
        expect(serviceCharge(service({ priceCents: null }), ADDS)).toEqual({
            listCents: null,
            payCents: null,
            mode: null,
            gst: null,
        });
    });
});

describe("what a booking freezes", () => {
    it("an existing business's snapshot keeps the price it always had", () => {
        const snapshot = buildSnapshot(
            service(),
            input(),
            START,
            END,
            INCLUDES,
        ) as { service: Record<string, unknown>; deposit?: unknown };
        expect(snapshot.service.priceCents).toBe(100_000);
        expect(snapshot.service.listPriceCents).toBe(100_000);
        expect(snapshot.service.gstPriceMode).toBe("INCLUDED");
        expect(snapshot.deposit).toBeUndefined();
    });

    it("a business that charges no GST freezes exactly what it did before", () => {
        const snapshot = buildSnapshot(service(), input(), START, END) as {
            service: Record<string, unknown>;
        };
        expect(snapshot.service.priceCents).toBe(100_000);
        expect(snapshot.service).not.toHaveProperty("listPriceCents");
        expect(snapshot.service).not.toHaveProperty("gstPriceMode");
    });

    it("'GST is added' freezes ₹1,180, the typed ₹1,000 and the mode", () => {
        const snapshot = buildSnapshot(service(), input(), START, END, ADDS);
        expect(snapshot.service).toMatchObject({
            priceCents: 118_000,
            listPriceCents: 100_000,
            gstPriceMode: "ADDED",
            currency: "INR",
        });
        expect(bookedPriceMode(snapshot)).toBe("ADDED");
    });

    it("a deposit is a share of the amount to pay: 25% of ₹1,180 is ₹295", () => {
        const snapshot = buildSnapshot(
            service({ depositMode: "PERCENT_25" }),
            input("DEPOSIT"),
            START,
            END,
            ADDS,
        );
        expect(snapshot.deposit).toEqual({ cents: 29_500 });
        expect(heldAmountCents(snapshot, "DEPOSIT")).toBe(29_500);
        // Paying the whole price now holds all of it.
        expect(heldAmountCents(snapshot, "NOW")).toBe(118_000);
    });

    it("the same deposit where prices include GST is 25% of ₹1,000", () => {
        const snapshot = buildSnapshot(
            service({ depositMode: "PERCENT_25" }),
            input("DEPOSIT"),
            START,
            END,
            INCLUDES,
        );
        expect(snapshot.deposit).toEqual({ cents: 25_000 });
    });

    it("keeps the deposit's rounding on an awkward price: half of ₹117.99 is ₹59.00", () => {
        const snapshot = buildSnapshot(
            service({ priceCents: 9_999, depositMode: "PERCENT_50" }),
            input("DEPOSIT"),
            START,
            END,
            ADDS,
        );
        expect(snapshot.service).toMatchObject({ priceCents: 11_799 });
        expect(snapshot.deposit).toEqual({ cents: 5_900 });
    });

    it("bookedPriceOf carries no mode when no GST is charged", () => {
        expect(bookedPriceOf(serviceCharge(service(), NOT_REGISTERED))).toEqual(
            {
                priceCents: 100_000,
                listPriceCents: 100_000,
                gstPriceMode: null,
            },
        );
    });
});

describe("a booking made before the business changed its mind", () => {
    const made = buildSnapshot(
        service({ depositMode: "PERCENT_25" }),
        input("DEPOSIT"),
        START,
        END,
        ADDS,
    );

    it("still reads as ₹1,180 with ₹295 held, whatever the business charges now", () => {
        // Nothing here reads the business's terms again.
        expect(heldAmountCents(made, "NOW")).toBe(118_000);
        expect(heldAmountCents(made, "DEPOSIT")).toBe(29_500);
        expect(bookedPriceMode(made)).toBe("ADDED");
    });

    it("its words say what was charged: ₹250 + ₹45 GST for the deposit", () => {
        expect(
            bookingGstWords({
                cents: 29_500,
                snapshot: made,
                gstRate: dec("18"),
                registered: true,
            }),
        ).toEqual({
            mode: "ADDED",
            rate: "18",
            listCents: 25_000,
            gstCents: 4_500,
            payCents: 29_500,
        });
    });

    it("a booking from before the choice existed reads as including GST", () => {
        const old = { service: { priceCents: 100_000, currency: "INR" } };
        expect(bookedPriceMode(old)).toBeNull();
        expect(heldAmountCents(old, "NOW")).toBe(100_000);
        expect(
            bookingGstWords({
                cents: 100_000,
                snapshot: old,
                gstRate: dec("18"),
                registered: true,
            }),
        ).toMatchObject({ mode: "INCLUDED", gstCents: 15_254 });
    });

    it("reads nothing from a snapshot that names no price", () => {
        expect(heldAmountCents(null, "NOW")).toBeNull();
        expect(heldAmountCents({}, "DEPOSIT")).toBeNull();
        expect(bookedPriceMode({ service: { gstPriceMode: "x" } })).toBeNull();
    });
});

describe("the team's view of a service", () => {
    it("says what a customer pays and the deposit of it", () => {
        const view = toServiceView(
            service({ depositMode: "PERCENT_25" }),
            ADDS,
        );
        expect(view.priceCents).toBe(100_000);
        expect(view.payCents).toBe(118_000);
        expect(view.depositCents).toBe(29_500);
        expect(view.gst).toMatchObject({ mode: "ADDED", gstCents: 18_000 });
    });

    it("is unchanged for an existing business", () => {
        const view = toServiceView(
            service({ depositMode: "PERCENT_25" }),
            INCLUDES,
        );
        expect(view.payCents).toBe(100_000);
        expect(view.depositCents).toBe(25_000);
    });

    it("says nothing about GST without terms", () => {
        const view = toServiceView(service({ depositMode: "PERCENT_50" }));
        expect(view.payCents).toBe(100_000);
        expect(view.depositCents).toBe(50_000);
        expect(view.gst).toBeNull();
    });
});
