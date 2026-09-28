import { describe, expect, it } from "vitest";

import {
    courierChoices,
    courierFields,
    courierName,
    isTrackingLink,
    shipmentOf,
    shipmentWords,
} from "@/lib/orders/courier";
import type {
    FulfilmentStep,
    KitchenStage,
    OrderRead,
} from "@/lib/orders/read";

const step = (stage: KitchenStage, label: string): FulfilmentStep => ({
    stage,
    label,
});

const SHIPPING = [
    step("NEW", "New"),
    step("PREPARING", "Preparing"),
    step("READY", "Ready"),
    step("HANDED_TO_COURIER", "Handed to courier"),
    step("DELIVERED", "Delivered"),
];
const LOCAL = [
    step("NEW", "New"),
    step("PREPARING", "Preparing"),
    step("READY", "Ready"),
    step("OUT_FOR_DELIVERY", "Out for delivery"),
    step("DELIVERED", "Delivered"),
];
const LEGACY_LOCAL = LOCAL.map((s) =>
    s.stage === "OUT_FOR_DELIVERY"
        ? step("HANDED_TO_COURIER", "Handed to courier")
        : s,
);

type Input = Parameters<typeof shipmentOf>[0];

function order(over: Partial<Input> = {}): Input {
    const steps = over.steps ?? SHIPPING;
    const stage = over.stage ?? "HANDED_TO_COURIER";
    return {
        steps,
        stage,
        stepIndex: steps.findIndex((s) => s.stage === stage),
        status: "SHIPPED",
        courierName: null,
        trackingNumber: null,
        trackingUrl: null,
        events: [],
        ...over,
    };
}

const handoverEvent = (
    note: string | null,
    undoneAt: string | null = null,
): OrderRead["events"][number] => ({
    id: `ev_${note ?? "none"}`,
    kind: "STAGE",
    at: "2026-09-27T10:05:00.000Z",
    actor: null,
    fromStage: "READY",
    toStage: "HANDED_TO_COURIER",
    fromStatus: "PROCESSING",
    toStatus: "SHIPPED",
    note,
    undoneAt,
    undoesEventId: null,
});

describe("shipmentOf", () => {
    it("a shipment handed over reads its courier, number and link", () => {
        expect(
            shipmentOf(
                order({
                    courierName: "Delhivery",
                    trackingNumber: "1487 2290 3314",
                    trackingUrl: "https://track.example.in/1487",
                }),
                true,
            ),
        ).toEqual({
            courier: "Delhivery",
            number: "1487 2290 3314",
            url: "https://track.example.in/1487",
            ownDriver: false,
            canChange: true,
        });
    });

    it("handed over with neither: nothing yet, and the number can be added", () => {
        expect(shipmentOf(order(), true)).toMatchObject({
            courier: null,
            number: null,
            canChange: true,
        });
    });

    it("stays after delivery, and can still be changed", () => {
        expect(
            shipmentOf(
                order({ stage: "DELIVERED", courierName: "Blue Dart" }),
                true,
            ),
        ).toMatchObject({ courier: "Blue Dart", canChange: true });
    });

    it("says nothing before the handover", () => {
        expect(shipmentOf(order({ stage: "READY" }), true)).toBeNull();
    });

    it("a local delivery never goes by courier", () => {
        expect(
            shipmentOf(
                order({ steps: LOCAL, stage: "OUT_FOR_DELIVERY" }),
                true,
            ),
        ).toBeNull();
        expect(
            shipmentOf(order({ steps: LOCAL, stage: "DELIVERED" }), true),
        ).toBeNull();
    });

    it("a local delivery handed to a courier before the switch reads like a shipment, named by its step", () => {
        expect(
            shipmentOf(
                order({
                    steps: LEGACY_LOCAL,
                    events: [handoverEvent("Delhivery")],
                    trackingUrl: "https://track.example.in/1",
                }),
                true,
            ),
        ).toEqual({
            courier: "Delhivery",
            number: null,
            url: "https://track.example.in/1",
            ownDriver: false,
            canChange: true,
        });
    });

    it("once that order is delivered, what it has is shown but not offered for change", () => {
        expect(
            shipmentOf(
                order({
                    steps: LOCAL,
                    stage: "DELIVERED",
                    events: [handoverEvent("Blue Dart")],
                    trackingUrl: "https://track.example.in/2",
                }),
                true,
            ),
        ).toMatchObject({ courier: "Blue Dart", canChange: false });
    });

    it("an undone handover step doesn't name the courier", () => {
        expect(
            shipmentOf(
                order({
                    events: [
                        handoverEvent("Delhivery", "2026-09-27T10:06:00Z"),
                    ],
                }),
                true,
            )?.courier,
        ).toBeNull();
    });

    it("the order's own courier wins over its step's words", () => {
        expect(
            shipmentOf(
                order({
                    courierName: "Blue Dart",
                    events: [handoverEvent("Delhivery · 1")],
                }),
                true,
            )?.courier,
        ).toBe("Blue Dart");
    });

    it("can't be changed without order:stage, nor on a cancelled order", () => {
        expect(shipmentOf(order(), false)?.canChange).toBe(false);
        expect(
            shipmentOf(order({ status: "CANCELLED" }), true)?.canChange,
        ).toBe(false);
    });

    it("our own driver has no number to follow", () => {
        expect(
            shipmentOf(order({ courierName: "Our own driver" }), true)
                ?.ownDriver,
        ).toBe(true);
    });
});

describe("courierFields", () => {
    it("at the handover: what was given, trimmed; empty ones left out", () => {
        expect(
            courierFields({
                courier: "Delhivery",
                number: "  1487 2290 3314 ",
                link: "",
            }),
        ).toEqual({
            courierName: "Delhivery",
            trackingNumber: "1487 2290 3314",
        });
    });

    it("our own driver sends no number or link", () => {
        expect(
            courierFields({
                courier: "Our own driver",
                number: "123",
                link: "https://x.in/1",
            }),
        ).toEqual({ courierName: "Our own driver" });
    });

    it("after the handover: only what changed", () => {
        const before = { courier: "Delhivery", number: null, url: null };
        expect(
            courierFields(
                { courier: "Delhivery", number: "AWB 1", link: "" },
                before,
            ),
        ).toEqual({ trackingNumber: "AWB 1" });
        expect(
            courierFields(
                { courier: "Delhivery", number: "", link: "" },
                before,
            ),
        ).toEqual({});
    });

    it("after the handover: a cleared number is sent as null", () => {
        expect(
            courierFields(
                { courier: "Blue Dart", number: "", link: "" },
                { courier: "Delhivery", number: "AWB 1", url: null },
            ),
        ).toEqual({ courierName: "Blue Dart", trackingNumber: null });
    });

    it("switching to our own driver clears the number and link", () => {
        expect(
            courierFields(
                { courier: "Our own driver", number: "AWB 1", link: "" },
                {
                    courier: "Delhivery",
                    number: "AWB 1",
                    url: "https://x.in/1",
                },
            ),
        ).toEqual({
            courierName: "Our own driver",
            trackingNumber: null,
            trackingUrl: null,
        });
    });
});

describe("courierChoices", () => {
    it("offers the usual couriers, the order's own first if it's another, and Other last", () => {
        expect(courierChoices(null)).toEqual([
            "Delhivery",
            "Blue Dart",
            "Our own driver",
            "Other",
        ]);
        expect(courierChoices("Blue Dart")).toHaveLength(4);
        expect(courierChoices("DTDC")).toEqual([
            "DTDC",
            "Delhivery",
            "Blue Dart",
            "Our own driver",
            "Other",
        ]);
        // A courier literally called "Other" isn't offered twice.
        expect(courierChoices("Other")).toHaveLength(4);
    });
});

describe("courierName", () => {
    it("is the chip, or what was typed for Other", () => {
        expect(courierName("Delhivery", "ignored")).toBe("Delhivery");
        expect(courierName("Other", "  DTDC ")).toBe("DTDC");
        expect(courierName("Other", "  ")).toBe("");
    });
});

describe("shipmentWords and isTrackingLink", () => {
    it("joins the courier and number", () => {
        expect(shipmentWords({ courier: "Delhivery", number: "1487" })).toBe(
            "Delhivery · 1487",
        );
        expect(shipmentWords({ courier: "Delhivery", number: null })).toBe(
            "Delhivery",
        );
    });

    it("takes only a whole web address", () => {
        expect(isTrackingLink("https://track.example.in/1")).toBe(true);
        expect(isTrackingLink("track.example.in/1")).toBe(false);
    });
});
