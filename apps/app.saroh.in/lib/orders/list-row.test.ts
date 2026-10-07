import { describe, expect, it } from "vitest";

import type { OrderRow } from "@/lib/orders/business-service";
import {
    ageWords,
    nextVisitWords,
    rowAge,
    rowCustomer,
    rowInitials,
    rowMoney,
    rowProgress,
    rowSubline,
} from "@/lib/orders/list-row";
import type { FulfilmentStep } from "@/lib/orders/read";

/**
 * The Orders list's row words (plan B, B3): the step pill and its progress
 * from the row's `steps` and `stepIndex`, the age or "Late", and the money
 * only when the API sent it.
 */

const PICKUP: FulfilmentStep[] = [
    { stage: "NEW", label: "New" },
    { stage: "PREPARING", label: "Preparing" },
    { stage: "READY", label: "Ready" },
    { stage: "COLLECTED", label: "Collected" },
];

/** A Local delivery handed to a courier the old way (before B2c). */
const LEGACY_LOCAL: FulfilmentStep[] = [
    { stage: "NEW", label: "New" },
    { stage: "PREPARING", label: "Preparing" },
    { stage: "READY", label: "Ready" },
    { stage: "HANDED_TO_COURIER", label: "Handed to courier" },
    { stage: "DELIVERED", label: "Delivered" },
];

function row(over: Partial<OrderRow> = {}): OrderRow {
    return {
        id: "o1",
        orderId: "1042",
        placedAt: "2026-09-27T09:00:00.000Z",
        ageMinutes: 12,
        store: { id: "s1", name: "Hill Road" },
        customer: { id: "c1", name: "Priya Raman" },
        status: "PENDING",
        paymentStatus: "PAID",
        stage: "NEW",
        standing: "UNFULFILLED",
        payment: "PAID",
        currency: "INR",
        total: "480.00",
        unpaidAmount: "0.00",
        itemCount: 2,
        productNames: ["Sourdough loaf"],
        moreProducts: 0,
        fulfilmentType: "PICKUP",
        fulfilmentLabel: "Pick-up",
        steps: PICKUP,
        stepIndex: 0,
        ticketName: "Kitchen ticket",
        late: false,
        lateBy: null,
        lateAfterMinutes: 120,
        ...over,
    };
}

describe("rowProgress", () => {
    it("says the type's step word and where it is, in words", () => {
        const p = rowProgress(row({ stage: "PREPARING", stepIndex: 1 }));
        expect(p.word).toBe("Preparing");
        expect(p.tone).toBe("prog");
        expect(p.index).toBe(1);
        expect(p.count).toBe(4);
        expect(p.label).toBe("Step 2 of 4 · Pick-up · Next: Ready");
    });

    it("tints a new order, a ready one and a finished one differently", () => {
        expect(rowProgress(row()).tone).toBe("new");
        expect(rowProgress(row({ stepIndex: 2 })).tone).toBe("ready");
        const done = rowProgress(row({ stepIndex: 3, standing: "FULFILLED" }));
        expect(done.tone).toBe("done");
        expect(done.word).toBe("Collected");
        expect(done.label).toBe("Step 4 of 4 · Pick-up");
        expect(done.next).toBeNull();
    });

    it("reads a Local delivery handed to a courier before B2c, with Delivered next", () => {
        const p = rowProgress(
            row({
                fulfilmentType: "LOCAL_DELIVERY",
                fulfilmentLabel: "Local delivery",
                steps: LEGACY_LOCAL,
                stage: "HANDED_TO_COURIER",
                stepIndex: 3,
                status: "SHIPPED",
                standing: "FULFILLED",
            }),
        );
        expect(p.word).toBe("Handed to courier");
        expect(p.next).toBe("Delivered");
        expect(p.tone).toBe("prog");
        expect(p.label).toBe("Step 4 of 5 · Local delivery · Next: Delivered");
    });

    it("says Refunded or Cancelled and draws no progress", () => {
        const refunded = rowProgress(row({ standing: "REFUNDED" }));
        expect(refunded).toMatchObject({
            word: "Refunded",
            tone: "bad",
            index: null,
            label: null,
        });
        expect(rowProgress(row({ standing: "CANCELLED" })).word).toBe(
            "Cancelled",
        );
    });

    it("keeps a step index the API sent out of range on the bar", () => {
        expect(rowProgress(row({ stepIndex: 9 })).index).toBe(3);
        expect(rowProgress(row({ stepIndex: -1 })).index).toBe(0);
    });

    it("draws no bar when an API before B2a sent no steps", () => {
        const p = rowProgress(row({ steps: [], stepIndex: 0 }));
        expect(p.index).toBeNull();
        expect(p.label).toBeNull();
        expect(p.word).toBe("Open");
    });
});

describe("ageWords", () => {
    it("says the design's clock words", () => {
        expect(ageWords(0)).toBe("just now");
        expect(ageWords(12)).toBe("12 min");
        expect(ageWords(59)).toBe("59 min");
        expect(ageWords(60)).toBe("1 h");
        expect(ageWords(185)).toBe("3 h");
        expect(ageWords(24 * 60)).toBe("1 d");
        expect(ageWords(3 * 24 * 60 + 5)).toBe("3 d");
    });
});

describe("rowAge", () => {
    it("says how long an open order has waited", () => {
        expect(rowAge(row())).toEqual({ text: "12 min", late: false });
    });

    it("says Late in words once the API says it is late", () => {
        expect(rowAge(row({ ageMinutes: 190, late: true }))).toEqual({
            text: "Late · 3 h",
            late: true,
        });
    });

    it("says nothing once it is done, refunded or cancelled", () => {
        expect(rowAge(row({ stepIndex: 3 }))).toBeNull();
        expect(rowAge(row({ standing: "REFUNDED" }))).toBeNull();
        expect(rowAge(row({ standing: "CANCELLED" }))).toBeNull();
    });

    it("leaves an appointment to its visits: nothing from an API that doesn't say", () => {
        expect(
            rowAge(row({ fulfilmentType: "APPOINTMENT_IN_PERSON" })),
        ).toBeNull();
    });

    describe("a treatment's next visit (B14, DEC-067)", () => {
        // 18 Sep, 16:10 in Bengaluru.
        const now = new Date("2026-09-18T10:40:00Z");
        const treatment = (nextVisit: OrderRow["nextVisit"]) =>
            row({
                fulfilmentType: "APPOINTMENT_IN_PERSON",
                steps: [
                    { stage: "NEW", label: "Booked" },
                    { stage: "DELIVERED", label: "Attended" },
                ],
                nextVisit,
            });

        it("says the day and time of the next booked visit, in the clinic's zone", () => {
            expect(
                rowAge(
                    treatment({
                        startAt: "2026-09-19T04:30:00Z",
                        timezone: "Asia/Kolkata",
                    }),
                    now,
                ),
            ).toEqual({ text: "Next 19 Sep, 10:00", late: false });
        });

        it("writes today in a sentence's case", () => {
            expect(
                rowAge(
                    treatment({
                        startAt: "2026-09-18T12:30:00Z",
                        timezone: "Asia/Kolkata",
                    }),
                    now,
                )?.text,
            ).toBe("Next today, 18:00");
        });

        it("says when no visit is booked", () => {
            expect(rowAge(treatment(null), now)?.text).toBe(
                "Next visit not booked",
            );
        });

        it("is never late, and says nothing once it's attended, refunded or cancelled", () => {
            const t = {
                ...treatment(null),
                late: true,
                ageMinutes: 9_000,
            };
            expect(rowAge(t, now)?.late).toBe(false);
            expect(rowAge({ ...t, standing: "FULFILLED" }, now)).toBeNull();
            expect(rowAge({ ...t, standing: "REFUNDED" }, now)).toBeNull();
            expect(rowAge({ ...t, standing: "CANCELLED" }, now)).toBeNull();
        });

        it("nextVisitWords says yesterday too, for a visit not marked yet", () => {
            expect(
                nextVisitWords(
                    {
                        startAt: "2026-09-17T04:30:00Z",
                        timezone: "Asia/Kolkata",
                    },
                    now,
                ),
            ).toBe("Next yesterday, 10:00");
        });
    });

    it("never says late from an API before B2b", () => {
        expect(rowAge(row({ late: undefined, ageMinutes: 600 }))).toEqual({
            text: "10 h",
            late: false,
        });
    });
});

describe("rowMoney", () => {
    it("says the total and what is left to collect", () => {
        const m = rowMoney(row({ payment: "UNPAID", unpaidAmount: "480.00" }));
        expect(m.total).toBe("₹480");
        expect(m.unpaid).toBe("₹480 unpaid");
    });

    it("says nothing unpaid on a paid order", () => {
        expect(rowMoney(row()).unpaid).toBeNull();
    });

    it("shows no money to a caller with order:stage and not order:read", () => {
        const kitchen = row({
            total: undefined,
            unpaidAmount: undefined,
            payment: "UNPAID",
        });
        // No figure — only whether it is paid (UX-010).
        expect(rowMoney(kitchen)).toEqual({
            total: null,
            unpaid: "Not paid yet",
            paid: null,
        });
        // …and the pill and the progress still show.
        expect(rowProgress(kitchen).word).toBe("New");
        expect(rowProgress(kitchen).label).toBe(
            "Step 1 of 4 · Pick-up · Next: Preparing",
        );
    });

    it("asks for nothing on a cancelled order", () => {
        expect(
            rowMoney(
                row({
                    standing: "CANCELLED",
                    payment: "UNPAID",
                    unpaidAmount: "480.00",
                }),
            ).unpaid,
        ).toBeNull();
    });
});

describe("rowMoney for the kitchen (UX-010)", () => {
    const kitchen = (over: Partial<OrderRow> = {}) =>
        row({ total: undefined, unpaidAmount: undefined, ...over });

    it("says it is paid, with no figure", () => {
        expect(rowMoney(kitchen({ payment: "PAID" }))).toEqual({
            total: null,
            unpaid: null,
            paid: "Paid",
        });
    });

    it("says it is to be paid on collection, with no figure", () => {
        expect(
            rowMoney(
                kitchen({
                    payment: "UNPAID",
                    payOnHandover: true,
                    fulfilmentType: "PICKUP",
                }),
            ).unpaid,
        ).toBe("To pay on collection");
    });

    it("asks nothing of a cancelled or refunded order", () => {
        expect(
            rowMoney(kitchen({ payment: "UNPAID", standing: "CANCELLED" })),
        ).toEqual({ total: null, unpaid: null, paid: null });
        expect(
            rowMoney(kitchen({ payment: "REFUNDED", standing: "REFUNDED" }))
                .paid,
        ).toBeNull();
    });
});

describe("rowSubline", () => {
    it("names the storefront only when there are several to tell apart", () => {
        expect(rowSubline(row(), true)).toBe("2 items · Hill Road · Pick-up");
        expect(rowSubline(row({ itemCount: 1 }), false)).toBe(
            "1 item · Pick-up",
        );
    });
});

describe("rowCustomer", () => {
    it("falls back to the email, then to a plain word", () => {
        expect(rowCustomer(row())).toBe("Priya Raman");
        expect(
            rowCustomer(
                row({ customer: { id: "c", name: null, email: "a@b.in" } }),
            ),
        ).toBe("a@b.in");
        expect(rowCustomer(row({ customer: null }))).toBe("Unknown customer");
        expect(rowInitials(row())).toBe("PR");
    });

    it("names a walk-in by the name they gave (B13)", () => {
        const walkIn = row({
            customer: null,
            walkIn: { name: "Ravi Kumar", phone: null },
        });
        expect(rowCustomer(walkIn)).toBe("Ravi Kumar");
        expect(rowInitials(walkIn)).toBe("RK");
    });
});

describe("rowMoney on an order paid at the handover (2026-10-06)", () => {
    it("says how it will be paid", () => {
        const owed = { payment: "UNPAID" as const, unpaidAmount: "480.00" };
        expect(rowMoney(row({ ...owed, payOnHandover: true })).unpaid).toBe(
            "₹480 to pay on collection",
        );
        expect(
            rowMoney(
                row({
                    ...owed,
                    payOnHandover: true,
                    fulfilmentType: "LOCAL_DELIVERY",
                }),
            ).unpaid,
        ).toBe("₹480 to pay on delivery");
    });
});
