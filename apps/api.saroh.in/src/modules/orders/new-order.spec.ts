import { BadRequestException, ConflictException } from "@nestjs/common";

import {
    assertHandedOver,
    assertOneParty,
    assertStorefrontOffers,
    cashReceivedCents,
    COUNTER_NOTE,
    HANDED_OVER_NOTE,
    handOverAtCounterInTx,
    isCounterPayment,
    storefrontOffers,
} from "./new-order";

/**
 * New order v2's pure rules (plan B, B13): who the order is for, cash
 * given against the total, and the ways a storefront offers. The writes
 * are in `new-order.db.spec.ts`.
 */
describe("assertOneParty", () => {
    it.each([
        [{ customerId: "c_1" }],
        [{ contactId: "k_1" }],
        [{ customer: { email: "a@x.in" } }],
        [{ walkIn: { name: "Asha" } }],
    ])("takes exactly one way of saying who: %j", (dto) => {
        expect(() => assertOneParty(dto)).not.toThrow();
    });

    it("refuses an order for nobody", () => {
        expect(() => assertOneParty({})).toThrow(BadRequestException);
        expect(() => assertOneParty({ customerId: "" })).toThrow(
            "Say who the order is for",
        );
    });

    it("refuses an order for two people at once", () => {
        expect(() =>
            assertOneParty({ customerId: "c_1", walkIn: { name: "Asha" } }),
        ).toThrow("An order is for one person");
    });
});

describe("cashReceivedCents", () => {
    const format = (cents: number) => `₹${cents / 100}`;

    it("takes the total when no amount was typed", () => {
        expect(cashReceivedCents(undefined, 43_000, format)).toBe(43_000);
    });

    it("keeps what was handed over, the change being the difference", () => {
        // ₹500 for ₹430: ₹70 change.
        expect(cashReceivedCents("500", 43_000, format)).toBe(50_000);
        expect(cashReceivedCents("430.00", 43_000, format)).toBe(43_000);
    });

    it("refuses cash short of the total, saying by how much", () => {
        expect(() => cashReceivedCents("400", 43_000, format)).toThrow(
            "That's ₹30 short.",
        );
    });
});

describe("counter payments", () => {
    it("are cash, UPI and a card machine; pay later and a link are not", () => {
        expect(["CASH", "UPI", "CARD"].every(isCounterPayment)).toBe(true);
        expect(isCounterPayment("LATER")).toBe(false);
        expect(isCounterPayment("LINK")).toBe(false);
    });

    it("say how, with no amount, on a timeline the kitchen reads", () => {
        for (const note of Object.values(COUNTER_NOTE)) {
            expect(note).not.toMatch(/\d/);
        }
    });
});

describe("the ways a storefront offers", () => {
    it("reads its stored ways, as B9's change sheet does", () => {
        expect(
            storefrontOffers({
                fulfilmentTypes: ["PICKUP", "LOCAL_DELIVERY"],
                collectionEnabled: true,
                shippingEnabled: true,
            }),
        ).toEqual(["PICKUP", "LOCAL_DELIVERY"]);
        // No settings saved yet: the column defaults (shipping only).
        expect(storefrontOffers(null)).toEqual(["SHIPPING"]);
    });

    it("refuses a way it doesn't offer, naming the ones it does", () => {
        expect(() => assertStorefrontOffers("SHIPPING", ["PICKUP"])).toThrow(
            ConflictException,
        );
        expect(() => assertStorefrontOffers("SHIPPING", ["PICKUP"])).toThrow(
            "This location doesn't offer Shipping. It offers Pick-up.",
        );
        expect(() =>
            assertStorefrontOffers("PICKUP", ["PICKUP"]),
        ).not.toThrow();
    });

    it("leaves Digital to the product (B12)", () => {
        expect(() => assertStorefrontOffers("DIGITAL", [])).not.toThrow();
    });
});

describe("handed over now (UX-059)", () => {
    it("takes a pick-up paid at the counter now", () => {
        for (const kind of ["CASH", "UPI", "CARD"]) {
            expect(() =>
                assertHandedOver({
                    handedOver: true,
                    payment: { kind },
                    fulfilment: "PICKUP",
                }),
            ).not.toThrow();
        }
    });

    it("refuses one not paid now, or not picked up", () => {
        expect(() =>
            assertHandedOver({
                handedOver: true,
                payment: { kind: "LATER" },
                fulfilment: "PICKUP",
            }),
        ).toThrow("paid at the counter now");
        expect(() =>
            assertHandedOver({
                handedOver: true,
                payment: { kind: "CASH" },
                fulfilment: "SHIPPING",
            }),
        ).toThrow("Only a pick-up");
        expect(() =>
            assertHandedOver({ payment: null, fulfilment: "SHIPPING" }),
        ).not.toThrow();
    });

    it("makes it Collected with one step, and sells what it held", async () => {
        const tx = {
            orderItem: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            order: { update: jest.fn() },
            orderEvent: { create: jest.fn() },
        };
        await handOverAtCounterInTx(tx as never, {
            orderId: "o1",
            organizationId: "org1",
            userId: "u1",
        });
        expect(tx.order.update).toHaveBeenCalledWith({
            where: { id: "o1" },
            data: { stage: "COLLECTED", status: "DELIVERED" },
        });
        expect(tx.orderEvent.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                kind: "STAGE",
                fromStage: "NEW",
                toStage: "COLLECTED",
                note: HANDED_OVER_NOTE,
            }),
        });
    });
});
