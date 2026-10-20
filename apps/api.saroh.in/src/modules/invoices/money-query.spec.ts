// DEC-173 (invoices U4): what in the search box reads as an amount.
import { moneyQueryCents } from "./money-query";

describe("moneyQueryCents", () => {
    it.each([
        ["8400", 840_000],
        ["₹8,400", 840_000],
        ["₹ 8,400", 840_000],
        ["8,400.00", 840_000],
        ["8400.5", 840_050],
        ["Rs 8400", 840_000],
        ["rs.8,400", 840_000],
        ["INR 8400", 840_000],
        ["8,40,000", 84_000_000],
        ["840,000", 84_000_000],
        ["  8400  ", 840_000],
        ["0.50", 50],
    ])("reads %s as %i paise", (q, cents) => {
        expect(moneyQueryCents(q)).toBe(cents);
    });

    it.each([
        ["8,40", "a comma in the wrong place"],
        ["8,4000", "a comma in the wrong place"],
        [",400", "a leading comma"],
        ["8.400", "three decimals"],
        ["8.4.0", "two points"],
        ["8400.", "a point with nothing after it"],
        ["0", "nothing"],
        ["0.00", "nothing"],
        ["-8400", "a sign"],
        ["vivek", "a name"],
        ["RC/26-27/0106", "a number"],
        ["8400 rupees", "words after it"],
        ["", "blank"],
        ["₹", "only the sign"],
        ["1234567890123", "more than an invoice holds"],
    ])("doesn't read %s as an amount (%s)", (q) => {
        expect(moneyQueryCents(q)).toBeNull();
    });
});
