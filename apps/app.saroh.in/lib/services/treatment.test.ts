import { describe, expect, it } from "vitest";

import type { TreatmentView } from "./booking-calendar";
import {
    bookNextLabel,
    orderHref,
    orderLabel,
    visitLabel,
    visitsDoneText,
    visitToBook,
} from "./treatment";

const t = (over: Partial<TreatmentView> = {}): TreatmentView => ({
    orderId: "ord_1",
    orderNumber: "ORD-004",
    visitNumber: 2,
    visits: 3,
    booked: 2,
    nextVisit: 3,
    closed: false,
    ...over,
});

describe("a visit of a treatment (E10)", () => {
    it("says which visit, and the order it is paid on", () => {
        expect(visitLabel(t())).toBe("Visit 2 of 3");
        expect(orderLabel(t())).toBe("With order #ORD-004");
        expect(orderHref(t())).toBe("/commerce/orders/ord_1");
    });

    it("offers the next visit, prefilled with the order and the customer", () => {
        expect(bookNextLabel(t())).toBe("Book visit 3");
        expect(visitsDoneText(t())).toBeNull();
        expect(visitToBook(t(), "Ananya Rao")).toEqual({
            orderId: "ord_1",
            orderNumber: "ORD-004",
            visitNumber: 3,
            visits: 3,
            who: "Ananya Rao",
        });
    });

    it("all visits booked: the action is gone and says so", () => {
        const all = t({ visitNumber: 3, booked: 3, nextVisit: null });
        expect(bookNextLabel(all)).toBeNull();
        expect(visitToBook(all, "Ananya")).toBeNull();
        expect(visitsDoneText(all)).toBe("All visits booked");
    });

    it("a cancelled or refunded order books no more visits, and says why", () => {
        const closed = t({ nextVisit: null, closed: true });
        expect(visitToBook(closed, "Ananya")).toBeNull();
        expect(visitsDoneText(closed)).toMatch(/cancelled or refunded/);
    });

    it("is nothing for a booking that isn't a visit", () => {
        expect(visitToBook(null, "Ananya")).toBeNull();
        expect(visitToBook(undefined, "Ananya")).toBeNull();
    });
});
