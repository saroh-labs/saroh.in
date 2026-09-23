import { describe, expect, it } from "vitest";

import {
    allergyCheck,
    canCancel,
    eventText,
    flowOf,
    isOpen,
    kitchenStanding,
    PAYMENT_TRANSITIONS,
    refundableQuantity,
    standingOf,
    waiting,
} from "@/lib/orders/lifecycle";
import type { OrderReadEvent, OrderReadLine } from "@/lib/orders/read";

describe("canCancel", () => {
    it("allows cancelling before the goods go out, and not after", () => {
        expect(canCancel("PENDING")).toBe(true);
        expect(canCancel("PROCESSING")).toBe(true);
        expect(canCancel("SHIPPED")).toBe(false);
    });
});

describe("standingOf", () => {
    it("puts money first: a refunded delivery reads as refunded", () => {
        expect(standingOf("DELIVERED", "REFUNDED")).toBe("REFUNDED");
    });

    it("then cancellation, then the goods", () => {
        expect(standingOf("CANCELLED", "UNPAID")).toBe("CANCELLED");
        expect(standingOf("PROCESSING", "PAID")).toBe("UNFULFILLED");
        expect(standingOf("SHIPPED", "PAID")).toBe("FULFILLED");
    });
});

describe("payment moves", () => {
    it("never goes back to unpaid", () => {
        for (const next of Object.values(PAYMENT_TRANSITIONS)) {
            expect(next).not.toContain("UNPAID");
        }
    });
});

const SESAME = { id: "al_sesame", name: "Sesame" };
const GLUTEN = { id: "al_gluten", name: "Gluten" };
const NUTS = { id: "al_nuts", name: "Nuts" };

const line = (over: Partial<OrderReadLine> = {}): OrderReadLine => ({
    id: "li_1",
    productId: "p_1",
    name: "Sourdough loaf",
    variantTitle: null,
    sku: null,
    imageUrl: null,
    allergens: { contains: [GLUTEN], mayContain: [NUTS, SESAME] },
    quantity: 2,
    refundedQuantity: 0,
    ...over,
});

describe("the kitchen flow", () => {
    it("collects at the counter, or goes out with a courier", () => {
        expect(flowOf("COLLECT")).toEqual([
            "NEW",
            "PREPARING",
            "READY",
            "COLLECTED",
        ]);
        expect(flowOf("DELIVERY").at(-2)).toBe("HANDED_TO_COURIER");
    });

    it("is open until its last stage, a cancel or a refund in full", () => {
        const o = {
            status: "PROCESSING" as const,
            stage: "READY" as const,
            fulfilment: "COLLECT" as const,
            refundStanding: "NONE" as const,
        };
        expect(isOpen(o)).toBe(true);
        expect(isOpen({ ...o, stage: "COLLECTED" })).toBe(false);
        expect(isOpen({ ...o, refundStanding: "REFUNDED" })).toBe(false);
        expect(isOpen({ ...o, refundStanding: "PARTLY_REFUNDED" })).toBe(true);
        expect(isOpen({ ...o, status: "CANCELLED" })).toBe(false);
    });

    it("reads a partial refund as the order it still is", () => {
        const o = { status: "DELIVERED", paymentStatus: "PAID" } as const;
        expect(
            kitchenStanding({ ...o, refundStanding: "PARTLY_REFUNDED" }),
        ).toBe("FULFILLED");
        expect(kitchenStanding({ ...o, refundStanding: "REFUNDED" })).toBe(
            "REFUNDED",
        );
    });
});

describe("waiting", () => {
    const placed = "2026-09-23T09:14:00Z";
    const at = (min: number) => Date.parse(placed) + min * 60_000;

    it("counts minutes, and is late from the 20-minute target", () => {
        expect(waiting(placed, at(16))).toEqual({
            text: "Waiting 16 min",
            minutes: 16,
            late: false,
        });
        expect(waiting(placed, at(20)).late).toBe(true);
    });

    it("reads hours and days as hours and days", () => {
        expect(waiting(placed, at(222)).text).toBe("Waiting 3 h 42 min");
        expect(waiting(placed, at(60 * 50)).text).toBe("Waiting 2 days");
    });
});

describe("allergyCheck", () => {
    it("matches the note's allergens to a line's by id, not by spelling", () => {
        const check = allergyCheck(
            [
                line(),
                line({
                    id: "li_2",
                    name: "Butter croissant",
                    allergens: { contains: [GLUTEN], mayContain: [] },
                }),
            ],
            [{ body: "Sesame allergy", allergens: [SESAME] }],
        );
        expect(check.hits).toEqual([SESAME]);
        expect(check.lines).toEqual({ li_1: "May contain sesame" });
        expect(check.named).toEqual(["Sourdough loaf — may contain sesame"]);
    });

    it("says contains over may contain", () => {
        const check = allergyCheck(
            [line()],
            [{ body: "Coeliac; nuts", allergens: [GLUTEN, NUTS] }],
        );
        expect(check.lines.li_1).toBe("Contains gluten");
        expect(check.hits).toEqual([GLUTEN, NUTS]);
    });

    it("finds nothing when the note names an allergen no line has", () => {
        const check = allergyCheck(
            [line()],
            [{ body: "Peanuts", allergens: [{ id: "al_p", name: "Peanuts" }] }],
        );
        expect(check.hits).toEqual([]);
        expect(check.named).toEqual([]);
    });
});

describe("eventText", () => {
    const ev = (over: Partial<OrderReadEvent>): OrderReadEvent => ({
        id: "ev",
        kind: "STAGE",
        at: "2026-09-23T09:30:00Z",
        actor: null,
        fromStage: "NEW",
        toStage: "PREPARING",
        fromStatus: null,
        toStatus: null,
        note: null,
        undoneAt: null,
        undoesEventId: null,
        ...over,
    });
    const money = (c: number) => `₹${c / 100}`;

    it("names each step, and says when one was undone", () => {
        expect(eventText(ev({}), money)).toBe("Preparing");
        expect(eventText(ev({ undoneAt: "2026-09-23T09:31:00Z" }), money)).toBe(
            "Preparing — undone",
        );
        expect(
            eventText(
                ev({ kind: "UNDO", fromStage: "READY", toStage: "PREPARING" }),
                money,
            ),
        ).toBe("Undone — back to preparing");
    });

    it("names the courier it went with", () => {
        expect(
            eventText(
                ev({ toStage: "HANDED_TO_COURIER", note: "Delhivery" }),
                money,
            ),
        ).toBe("Handed to Delhivery");
    });

    it("shows a refund's amount only when the money was sent", () => {
        expect(
            eventText(ev({ kind: "REFUND", amountCents: 36000 }), money),
        ).toBe("Refunded ₹360");
        expect(eventText(ev({ kind: "REFUND" }), money)).toBe("Refunded");
    });

    it("never claims a message went to the customer", () => {
        for (const to of ["READY", "COLLECTED", "HANDED_TO_COURIER"]) {
            expect(eventText(ev({ toStage: to }), money)).not.toMatch(
                /text|email|sms|sent|told/i,
            );
        }
    });
});

describe("refundableQuantity", () => {
    it("is what is left after earlier refunds", () => {
        expect(
            refundableQuantity(line({ quantity: 3, refundedQuantity: 1 })),
        ).toBe(2);
        expect(
            refundableQuantity(line({ quantity: 1, refundedQuantity: 1 })),
        ).toBe(0);
    });
});
