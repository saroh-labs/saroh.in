import type { TreatmentRow } from "./treatment-view";
import { treatmentOf } from "./treatment-view";

function row(
    over: {
        visitNumber?: number | null;
        visits?: number;
        booked?: (number | null)[];
        status?: string;
        paymentStatus?: string;
        noOrder?: boolean;
    } = {},
): TreatmentRow {
    return {
        visitNumber: over.visitNumber === undefined ? 1 : over.visitNumber,
        service: { visits: over.visits ?? 3 },
        order: over.noOrder
            ? null
            : {
                  id: "ord_1",
                  orderId: "ORD-004",
                  status: over.status ?? "CONFIRMED",
                  paymentStatus: over.paymentStatus ?? "PAID",
                  bookings: (over.booked ?? [1]).map((visitNumber) => ({
                      visitNumber,
                  })),
              },
    };
}

describe("treatmentOf (E10)", () => {
    it("is null for a booking that isn't a visit of a treatment", () => {
        expect(treatmentOf(row({ noOrder: true }))).toBeNull();
        expect(treatmentOf(row({ visitNumber: null }))).toBeNull();
        expect(
            treatmentOf({ service: { visits: 1 }, visitNumber: null }),
        ).toBeNull();
    });

    it("visit 1 of 3 with only it booked: book visit 2 next", () => {
        expect(treatmentOf(row())).toEqual({
            orderId: "ord_1",
            orderNumber: "ORD-004",
            visitNumber: 1,
            visits: 3,
            booked: 1,
            nextVisit: 2,
            closed: false,
        });
    });

    it("visit 2 of 3: book visit 3 next", () => {
        expect(
            treatmentOf(row({ visitNumber: 2, booked: [1, 2] })),
        ).toMatchObject({ visitNumber: 2, booked: 2, nextVisit: 3 });
    });

    it("all visits booked: nothing more to book", () => {
        expect(
            treatmentOf(row({ visitNumber: 3, booked: [1, 2, 3] })),
        ).toMatchObject({ booked: 3, nextVisit: null, closed: false });
    });

    it("a cancelled visit is booked again: it is the next one", () => {
        // Visit 2 was cancelled, so the read leaves it out.
        expect(
            treatmentOf(row({ visitNumber: 1, booked: [1, 3] })),
        ).toMatchObject({ nextVisit: 2 });
    });

    it("a cancelled or refunded order books no more visits", () => {
        expect(treatmentOf(row({ status: "CANCELLED" }))).toMatchObject({
            nextVisit: null,
            closed: true,
        });
        expect(treatmentOf(row({ paymentStatus: "REFUNDED" }))).toMatchObject({
            nextVisit: null,
            closed: true,
        });
    });

    it("never says fewer visits than the one this is (visits lowered since)", () => {
        expect(
            treatmentOf(row({ visitNumber: 3, visits: 2, booked: [1, 2, 3] })),
        ).toMatchObject({ visits: 3, nextVisit: null });
    });
});
