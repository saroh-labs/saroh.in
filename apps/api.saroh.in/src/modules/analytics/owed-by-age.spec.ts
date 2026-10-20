/**
 * Who owes by how late (DEC-171), pure: what is left to pay, never the
 * bill's total (DEC-173); the three ages add up to the total; amounts only
 * with money.
 */
import { foldOwedByAge, owedAge } from "./owed-by-age";

const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 09:00 in Mumbai.
const NOW = new Date("2026-10-19T03:30:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const clock = { now: NOW, zone: ZONE };

const BILLS = [
    // Not due: no due date, and due next week with ₹1,000 of ₹2,500 paid.
    { currency: "INR", dueAt: null, total: "1000.00", paidCents: 0 },
    { currency: "INR", dueAt: ago(-7), total: "2500.00", paidCents: 100_000 },
    // 1 to 30 days late.
    { currency: "INR", dueAt: ago(5), total: "800.00", paidCents: 0 },
    { currency: "INR", dueAt: ago(30), total: "300.00", paidCents: 0 },
    // More than 30 days late, ₹100 of ₹600 paid.
    { currency: "INR", dueAt: ago(31), total: "600.00", paidCents: 10_000 },
    // Another currency, kept apart.
    { currency: "USD", dueAt: ago(40), total: "100.00", paidCents: 0 },
];

describe("Owed by age", () => {
    it("ages a bill by its due date at this moment", () => {
        const longAgo = ago(30);
        expect(owedAge(null, NOW, longAgo)).toBe("notDue");
        expect(owedAge(NOW, NOW, longAgo)).toBe("notDue");
        expect(owedAge(new Date(NOW.getTime() - 1), NOW, longAgo)).toBe(
            "late1to30",
        );
        expect(owedAge(longAgo, NOW, longAgo)).toBe("late1to30");
        expect(owedAge(new Date(longAgo.getTime() - 1), NOW, longAgo)).toBe(
            "lateOver30",
        );
    });

    it("sums what is left to pay, never the total, and the ages add up", () => {
        const owed = foldOwedByAge(BILLS, clock, true);
        expect(owed.byAge.notDue).toMatchObject({
            count: 2,
            totals: [{ currency: "INR", amountMinor: 250_000 }],
        });
        expect(owed.byAge.late1to30).toMatchObject({
            count: 2,
            totals: [{ currency: "INR", amountMinor: 110_000 }],
        });
        expect(owed.byAge.lateOver30).toMatchObject({
            count: 2,
            totals: [
                { currency: "INR", amountMinor: 50_000 },
                { currency: "USD", amountMinor: 10_000 },
            ],
        });
        expect(owed.totals).toEqual([
            { currency: "INR", amountMinor: 410_000 },
            { currency: "USD", amountMinor: 10_000 },
        ]);
        expect(owed.bills).toBe(6);
        expect(owed.overdue).toBe(4);
        expect(owed.href).toBe("/billing/invoices?view=overdue");

        const inr = (t: typeof owed.totals) =>
            t?.find((x) => x.currency === "INR")?.amountMinor ?? 0;
        expect(
            inr(owed.byAge.notDue.totals) +
                inr(owed.byAge.late1to30.totals) +
                inr(owed.byAge.lateOver30.totals),
        ).toBe(inr(owed.totals));
    });

    it("never owes below nothing", () => {
        const owed = foldOwedByAge(
            [
                {
                    currency: "INR",
                    dueAt: null,
                    total: "100.00",
                    paidCents: 20_000,
                },
            ],
            clock,
            true,
        );
        expect(owed.totals).toEqual([{ currency: "INR", amountMinor: 0 }]);
    });

    it("gives counts without amounts to someone without money", () => {
        const owed = foldOwedByAge(BILLS, clock, false);
        expect(owed.totals).toBeNull();
        expect(owed.byAge.late1to30).toEqual({
            count: 2,
            totals: null,
            href: "/billing/invoices?view=overdue",
        });
    });

    it("points at the bills not yet due when none is late", () => {
        const owed = foldOwedByAge(BILLS.slice(0, 2), clock, true);
        expect(owed.overdue).toBe(0);
        expect(owed.href).toBe("/billing/invoices?view=issued");
    });
});
