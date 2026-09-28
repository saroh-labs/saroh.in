import { BadRequestException, ConflictException } from "@nestjs/common";

import type { FulfilmentType } from "./fulfilment";
import {
    allowedTypes,
    assertItemsAllow,
    DEFAULT_LATE_THRESHOLDS,
    FULFILMENT_RULES,
    FULFILMENT_TYPES,
    fulfilmentView,
    goesByCourier,
    isHandedOver,
    LATE_STAGES,
    LATE_STATUSES,
    lateAfterMinutesOf,
    lateOf,
    lateStoredValues,
    movesFor,
    PRODUCT_FULFILMENT_TYPES,
    productTypesOf,
    shipsToAddress,
    stepIndexOf,
    stepsFor,
    storedValueFor,
    storedValuesOf,
    storefrontTypesFrom,
    storefrontTypesOf,
    typeOf,
} from "./fulfilment";
import { canTransitionStatus } from "./order-state";

const words = (type: FulfilmentType, stage = "NEW" as const) =>
    stepsFor(type, stage).map((s) => s.label);

describe("the fulfilment rule table (DEC-045)", () => {
    it("gives each type the designs' steps, late default, ticket and done word", () => {
        expect(words("PICKUP")).toEqual([
            "New",
            "Preparing",
            "Ready",
            "Collected",
        ]);
        expect(words("LOCAL_DELIVERY")).toEqual([
            "New",
            "Preparing",
            "Ready",
            "Out for delivery",
            "Delivered",
        ]);
        expect(words("SHIPPING")).toEqual([
            "New",
            "Preparing",
            "Ready",
            "Handed to courier",
            "Delivered",
        ]);
        expect(words("DIGITAL")).toEqual(["Paid", "Sent"]);
        expect(words("APPOINTMENT_IN_PERSON")).toEqual(["Booked", "Attended"]);
        expect(words("APPOINTMENT_ONLINE")).toEqual(["Booked", "Attended"]);

        const pick = (k: "lateAfterMinutes" | "ticketName" | "doneWord") =>
            FULFILMENT_TYPES.map((t) => FULFILMENT_RULES[t][k]);
        expect(pick("lateAfterMinutes")).toEqual([
            120,
            1440,
            2880,
            null,
            null,
            null,
        ]);
        expect(pick("ticketName")).toEqual([
            "Order ticket",
            "Packing slip",
            "Packing slip",
            null,
            null,
            null,
        ]);
        expect(pick("doneWord")).toEqual([
            "Collected",
            "Delivered",
            "Delivered",
            "Sent",
            "Attended",
            "Attended",
        ]);
    });

    it.each(FULFILMENT_TYPES)(
        "every %s move maps onto a status move the status table allows (or is the kitchen's own)",
        (type) => {
            for (const m of movesFor(type)) {
                if (m.fromStatus === m.toStatus || m.direct) continue;
                expect(canTransitionStatus(m.fromStatus, m.toStatus)).toBe(
                    true,
                );
            }
        },
    );

    it.each(FULFILMENT_TYPES)(
        "every %s move goes between two of its own steps (the legacy courier move aside)",
        (type) => {
            for (const m of movesFor(type)) {
                const stages = stepsFor(type, m.from).map((s) => s.stage);
                expect(stages).toContain(m.from);
                expect(stepsFor(type, m.to).map((s) => s.stage)).toContain(
                    m.to,
                );
            }
        },
    );

    it("appointments make no kitchen moves", () => {
        expect(movesFor("APPOINTMENT_IN_PERSON")).toEqual([]);
        expect(movesFor("APPOINTMENT_ONLINE")).toEqual([]);
        expect(FULFILMENT_RULES.APPOINTMENT_ONLINE.visits).toBe(true);
    });
});

describe("the normaliser", () => {
    it("reads a type as itself", () => {
        for (const t of FULFILMENT_TYPES) expect(typeOf(t)).toBe(t);
    });

    it("refuses a value that isn't one (a bug, not a guess)", () => {
        expect(() => typeOf("TELEPORT")).toThrow(/Unknown order fulfilment/);
    });

    it("no longer knows the legacy words: the contract release dropped them (B2d)", () => {
        expect(() => typeOf("COLLECT")).toThrow(/Unknown order fulfilment/);
        expect(() => typeOf("DELIVERY")).toThrow(/Unknown order fulfilment/);
        expect(FULFILMENT_TYPES).not.toContain("COLLECT");
        expect(FULFILMENT_TYPES).not.toContain("DELIVERY");
    });

    it("a filter by type matches each type once, as itself, in table order", () => {
        expect(storedValuesOf(["SHIPPING", "PICKUP", "SHIPPING"])).toEqual([
            "PICKUP",
            "SHIPPING",
        ]);
        expect(() => storedValuesOf(["COLLECT"])).toThrow(
            /Unknown order fulfilment/,
        );
    });

    it("only a local delivery and a shipment go to an address (bill-to, place of supply)", () => {
        expect(FULFILMENT_TYPES.filter(shipsToAddress)).toEqual([
            "LOCAL_DELIVERY",
            "SHIPPING",
        ]);
    });
});

describe("what a write stores", () => {
    it("stores each physical type and Digital as itself", () => {
        for (const t of [
            "PICKUP",
            "LOCAL_DELIVERY",
            "SHIPPING",
            "DIGITAL",
        ] as const) {
            expect(storedValueFor(t)).toBe(t);
        }
    });

    it("an appointment is never typed into an order; it is booked (E9)", () => {
        for (const t of [
            "APPOINTMENT_IN_PERSON",
            "APPOINTMENT_ONLINE",
        ] as const) {
            expect(() => storedValueFor(t)).toThrow(BadRequestException);
            expect(() => storedValueFor(t)).toThrow(
                "An appointment is made by booking it, not by adding an order.",
            );
        }
    });

    it("the moves are the table's", () => {
        for (const t of FULFILMENT_TYPES) {
            expect(movesFor(t)).toEqual(FULFILMENT_RULES[t].moves);
        }
    });

    it("a ready local delivery goes out for delivery; one with a courier the old way still moves on", () => {
        const moves = movesFor("LOCAL_DELIVERY");
        expect(
            moves.filter((m) => m.from === "READY").map((m) => m.to),
        ).toEqual(["OUT_FOR_DELIVERY"]);
        // The legacy move stays after the contract release: it is a stage,
        // not an enum value, and old orders keep it (B2d).
        expect(
            moves.filter((m) => m.to === "DELIVERED").map((m) => m.from),
        ).toEqual(["OUT_FOR_DELIVERY", "HANDED_TO_COURIER"]);
    });
});

describe("steps and where an order stands", () => {
    it("a local delivery shows the handover it takes, or took the old way", () => {
        const fourth = (
            stage: "READY" | "OUT_FOR_DELIVERY" | "HANDED_TO_COURIER",
        ) => stepsFor("LOCAL_DELIVERY", stage)[3];
        expect(fourth("READY")).toEqual({
            stage: "OUT_FOR_DELIVERY",
            label: "Out for delivery",
        });
        expect(fourth("OUT_FOR_DELIVERY").stage).toBe("OUT_FOR_DELIVERY");
        // One handed over the old way (before B2c) keeps its step for good.
        expect(fourth("HANDED_TO_COURIER")).toEqual({
            stage: "HANDED_TO_COURIER",
            label: "Handed to courier",
        });
    });

    it("a ready local delivery is offered Out for delivery next", () => {
        expect(
            fulfilmentView("LOCAL_DELIVERY", "READY").steps.map((s) => s.label),
        ).toEqual([
            "New",
            "Preparing",
            "Ready",
            "Out for delivery",
            "Delivered",
        ]);
    });

    it("finds the step; a stage the type lacks reads as done if it ends an order", () => {
        const steps = stepsFor("PICKUP", "NEW");
        expect(stepIndexOf(steps, "READY")).toBe(2);
        expect(stepIndexOf(steps, "DELIVERED")).toBe(3);
        expect(stepIndexOf(steps, "HANDED_TO_COURIER")).toBe(0);
        expect(
            stepIndexOf(
                stepsFor("APPOINTMENT_ONLINE", "DELIVERED"),
                "DELIVERED",
            ),
        ).toBe(1);
    });

    it("answers the type, its label, steps and ticket, and no legacy word (B2d)", () => {
        const pickup = fulfilmentView("PICKUP", "READY");
        expect(pickup).toMatchObject({
            fulfilmentType: "PICKUP",
            fulfilmentLabel: "Pick-up",
            stepIndex: 2,
            ticketName: "Order ticket",
        });
        expect(pickup).not.toHaveProperty("fulfilment");
        expect(
            fulfilmentView("LOCAL_DELIVERY", "HANDED_TO_COURIER"),
        ).toMatchObject({
            fulfilmentType: "LOCAL_DELIVERY",
            stepIndex: 3,
            ticketName: "Packing slip",
        });
        expect(fulfilmentView("SHIPPING", "NEW")).toMatchObject({
            fulfilmentType: "SHIPPING",
        });
        expect(fulfilmentView("DIGITAL", "SENT")).toMatchObject({
            stepIndex: 1,
            ticketName: null,
        });
    });

    it("knows when an order has left: from its handover on", () => {
        expect(isHandedOver("PICKUP", "READY")).toBe(false);
        expect(isHandedOver("PICKUP", "COLLECTED")).toBe(true);
        expect(isHandedOver("LOCAL_DELIVERY", "OUT_FOR_DELIVERY")).toBe(true);
        expect(isHandedOver("LOCAL_DELIVERY", "HANDED_TO_COURIER")).toBe(true);
        expect(isHandedOver("SHIPPING", "READY")).toBe(false);
        expect(isHandedOver("SHIPPING", "DELIVERED")).toBe(true);
        expect(isHandedOver("DIGITAL", "SENT")).toBe(true);
    });
});

describe("a storefront's ways", () => {
    it("follow the toggles and whether it has delivered, in table order", () => {
        expect(
            storefrontTypesFrom({
                collectionEnabled: true,
                shippingEnabled: true,
                localDelivery: true,
            }),
        ).toEqual(["PICKUP", "LOCAL_DELIVERY", "SHIPPING"]);
        expect(
            storefrontTypesFrom({
                collectionEnabled: false,
                shippingEnabled: false,
                localDelivery: false,
            }),
        ).toEqual([]);
    });

    it("read a stored list as types, leaving out anything not a storefront's own", () => {
        expect(
            storefrontTypesOf([
                "SHIPPING",
                "LOCAL_DELIVERY",
                "DIGITAL",
                "PICKUP",
            ]),
        ).toEqual(["PICKUP", "LOCAL_DELIVERY", "SHIPPING"]);
    });

    it("read an empty list from the toggles, as a row the old image made (O-3)", () => {
        // The image before B2a creates a row without the column: `[]`.
        expect(
            storefrontTypesOf([], {
                collectionEnabled: true,
                shippingEnabled: true,
            }),
        ).toEqual(["PICKUP", "SHIPPING"]);
        expect(
            storefrontTypesOf([], {
                collectionEnabled: false,
                shippingEnabled: true,
            }),
        ).toEqual(["SHIPPING"]);
        // Saved empty on purpose: both toggles went off with it.
        expect(
            storefrontTypesOf([], {
                collectionEnabled: false,
                shippingEnabled: false,
            }),
        ).toEqual([]);
        // A stored list is read as stored, whatever the toggles say.
        expect(
            storefrontTypesOf(["LOCAL_DELIVERY"], {
                collectionEnabled: true,
                shippingEnabled: true,
            }),
        ).toEqual(["LOCAL_DELIVERY"]);
    });
});

describe("the late rule (DEC-045, default 16)", () => {
    const placedAt = new Date("2026-10-10T09:00:00.000Z");
    const after = (minutes: number) =>
        new Date(placedAt.getTime() + minutes * 60_000);
    const open = {
        fulfilment: "PICKUP",
        stage: "NEW",
        status: "PENDING",
        paymentStatus: "PAID",
        placedAt,
    };

    it("defaults to 2 hours, 24 hours and 48 hours; Digital and appointments have none", () => {
        expect(DEFAULT_LATE_THRESHOLDS).toEqual({
            PICKUP: 120,
            LOCAL_DELIVERY: 1440,
            SHIPPING: 2880,
        });
        expect(FULFILMENT_TYPES.map((t) => lateAfterMinutesOf(t))).toEqual([
            120,
            1440,
            2880,
            null,
            null,
            null,
        ]);
    });

    it.each([
        ["PICKUP", 120],
        ["LOCAL_DELIVERY", 1440],
        ["SHIPPING", 2880],
    ])(
        "a %s order is late only once past %i minutes",
        (fulfilment, threshold) => {
            const at = (m: number) => lateOf({ ...open, fulfilment }, after(m));
            expect(at(threshold - 1)).toEqual({
                lateAfterMinutes: threshold,
                late: false,
                lateBy: null,
            });
            // Exactly at the threshold isn't past it (the list's SQL is `<`).
            expect(at(threshold).late).toBe(false);
            expect(at(threshold + 5)).toEqual({
                lateAfterMinutes: threshold,
                late: true,
                lateBy: 5,
            });
        },
    );

    it("says late by at least a minute the moment it is past", () => {
        const now = new Date(after(120).getTime() + 1_000);
        expect(lateOf(open, now)).toMatchObject({ late: true, lateBy: 1 });
    });

    it("counts elapsed time, so the business's zone can't move it", () => {
        // Placed 23:30 IST, read 01:31 IST the next day: past two hours
        // across the business's midnight, as it is in UTC.
        const placed = new Date("2026-10-10T18:00:00.000Z");
        const now = new Date("2026-10-10T20:01:00.000Z");
        expect(lateOf({ ...open, placedAt: placed }, now)).toMatchObject({
            late: true,
            lateBy: 1,
        });
    });

    it("starts the clock at placed: a pay-later order paid an hour ago is late 3 hours after placing", () => {
        // Nothing reads when it was paid; placed three hours ago is late
        // for Pick-up by an hour.
        expect(lateOf(open, after(180))).toMatchObject({
            late: true,
            lateBy: 60,
        });
        // Not paid yet counts from placed too.
        expect(
            lateOf({ ...open, paymentStatus: "UNPAID" }, after(180)).late,
        ).toBe(true);
    });

    it("is judged on every step before handover", () => {
        for (const [stage, status] of [
            ["NEW", "PENDING"],
            ["PREPARING", "PROCESSING"],
            ["READY", "PROCESSING"],
        ] as const) {
            expect(lateOf({ ...open, stage, status }, after(121)).late).toBe(
                true,
            );
        }
    });

    it("never calls an order late once it is handed over, cancelled or refunded", () => {
        const now = after(10_000);
        const cases = [
            { stage: "COLLECTED", status: "DELIVERED" },
            {
                fulfilment: "LOCAL_DELIVERY",
                stage: "HANDED_TO_COURIER",
                status: "SHIPPED",
            },
            {
                fulfilment: "LOCAL_DELIVERY",
                stage: "OUT_FOR_DELIVERY",
                status: "SHIPPED",
            },
            { fulfilment: "SHIPPING", stage: "DELIVERED", status: "DELIVERED" },
            { stage: "NEW", status: "CANCELLED" },
            { stage: "READY", status: "PROCESSING", paymentStatus: "REFUNDED" },
        ];
        for (const c of cases) {
            expect(lateOf({ ...open, ...c }, now)).toMatchObject({
                late: false,
                lateBy: null,
            });
        }
        // The threshold is still the type's, for the screen to say.
        expect(lateOf({ ...open, ...cases[0] }, now).lateAfterMinutes).toBe(
            120,
        );
    });

    it("never calls a digital order or an appointment late", () => {
        for (const fulfilment of [
            "DIGITAL",
            "APPOINTMENT_IN_PERSON",
            "APPOINTMENT_ONLINE",
        ]) {
            expect(lateOf({ ...open, fulfilment }, after(100_000))).toEqual({
                lateAfterMinutes: null,
                late: false,
                lateBy: null,
            });
        }
    });

    it("reads a storefront's own thresholds when given (B17)", () => {
        const counter = { ...DEFAULT_LATE_THRESHOLDS, PICKUP: 20 };
        expect(lateOf(open, after(25), counter)).toEqual({
            lateAfterMinutes: 20,
            late: true,
            lateBy: 5,
        });
        const slow = { ...DEFAULT_LATE_THRESHOLDS, SHIPPING: 72 * 60 };
        expect(
            lateOf({ ...open, fulfilment: "SHIPPING" }, after(50 * 60), slow)
                .late,
        ).toBe(false);
    });

    it("gives the list's SQL each stored value's type and the same steps", () => {
        expect(Object.fromEntries(lateStoredValues())).toEqual({
            PICKUP: "PICKUP",
            LOCAL_DELIVERY: "LOCAL_DELIVERY",
            SHIPPING: "SHIPPING",
        });
        expect(LATE_STAGES).toEqual(["NEW", "PREPARING", "READY"]);
        expect(LATE_STATUSES).toEqual(["PENDING", "PROCESSING"]);
    });
});

describe("going by courier", () => {
    it("a shipment does, and a local delivery only if handed over the old way; the rest never", () => {
        expect(goesByCourier("SHIPPING", "READY")).toBe(true);
        expect(goesByCourier("LOCAL_DELIVERY", "HANDED_TO_COURIER")).toBe(true);
        // A local delivery goes out for delivery.
        expect(goesByCourier("LOCAL_DELIVERY", "READY")).toBe(false);
        expect(goesByCourier("LOCAL_DELIVERY", "OUT_FOR_DELIVERY")).toBe(false);
        for (const stored of [
            "PICKUP",
            "DIGITAL",
            "APPOINTMENT_IN_PERSON",
            "APPOINTMENT_ONLINE",
        ]) {
            expect(goesByCourier(stored, "NEW")).toBe(false);
        }
    });
});

describe("product fulfilment types (B12)", () => {
    const cake = {
        name: "Chocolate cake",
        fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
    };
    const jar = { name: "Honey jar", fulfilmentTypes: ["SHIPPING"] };
    const anyWay = { name: "Candle", fulfilmentTypes: [] as string[] };
    const all = ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"] as const;

    it("a product is set to a storefront's ways or Digital, never an appointment", () => {
        expect(PRODUCT_FULFILMENT_TYPES).toEqual([
            "PICKUP",
            "LOCAL_DELIVERY",
            "SHIPPING",
            "DIGITAL",
        ]);
    });

    it("reads a stored list in table order, as types, without duplicates", () => {
        expect(productTypesOf(["SHIPPING", "PICKUP", "SHIPPING"])).toEqual([
            "PICKUP",
            "SHIPPING",
        ]);
        // An appointment is left out.
        expect(
            productTypesOf(["LOCAL_DELIVERY", "PICKUP", "APPOINTMENT_ONLINE"]),
        ).toEqual(["PICKUP", "LOCAL_DELIVERY"]);
        expect(productTypesOf([])).toEqual([]);
        expect(() => productTypesOf(["TELEPORT"])).toThrow();
    });

    it("offers only what every item allows: a cake and a shipped jar share nothing", () => {
        expect(allowedTypes([cake], all)).toEqual(["PICKUP", "LOCAL_DELIVERY"]);
        expect(allowedTypes([cake, jar], all)).toEqual([]);
        // The jar allows Pick-up and Local delivery too: both are offered.
        const jarToo = {
            ...jar,
            fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY", "SHIPPING"],
        };
        expect(allowedTypes([cake, jarToo], all)).toEqual([
            "PICKUP",
            "LOCAL_DELIVERY",
        ]);
    });

    it("an empty list is every way the storefront offers, and never Digital", () => {
        expect(allowedTypes([anyWay], all)).toEqual([...all]);
        expect(allowedTypes([anyWay], ["PICKUP"])).toEqual(["PICKUP"]);
        expect(allowedTypes([anyWay, cake], ["PICKUP", "SHIPPING"])).toEqual([
            "PICKUP",
        ]);
        // No items yet: what the storefront offers.
        expect(allowedTypes([], ["SHIPPING"])).toEqual(["SHIPPING"]);
        expect(allowedTypes([], [])).toEqual([]);
    });

    it("the storefront narrows its own ways, but Digital follows the products", () => {
        const ebook = { name: "Recipe ebook", fulfilmentTypes: ["DIGITAL"] };
        expect(allowedTypes([ebook], [])).toEqual(["DIGITAL"]);
        expect(allowedTypes([ebook, ebook], all)).toEqual(["DIGITAL"]);
        expect(allowedTypes([ebook, anyWay], all)).toEqual([]);
        const giftCard = {
            name: "Gift card",
            fulfilmentTypes: ["DIGITAL", "SHIPPING"],
        };
        expect(allowedTypes([giftCard], ["PICKUP"])).toEqual(["DIGITAL"]);
        expect(allowedTypes([giftCard], all)).toEqual(["SHIPPING", "DIGITAL"]);
    });

    it("refuses a type an item's own list leaves out, naming the item (409)", () => {
        expect(() => assertItemsAllow([anyWay, cake], "SHIPPING")).toThrow(
            ConflictException,
        );
        try {
            assertItemsAllow([anyWay, cake], "SHIPPING");
        } catch (error) {
            expect((error as ConflictException).getResponse()).toEqual({
                message:
                    "Chocolate cake isn't sold for Shipping. It allows Pick-up and Local delivery only.",
                field: "fulfilment",
            });
        }
        expect(() => assertItemsAllow([jar], "PICKUP")).toThrow(
            "Honey jar isn't sold for Pick-up. It allows Shipping only.",
        );
    });

    it("lets through a type every list allows, and any type when no item has a list", () => {
        expect(() => assertItemsAllow([cake], "PICKUP")).not.toThrow();
        expect(() => assertItemsAllow([cake], "LOCAL_DELIVERY")).not.toThrow();
        // An empty list behaves as before B12, whatever the type.
        for (const type of FULFILMENT_TYPES) {
            expect(() => assertItemsAllow([anyWay], type)).not.toThrow();
        }
        expect(() => assertItemsAllow([], "SHIPPING")).not.toThrow();
    });
});
