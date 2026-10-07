import { bookingPaid } from "./booking-paid";

/** Customer Detail's booking line once money is in (UX-049). */
describe("bookingPaid", () => {
    const row = (total: string, method: string | null, at: string) => ({
        total,
        currency: "INR",
        paymentMethod: method,
        paidAt: new Date(at),
    });

    it("is null while nothing is paid", () => {
        expect(bookingPaid([])).toBeNull();
    });

    it("sums a deposit and its balance, and says how the newest was paid", () => {
        expect(
            bookingPaid([
                row("600.00", "CASH", "2026-10-07T11:00:00Z"),
                row("200.00", "ONLINE", "2026-10-06T11:00:00Z"),
            ]),
        ).toEqual({ amount: "800.00", currency: "INR", method: "CASH" });
    });

    it("tells a viewer without invoice:read only that it's paid", () => {
        expect(
            bookingPaid([row("800.00", "UPI", "2026-10-07T11:00:00Z")], false),
        ).toEqual({ amount: null, currency: null, method: "UPI" });
    });
});
