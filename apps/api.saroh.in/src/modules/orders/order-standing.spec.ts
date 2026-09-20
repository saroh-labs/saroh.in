import { orderStanding, UNFULFILLED_STATUSES } from "./order-standing";

/**
 * The rail badges a number and the Orders tab claims the same number. They
 * used to come from two hand-written lists that happened to agree.
 */
describe("orderStanding — what the status column says", () => {
    it("is the one list Home counts unfulfilled orders with", () => {
        // `HomeService.openOrders` spreads this exact constant. If someone
        // widens fulfilment, this is the assertion that stops them widening
        // it in only one of the two places.
        expect([...UNFULFILLED_STATUSES]).toEqual(["PENDING", "PROCESSING"]);
    });

    it("says refunded even when the goods were delivered", () => {
        // The money is the fact a merchant scanning this list is looking for.
        expect(orderStanding("DELIVERED", "REFUNDED")).toBe("REFUNDED");
    });

    it("says cancelled when nothing was refunded", () => {
        expect(orderStanding("CANCELLED", "PAID")).toBe("CANCELLED");
    });

    it("calls a cancelled AND refunded order refunded", () => {
        expect(orderStanding("CANCELLED", "REFUNDED")).toBe("REFUNDED");
    });

    it.each(["PENDING", "PROCESSING"])("calls %s unfulfilled", (status) => {
        expect(orderStanding(status, "PAID")).toBe("UNFULFILLED");
        expect(orderStanding(status, "UNPAID")).toBe("UNFULFILLED");
    });

    it.each(["SHIPPED", "DELIVERED"])("calls %s fulfilled", (status) => {
        expect(orderStanding(status, "PAID")).toBe("FULFILLED");
    });

    it("does not call an unpaid but shipped order unfulfilled", () => {
        // Fulfilment is about the goods. Money owed is a different question.
        expect(orderStanding("SHIPPED", "UNPAID")).toBe("FULFILLED");
    });
});
