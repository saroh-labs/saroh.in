import { BadRequestException, ConflictException } from "@nestjs/common";

import {
    assertVisitBookable,
    isTreatment,
    refuseClosedTreatment,
    TREATMENT_NEEDS_EMAIL,
    treatmentEmail,
} from "./visits";

/** The visit rules of a treatment (E9, DEC-050), without a database. */
describe("visits", () => {
    it("a service of more than one visit is a treatment", () => {
        expect(isTreatment({ visits: 1 })).toBe(false);
        expect(isTreatment({ visits: 2 })).toBe(true);
        expect(isTreatment({ visits: 12 })).toBe(true);
    });

    it("books no visit of a treatment cancelled or refunded in full", () => {
        expect(() =>
            refuseClosedTreatment({ status: "PENDING", paymentStatus: "PAID" }),
        ).not.toThrow();
        expect(() =>
            refuseClosedTreatment({
                status: "CANCELLED",
                paymentStatus: "PAID",
            }),
        ).toThrow(ConflictException);
        expect(() =>
            refuseClosedTreatment({
                status: "PENDING",
                paymentStatus: "REFUNDED",
            }),
        ).toThrow(
            "This treatment was refunded, so no more visits can be booked.",
        );
    });

    describe("assertVisitBookable", () => {
        const booked = (...n: number[]) => new Set<number | null>(n);

        it("books the next visit after the one before it", () => {
            expect(() => assertVisitBookable(2, 3, booked(1))).not.toThrow();
            expect(() => assertVisitBookable(3, 3, booked(1, 2))).not.toThrow();
        });

        it("refuses a visit before the one before it is booked", () => {
            expect(() => assertVisitBookable(3, 3, booked(1))).toThrow(
                new ConflictException("Book visit 2 first."),
            );
        });

        it("refuses a visit already booked", () => {
            expect(() => assertVisitBookable(2, 3, booked(1, 2))).toThrow(
                "Visit 2 is already booked.",
            );
        });

        it("refuses past the last visit, saying when all are booked", () => {
            expect(() => assertVisitBookable(4, 3, booked(1, 2, 3))).toThrow(
                "All 3 visits are booked.",
            );
            expect(() => assertVisitBookable(4, 3, booked(1))).toThrow(
                "This treatment has 3 visits.",
            );
        });

        it("rebooks a cancelled visit: only live visits count", () => {
            expect(() => assertVisitBookable(1, 2, booked())).not.toThrow();
        });

        it("refuses a visit number that isn't one", () => {
            for (const n of [0, -1, 1.5]) {
                expect(() => assertVisitBookable(n, 3, booked(1))).toThrow(
                    BadRequestException,
                );
            }
        });
    });

    describe("treatmentEmail", () => {
        it("bills the booking's email, as it is compared", () => {
            expect(treatmentEmail(" Rahul@Example.in ")).toBe(
                "rahul@example.in",
            );
        });

        it("asks for an email when there is none, or only a placeholder", () => {
            for (const email of [
                null,
                "",
                "removed+c_1@removed.invalid",
                "account+c_2@account.invalid",
            ]) {
                expect(() => treatmentEmail(email)).toThrow(
                    TREATMENT_NEEDS_EMAIL,
                );
            }
        });
    });
});
