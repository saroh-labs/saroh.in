import { BadRequestException } from "@nestjs/common";

import type { FulfilmentType } from "./fulfilment";
import {
    FULFILMENT_RULES,
    FULFILMENT_TYPES,
    fulfilmentView,
    isHandedOver,
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
    it("is release 1: the write switch is off", () => {
        expect(WRITES_NEW_FULFILMENT_VALUES).toBe(false);
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
    it("off: stores the legacy word, and refuses the types today's image can't read", () => {
        expect(storedValueFor("PICKUP")).toBe("COLLECT");
        expect(storedValueFor("LOCAL_DELIVERY")).toBe("DELIVERY");
        for (const t of [
            "SHIPPING",
            "DIGITAL",
            "APPOINTMENT_IN_PERSON",
            "APPOINTMENT_ONLINE",
        ] as const) {
            expect(() => storedValueFor(t)).toThrow(BadRequestException);
        }
        expect(() => storedValueFor("SHIPPING")).toThrow(
            "Shipping isn't available yet.",
        );
    });

    it("on (B2c): stores the type itself", () => {
        for (const t of FULFILMENT_TYPES) {
            expect(storedValueFor(t, true)).toBe(t);
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
});
