import { BadRequestException } from "@nestjs/common";

import type { FulfilmentType } from "./fulfilment";
import {
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
    legacyWord,
    movesFor,
    shipsToAddress,
    stepIndexOf,
    stepsFor,
    storedValueFor,
    storefrontTypesFrom,
    storefrontTypesOf,
    typeOf,
    WRITES_NEW_FULFILMENT_VALUES,
} from "./fulfilment";
import { canTransitionStatus } from "./order-state";

const words = (type: FulfilmentType, stage = "NEW" as const) =>
    stepsFor(type, stage, true).map((s) => s.label);

describe("the fulfilment rule table (DEC-045)", () => {
    it("is release 2: the write switch is on (B2c)", () => {
        expect(WRITES_NEW_FULFILMENT_VALUES).toBe(true);
    });

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
            for (const writesNew of [false, true]) {
                for (const m of movesFor(type, writesNew)) {
                    if (m.fromStatus === m.toStatus || m.direct) continue;
                    expect(canTransitionStatus(m.fromStatus, m.toStatus)).toBe(
                        true,
                    );
                }
            }
        },
    );

    it.each(FULFILMENT_TYPES)(
        "every %s move goes between two of its own steps (the legacy courier move aside)",
        (type) => {
            for (const m of movesFor(type, true)) {
                const stages = stepsFor(type, m.from, true).map((s) => s.stage);
                expect(stages).toContain(m.from);
                expect(
                    stepsFor(type, m.to, true).map((s) => s.stage),
                ).toContain(m.to);
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
    it("reads a legacy word as its type, and a type as itself", () => {
        expect(typeOf("COLLECT")).toBe("PICKUP");
        expect(typeOf("DELIVERY")).toBe("LOCAL_DELIVERY");
        for (const t of FULFILMENT_TYPES) expect(typeOf(t)).toBe(t);
    });

    it("refuses a value that isn't one (a bug, not a guess)", () => {
        expect(() => typeOf("TELEPORT")).toThrow(/Unknown order fulfilment/);
    });

    it("answers the legacy word an old app reads: an address is DELIVERY, the rest COLLECT", () => {
        expect(FULFILMENT_TYPES.map(legacyWord)).toEqual([
            "COLLECT",
            "DELIVERY",
            "DELIVERY",
            "COLLECT",
            "COLLECT",
            "COLLECT",
        ]);
    });

    it("only a local delivery and a shipment go to an address (bill-to, place of supply)", () => {
        expect(FULFILMENT_TYPES.filter(shipsToAddress)).toEqual([
            "LOCAL_DELIVERY",
            "SHIPPING",
        ]);
    });
});

describe("the write switch", () => {
    it("off (release 1): stores the legacy word, and refuses the types that image's predecessor can't read", () => {
        expect(storedValueFor("PICKUP", false)).toBe("COLLECT");
        expect(storedValueFor("LOCAL_DELIVERY", false)).toBe("DELIVERY");
        for (const t of [
            "SHIPPING",
            "DIGITAL",
            "APPOINTMENT_IN_PERSON",
            "APPOINTMENT_ONLINE",
        ] as const) {
            expect(() => storedValueFor(t, false)).toThrow(BadRequestException);
        }
        expect(() => storedValueFor("SHIPPING", false)).toThrow(
            "Shipping isn't available yet.",
        );
    });

    it("on (B2c, the default now): stores each physical type and Digital as itself", () => {
        for (const t of [
            "PICKUP",
            "LOCAL_DELIVERY",
            "SHIPPING",
            "DIGITAL",
        ] as const) {
            expect(storedValueFor(t)).toBe(t);
        }
    });

    it("on: an appointment is never typed into an order; it is booked (E9)", () => {
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

    it("on: the default moves are the final table", () => {
        for (const t of FULFILMENT_TYPES) {
            expect(movesFor(t)).toEqual(FULFILMENT_RULES[t].moves);
        }
    });

    it("off: a local delivery is handed over as today; on: sent out for delivery", () => {
        const fromReady = (writesNew: boolean) =>
            movesFor("LOCAL_DELIVERY", writesNew)
                .filter((m) => m.from === "READY")
                .map((m) => m.to);
        expect(fromReady(false)).toEqual(["HANDED_TO_COURIER"]);
        expect(fromReady(true)).toEqual(["OUT_FOR_DELIVERY"]);
        // Moves out of the new stage stay either way: release 1 serves
        // release 2's rows.
        for (const writesNew of [false, true]) {
            expect(
                movesFor("LOCAL_DELIVERY", writesNew)
                    .filter((m) => m.to === "DELIVERED")
                    .map((m) => m.from),
            ).toEqual(["OUT_FOR_DELIVERY", "HANDED_TO_COURIER"]);
        }
    });
});

describe("steps and where an order stands", () => {
    it("a local delivery shows the handover it takes: today's before the switch", () => {
        const fourth = (
            stage: "READY" | "OUT_FOR_DELIVERY" | "HANDED_TO_COURIER",
            on: boolean,
        ) => stepsFor("LOCAL_DELIVERY", stage, on)[3];
        expect(fourth("READY", false)).toEqual({
            stage: "HANDED_TO_COURIER",
            label: "Handed to courier",
        });
        expect(fourth("READY", true)).toEqual({
            stage: "OUT_FOR_DELIVERY",
            label: "Out for delivery",
        });
        // A row the switch release wrote reads as what it is…
        expect(fourth("OUT_FOR_DELIVERY", false).stage).toBe(
            "OUT_FOR_DELIVERY",
        );
        // …and one handed over the old way keeps its step after the switch.
        expect(fourth("HANDED_TO_COURIER", true).stage).toBe(
            "HANDED_TO_COURIER",
        );
    });

    it("after the switch, a backfilled order reads exactly as its legacy word did", () => {
        // COLLECT → PICKUP and DELIVERY → LOCAL_DELIVERY by the migration:
        // the same type, steps, step index, label and ticket either way.
        for (const stage of [
            "NEW",
            "PREPARING",
            "READY",
            "COLLECTED",
        ] as const) {
            expect(fulfilmentView("PICKUP", stage)).toEqual(
                fulfilmentView("COLLECT", stage),
            );
        }
        for (const stage of [
            "NEW",
            "READY",
            "OUT_FOR_DELIVERY",
            "HANDED_TO_COURIER",
            "DELIVERED",
        ] as const) {
            expect(fulfilmentView("LOCAL_DELIVERY", stage)).toEqual(
                fulfilmentView("DELIVERY", stage),
            );
        }
        // A ready local delivery is now offered Out for delivery next.
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

    it("answers the legacy word and the type together, for both vocabularies", () => {
        const collect = fulfilmentView("COLLECT", "READY");
        expect(collect).toEqual(fulfilmentView("PICKUP", "READY"));
        expect(collect).toMatchObject({
            fulfilment: "COLLECT",
            fulfilmentType: "PICKUP",
            fulfilmentLabel: "Pick-up",
            stepIndex: 2,
            ticketName: "Order ticket",
        });
        expect(fulfilmentView("DELIVERY", "HANDED_TO_COURIER")).toMatchObject({
            fulfilment: "DELIVERY",
            fulfilmentType: "LOCAL_DELIVERY",
            stepIndex: 3,
            ticketName: "Packing slip",
        });
        expect(fulfilmentView("SHIPPING", "NEW")).toMatchObject({
            fulfilment: "DELIVERY",
            fulfilmentType: "SHIPPING",
        });
        expect(fulfilmentView("DIGITAL", "SENT")).toMatchObject({
            fulfilment: "COLLECT",
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
            storefrontTypesOf(["SHIPPING", "DELIVERY", "DIGITAL", "PICKUP"]),
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
        fulfilment: "COLLECT",
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
        ["COLLECT", 120],
        ["PICKUP", 120],
        ["DELIVERY", 1440],
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
                fulfilment: "DELIVERY",
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

    it("gives the list's SQL each stored value's type and the same steps, under both vocabularies", () => {
        expect(Object.fromEntries(lateStoredValues())).toEqual({
            COLLECT: "PICKUP",
            DELIVERY: "LOCAL_DELIVERY",
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
        expect(goesByCourier("DELIVERY", "HANDED_TO_COURIER")).toBe(true);
        expect(goesByCourier("LOCAL_DELIVERY", "HANDED_TO_COURIER")).toBe(true);
        // With the switch on a local delivery goes out for delivery.
        for (const stored of ["DELIVERY", "LOCAL_DELIVERY"]) {
            expect(goesByCourier(stored, "READY")).toBe(false);
            expect(goesByCourier(stored, "OUT_FOR_DELIVERY")).toBe(false);
        }
        for (const stored of [
            "COLLECT",
            "PICKUP",
            "DIGITAL",
            "APPOINTMENT_IN_PERSON",
            "APPOINTMENT_ONLINE",
        ]) {
            expect(goesByCourier(stored, "NEW")).toBe(false);
        }
    });
});
