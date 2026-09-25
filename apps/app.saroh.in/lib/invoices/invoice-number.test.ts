import { describe, expect, it } from "vitest";

import type { NumberFormat } from "./invoice-number";
import {
    creditMark,
    decodeParts,
    defaultNumberFormat,
    encodeParts,
    financialYear,
    formatFields,
    formatNumber,
    formatOf,
    longestNumber,
    moveRow,
    nextInvoiceNumber,
    numberFormatProblem,
    partRows,
    prefixOf,
} from "./invoice-number";

const now = new Date("2026-09-25T10:00:00Z");
const MONTHLY: NumberFormat = {
    parts: ["PREFIX", "FY", "MONTH"],
    separator: "/",
    digits: 4,
    restart: "MONTH",
};

describe("financialYear", () => {
    it("runs April to March", () => {
        expect(financialYear(new Date("2026-09-23T10:00:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2027-01-15T10:00:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2026-03-15T10:00:00Z"))).toBe("25-26");
    });

    it("turns over at midnight in India, not in UTC", () => {
        // 31 March 18:40 UTC is already 1 April 00:10 in India.
        expect(financialYear(new Date("2027-03-31T18:40:00Z"))).toBe("27-28");
        expect(financialYear(new Date("2027-03-31T18:20:00Z"))).toBe("26-27");
    });
});

describe("defaults: the numbers a business always had", () => {
    const first = (registered: boolean, typed: string) =>
        formatNumber(defaultNumberFormat(registered), {
            prefix: prefixOf(typed),
            counter: 1,
            now,
        });

    it("registered: per financial year", () => {
        expect(first(true, "rc")).toBe("RC/26-27/0001");
    });

    it("not registered: a plain running count", () => {
        expect(first(false, "PF")).toBe("PF-0001");
    });

    it("no prefix: the INV series", () => {
        expect(first(false, "  ")).toBe("INV-0001");
        expect(first(true, "")).toBe("INV/26-27/0001");
    });

    it("credit notes carry CN after the prefix", () => {
        expect(
            formatNumber(defaultNumberFormat(true), {
                prefix: "RC",
                counter: 1,
                credit: true,
                now,
            }),
        ).toBe("RCCN/26-27/0001");
    });
});

describe("a chosen format", () => {
    it("prints the parts in order with the separator and digits", () => {
        expect(formatNumber(MONTHLY, { prefix: "RC", counter: 1, now })).toBe(
            "RC/26-27/09/0001",
        );
        expect(
            formatNumber(
                {
                    parts: ["YEAR", "MONTH", "PREFIX"],
                    separator: "-",
                    digits: 6,
                    restart: "MONTH",
                },
                { prefix: "RC", counter: 42, now },
            ),
        ).toBe("2026-09-RC-000042");
    });

    it("puts CN where the API does", () => {
        expect(creditMark(MONTHLY, "RC")).toBe("instead");
        expect(
            formatNumber(MONTHLY, {
                prefix: "RC",
                counter: 1,
                credit: true,
                now,
            }),
        ).toBe("CN/26-27/09/0001");
        expect(creditMark({ ...MONTHLY, parts: ["FY", "MONTH"] }, "RC")).toBe(
            "first",
        );
    });

    it("the next number continues the series it restarts in", () => {
        const last = { FY: 57, MONTH: 3, NEVER: 0 };
        expect(
            nextInvoiceNumber(defaultNumberFormat(true), {
                prefix: "RC",
                last,
                samePrefix: true,
                now,
            }),
        ).toBe("RC/26-27/0058");
        expect(
            nextInvoiceNumber(MONTHLY, {
                prefix: "RC",
                last,
                samePrefix: true,
                now,
            }),
        ).toBe("RC/26-27/09/0004");
        // A new prefix starts its own count.
        expect(
            nextInvoiceNumber(MONTHLY, {
                prefix: "KL",
                last,
                samePrefix: false,
                now,
            }),
        ).toBe("KL/26-27/09/0001");
    });
});

describe("numberFormatProblem mirrors the API", () => {
    const problem = (
        format: NumberFormat,
        registered = true,
        prefix: string | null = "RC",
    ) => numberFormatProblem(format, { registered, prefix });

    it("accepts the defaults, for any prefix", () => {
        for (const prefix of [null, "R", "RC", "ABC"]) {
            expect(problem(defaultNumberFormat(true), true, prefix)).toBeNull();
            expect(
                problem(defaultNumberFormat(false), false, prefix),
            ).toBeNull();
        }
        // ABCCN/26-27/99999 would be 17: CN takes the prefix's place.
        expect(creditMark(defaultNumberFormat(true), "ABC")).toBe("instead");
        expect(creditMark(defaultNumberFormat(true), "RC")).toBe("after");
    });

    it("keeps a digit of room for the count to grow", () => {
        // RC/26-27/09/0001 is 16, but its 10,000th number would be 17.
        expect(problem(MONTHLY)).toMatchObject({
            field: "numberDigits",
            message: expect.stringMatching(
                /Once the count passes 9999, numbers like RC\/26-27\/09\/99999 are 17 characters/,
            ),
        });
        expect(problem({ ...MONTHLY, digits: 3 })).toBeNull();
        expect(longestNumber({ ...MONTHLY, digits: 3 }, "RC")).toHaveLength(16);
    });

    it("keeps a registered business restarting", () => {
        expect(problem({ ...defaultNumberFormat(false) }, true)?.field).toBe(
            "numberRestart",
        );
        expect(problem(defaultNumberFormat(false), false)).toBeNull();
    });

    it("refuses numbers that would repeat", () => {
        expect(problem({ ...MONTHLY, parts: ["PREFIX", "FY"] })?.field).toBe(
            "numberParts",
        );
        expect(
            problem({ ...MONTHLY, parts: ["PREFIX", "MONTH"] })?.message,
        ).toMatch(/same month comes round/);
        expect(
            problem({ ...MONTHLY, parts: ["PREFIX"], restart: "FY" })?.message,
        ).toMatch(/financial year or the year/);
    });

    it("refuses a number past 16 characters", () => {
        const tooLong = problem({ ...MONTHLY, digits: 5 });
        expect(tooLong?.field).toBe("numberDigits");
        expect(tooLong?.message).toMatch(/are 18 characters/);
    });

    it("refuses CN as the prefix where CN takes its place", () => {
        expect(problem({ ...MONTHLY, digits: 3 }, true, "CN")?.field).toBe(
            "invoicePrefix",
        );
    });
});

describe("the parts list", () => {
    it("round-trips through one form value", () => {
        const rows = partRows(MONTHLY);
        expect(rows.map((r) => [r.part, r.on])).toEqual([
            ["PREFIX", true],
            ["FY", true],
            ["MONTH", true],
            ["YEAR", false],
        ]);
        expect(encodeParts(rows)).toBe("PREFIX,FY,MONTH,!YEAR");
        expect(decodeParts("PREFIX,FY,MONTH,!YEAR")).toEqual(rows);
    });

    it("puts a missing or repeated part right", () => {
        expect(decodeParts("FY,FY,junk")).toEqual([
            { part: "FY", on: true },
            { part: "PREFIX", on: false },
            { part: "YEAR", on: false },
            { part: "MONTH", on: false },
        ]);
    });

    it("moves a row, and not past either end", () => {
        const rows = partRows(MONTHLY);
        expect(moveRow(rows, 2, -1).map((r) => r.part)).toEqual([
            "PREFIX",
            "MONTH",
            "FY",
            "YEAR",
        ]);
        expect(moveRow(rows, 0, -1)).toBe(rows);
        expect(moveRow(rows, 3, 1)).toBe(rows);
    });

    it("the four fields and a format are the same thing", () => {
        expect(formatOf(formatFields(MONTHLY))).toEqual(MONTHLY);
        expect(formatFields(defaultNumberFormat(false))).toEqual({
            numberParts: "PREFIX,!FY,!YEAR,!MONTH",
            numberSeparator: "-",
            numberDigits: "4",
            numberRestart: "NEVER",
        });
    });
});
