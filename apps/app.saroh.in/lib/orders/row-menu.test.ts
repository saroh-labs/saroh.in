import { describe, expect, it } from "vitest";

import type { OrderRow } from "@/lib/orders/business-service";
import type { FulfilmentStep, OrderRead } from "@/lib/orders/read";
import type { OrderAbilities, RowMenuItem } from "@/lib/orders/row-menu";
import {
    arrivalOf,
    orderPageHref,
    payLinkAction,
    quickNext,
    quickPayment,
    quickSteps,
    rowMenu,
    rowNext,
} from "@/lib/orders/row-menu";

/**
 * The Orders list's row menu and quick view (plan B, B5): what each draws
 * for whom, and why an item is off. An item the caller can't use is not
 * drawn; one the order doesn't allow is drawn off, with the reason.
 */

const PICKUP: FulfilmentStep[] = [
    { stage: "NEW", label: "New" },
    { stage: "PREPARING", label: "Preparing" },
    { stage: "READY", label: "Ready" },
    { stage: "COLLECTED", label: "Collected" },
];

const SHIPPING: FulfilmentStep[] = [
    { stage: "NEW", label: "New" },
    { stage: "PREPARING", label: "Packing" },
    { stage: "READY", label: "Packed" },
    { stage: "HANDED_TO_COURIER", label: "With the courier" },
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
        status: "PROCESSING",
        paymentStatus: "PAID",
        stage: "PREPARING",
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
        stepIndex: 1,
        ticketName: "Kitchen ticket",
        payLinkCreatedAt: null,
        ...over,
    };
}

const OWNER: OrderAbilities = {
    stage: true,
    create: true,
    payLink: true,
    refund: true,
    export: true,
    payOnline: true,
};
/** A Member at the counter: `order:stage`, no money (DEC-024). */
const KITCHEN: OrderAbilities = {
    stage: true,
    create: false,
    payLink: false,
    refund: false,
    export: false,
    payOnline: false,
};
/** The kitchen's row: the API sends no money. */
const KITCHEN_ROW = { total: undefined, unpaidAmount: undefined };

const kinds = (items: RowMenuItem[]) => items.map((i) => i.kind);
const item = <K extends RowMenuItem["kind"]>(items: RowMenuItem[], kind: K) =>
    items.find((i) => i.kind === kind) as
        Extract<RowMenuItem, { kind: K }> | undefined;

describe("rowMenu", () => {
    it("gives an owner every item, in the design's order", () => {
        const items = rowMenu(row(), OWNER);
        expect(kinds(items)).toEqual([
            "next",
            "print",
            "pay-link",
            "open",
            "refund",
        ]);
        expect(item(items, "next")).toMatchObject({
            label: "Mark ready",
            step: { to: "READY", via: "move" },
            disabled: null,
        });
        expect(item(items, "print")).toMatchObject({
            label: "Print kitchen ticket",
            href: "/commerce/orders/o1?storefront=s1&print=1",
        });
        expect(item(items, "open")?.href).toBe(
            "/commerce/orders/o1?storefront=s1",
        );
        expect(item(items, "refund")).toMatchObject({
            href: "/commerce/orders/o1?storefront=s1&panel=refund",
            disabled: null,
        });
    });

    it("gives the kitchen no money items: no pay link, no refund, no cancel", () => {
        const items = rowMenu(row(KITCHEN_ROW), KITCHEN);
        expect(kinds(items)).toEqual(["next", "print", "open"]);
        // Even a role that may refund gets none without the row's money.
        expect(kinds(rowMenu(row(KITCHEN_ROW), OWNER))).toEqual([
            "next",
            "print",
            "open",
        ]);
    });

    it("leaves out the step for a role that can't move steps", () => {
        const items = rowMenu(row(), { ...OWNER, stage: false });
        expect(kinds(items)).not.toContain("next");
    });

    it("draws the step off, with why, when the order can't take it", () => {
        const unpaid = rowNext(
            row({ paymentStatus: "UNPAID", stage: "NEW", stepIndex: 0 }),
        );
        expect(unpaid).toMatchObject({
            step: { to: "PREPARING" },
            disabled: "Not paid yet.",
        });
        expect(rowNext(row({ paymentStatus: "FAILED" })).disabled).toBe(
            "Not paid yet.",
        );
        // Taken to pay later and already started: it moves on.
        expect(
            rowNext(row({ paymentStatus: "UNPAID", stage: "PREPARING" }))
                .disabled,
        ).toBeNull();
        expect(
            rowNext(row({ stage: "COLLECTED", stepIndex: 3 })),
        ).toMatchObject({ step: null, disabled: "Nothing left to do." });
        expect(rowNext(row({ status: "CANCELLED" })).disabled).toBe(
            "It's cancelled.",
        );
        expect(rowNext(row({ payment: "REFUNDED" })).disabled).toBe(
            "It's refunded in full.",
        );
        const done = item(
            rowMenu(row({ stage: "COLLECTED", stepIndex: 3 }), OWNER),
            "next",
        );
        expect(done).toMatchObject({
            label: "Next step",
            disabled: "Nothing left to do.",
        });
    });

    it("sends a hand-over to the full page, which asks for the courier", () => {
        const next = rowNext(
            row({
                fulfilmentType: "SHIPPING",
                steps: SHIPPING,
                stage: "READY",
                stepIndex: 2,
            }),
        );
        expect(next.step).toEqual({
            to: "HANDED_TO_COURIER",
            label: "Hand to courier",
            via: "page",
        });
    });

    it("offers no step for an appointment: its visits are marked on the page", () => {
        const items = rowMenu(
            row({
                fulfilmentType: "APPOINTMENT_IN_PERSON",
                steps: [],
                stepIndex: 0,
                ticketName: null,
            }),
            OWNER,
        );
        expect(kinds(items)).toEqual(["pay-link", "open", "refund"]);
    });

    it("leaves out Print for a type that prints nothing", () => {
        expect(kinds(rowMenu(row({ ticketName: null }), OWNER))).not.toContain(
            "print",
        );
    });

    describe("the pay link (B11)", () => {
        const owed = {
            paymentStatus: "UNPAID",
            payment: "UNPAID" as const,
            stage: "NEW",
            stepIndex: 0,
            unpaidAmount: "480.00",
        };

        it("makes one for an order still owed money", () => {
            expect(item(rowMenu(row(owed), OWNER), "pay-link")).toEqual({
                kind: "pay-link",
                label: "Make a pay link",
                replaces: false,
                disabled: null,
            });
        });

        it("says New pay link, which replaces the old one, when one is out", () => {
            expect(
                item(
                    rowMenu(
                        row({
                            ...owed,
                            payLinkCreatedAt: "2026-09-27T09:30:00.000Z",
                        }),
                        OWNER,
                    ),
                    "pay-link",
                ),
            ).toMatchObject({ label: "New pay link", replaces: true });
        });

        it("is off, with why, when nothing is owed or no provider can take it", () => {
            expect(item(rowMenu(row(), OWNER), "pay-link")?.disabled).toBe(
                "Nothing is owed on it.",
            );
            expect(
                item(
                    rowMenu(row({ ...owed, status: "CANCELLED" }), OWNER),
                    "pay-link",
                )?.disabled,
            ).toBe("Nothing is owed on it.");
            expect(
                item(
                    rowMenu(row(owed), { ...OWNER, payOnline: false }),
                    "pay-link",
                )?.disabled,
            ).toBe("Connect a payment provider first.");
        });

        it("isn't drawn for a role that can neither take nor change orders (B16)", () => {
            expect(
                kinds(rowMenu(row(owed), { ...OWNER, payLink: false })),
            ).not.toContain("pay-link");
        });
    });

    describe("Refund or Cancel", () => {
        it("offers Cancel, not Refund, when nothing was paid", () => {
            const items = rowMenu(
                row({
                    paymentStatus: "UNPAID",
                    payment: "UNPAID",
                    status: "PENDING",
                    stage: "NEW",
                    stepIndex: 0,
                }),
                OWNER,
            );
            expect(item(items, "cancel")).toMatchObject({ disabled: null });
            expect(kinds(items)).not.toContain("refund");
        });

        it("draws Cancel off once it's handed over or cancelled", () => {
            const unpaid = {
                paymentStatus: "UNPAID",
                payment: "UNPAID" as const,
            };
            expect(
                item(
                    rowMenu(row({ ...unpaid, status: "SHIPPED" }), OWNER),
                    "cancel",
                )?.disabled,
            ).toBe("It's been handed over.");
            expect(
                item(
                    rowMenu(row({ ...unpaid, status: "CANCELLED" }), OWNER),
                    "cancel",
                )?.disabled,
            ).toBe("It's cancelled.");
        });

        it("draws Refund off for an order refunded in full", () => {
            expect(
                item(
                    rowMenu(
                        row({ payment: "REFUNDED", paymentStatus: "REFUNDED" }),
                        OWNER,
                    ),
                    "refund",
                )?.disabled,
            ).toBe("Refunded in full.");
            expect(
                item(
                    rowMenu(row({ payment: "PARTLY_REFUNDED" }), OWNER),
                    "refund",
                )?.disabled,
            ).toBeNull();
        });

        it("isn't drawn for a role that can't refund", () => {
            const items = rowMenu(row(), { ...OWNER, refund: false });
            expect(kinds(items)).not.toContain("refund");
            expect(kinds(items)).not.toContain("cancel");
        });

        it("gates Cancel on order:refund, as Order Detail does: a cancel is a refund in full (B16)", () => {
            const unpaid = row({
                paymentStatus: "UNPAID",
                payment: "UNPAID",
                status: "PENDING",
                stage: "NEW",
                stepIndex: 0,
            });
            // May refund: Cancel is there, whatever else the role holds.
            expect(
                kinds(
                    rowMenu(unpaid, {
                        ...KITCHEN,
                        refund: true,
                    }),
                ),
            ).toContain("cancel");
            // May take and change orders, may not refund: no Cancel.
            expect(
                kinds(rowMenu(unpaid, { ...OWNER, refund: false })),
            ).not.toContain("cancel");
        });
    });
});

describe("the pay-link item", () => {
    it("replaces a link already out, after the confirm, and makes one when none is", () => {
        expect(payLinkAction({ replaces: true })).toBe("replace");
        expect(payLinkAction({ replaces: false })).toBe("make");
    });
});

function read(over: Partial<OrderRead> = {}): OrderRead {
    return {
        id: "o1",
        orderId: "1042",
        placedAt: "2026-09-27T09:00:00.000Z",
        updatedAt: "2026-09-27T09:05:00.000Z",
        store: { id: "s1", name: "Hill Road" },
        status: "PROCESSING",
        paymentStatus: "PAID",
        refundStanding: "NONE",
        stage: "PREPARING",
        fulfilmentType: "PICKUP",
        fulfilmentLabel: "Pick-up",
        steps: PICKUP,
        stepIndex: 1,
        ticketName: "Kitchen ticket",
        customer: null,
        deliveryAddress: null,
        notes: null,
        trackingUrl: null,
        items: [],
        events: [],
        next: { stages: ["READY"], undo: null, editable: false },
        money: {
            currency: "INR",
            subtotal: "480.00",
            tax: "0.00",
            shipping: "0.00",
            discount: "0.00",
            total: "480.00",
            paid: "480.00",
            refunded: "0.00",
            due: "0.00",
            recordedByHand: false,
            discountCode: null,
            refundsBeingConfirmed: [],
        },
        invoices: null,
        ...over,
    };
}

describe("quickNext", () => {
    it("is the API's next stage, as a button", () => {
        expect(quickNext(read(), { stage: true })).toEqual({
            to: "READY",
            label: "Mark ready",
            via: "move",
        });
    });

    it("is none for a role that can't move steps, or with nothing next", () => {
        expect(quickNext(read(), { stage: false })).toBeNull();
        expect(
            quickNext(
                read({ next: { stages: [], undo: null, editable: false } }),
                { stage: true },
            ),
        ).toBeNull();
    });

    it("is none before it is paid, and for a refunded or cancelled order", () => {
        expect(
            quickNext(read({ paymentStatus: "UNPAID", stage: "NEW" }), {
                stage: true,
            }),
        ).toBeNull();
        expect(
            quickNext(read({ refundStanding: "REFUNDED" }), { stage: true }),
        ).toBeNull();
        expect(
            quickNext(read({ status: "CANCELLED" }), { stage: true }),
        ).toBeNull();
    });

    it("is none for an appointment, whose visits are marked on the page", () => {
        expect(
            quickNext(read({ fulfilmentType: "APPOINTMENT_ONLINE" }), {
                stage: true,
            }),
        ).toBeNull();
    });
});

describe("quickSteps", () => {
    it("marks the steps done, the one it is at, and those to come", () => {
        expect(quickSteps(read()).map((s) => s.state)).toEqual([
            "done",
            "now",
            "todo",
            "todo",
        ]);
    });

    it("ends with Refunded or Cancelled, at none of its steps", () => {
        const refunded = quickSteps(read({ refundStanding: "REFUNDED" }));
        expect(refunded.at(-1)).toEqual({ label: "Refunded", state: "ended" });
        expect(refunded.slice(0, 4).every((s) => s.state === "todo")).toBe(
            true,
        );
        expect(quickSteps(read({ status: "CANCELLED" })).at(-1)?.label).toBe(
            "Cancelled",
        );
    });
});

describe("quickPayment", () => {
    const f = (a: string) => `₹${Number(a).toFixed(0)}`;
    const money = read().money;

    it("says nothing without money: the kitchen's read has none", () => {
        expect(quickPayment(read({ money: null }), f)).toBeNull();
    });

    it("says how it stands", () => {
        expect(quickPayment(read(), f)).toBe("Paid");
        expect(
            quickPayment(
                read({
                    money: money && { ...money, recordedByHand: true },
                }),
                f,
            ),
        ).toBe("Paid by hand");
        expect(
            quickPayment(
                read({
                    paymentStatus: "UNPAID",
                    money: money && { ...money, due: "480.00" },
                }),
                f,
            ),
        ).toBe("₹480 not paid yet");
        expect(
            quickPayment(
                read({
                    paymentStatus: "FAILED",
                    money: money && { ...money, due: "480.00" },
                }),
                f,
            ),
        ).toBe("Payment failed · ₹480 to collect");
        expect(
            quickPayment(
                read({
                    refundStanding: "PARTLY_REFUNDED",
                    money: money && { ...money, refunded: "120.00" },
                }),
                f,
            ),
        ).toBe("Paid · ₹120 refunded");
        expect(quickPayment(read({ refundStanding: "REFUNDED" }), f)).toBe(
            "Refunded",
        );
    });
});

describe("Order Detail, opened from the list", () => {
    it("carries what to do in the address, and reads it back", () => {
        for (const then of ["refund", "courier", "print"] as const) {
            const href = orderPageHref("s1", "o1", then);
            const params = Object.fromEntries(
                new URL(href, "https://app.saroh.localhost").searchParams,
            );
            expect(arrivalOf(params)).toBe(then);
        }
        expect(arrivalOf({})).toBeNull();
        expect(arrivalOf({ panel: "edit" })).toBeNull();
        expect(arrivalOf({ print: "0" })).toBeNull();
    });
});
