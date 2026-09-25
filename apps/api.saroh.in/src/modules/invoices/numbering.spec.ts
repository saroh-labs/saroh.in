import { BadRequestException } from "@nestjs/common";

import type { NumberFormat } from "./numbering";
import {
    creditMark,
    defaultNumberFormat,
    financialYear,
    formatInvoiceNumber,
    invoiceSeriesKeys,
    LEGACY_SERIES,
    longestNumber,
    nextInvoiceNumber,
    numberFormatFor,
    numberFormatProblem,
    prefixProblem,
    readNumberFormat,
    seriesFor,
} from "./numbering";

/**
 * A counter per (business, series), like the table: upsert-increment — and
 * the business's issued numbers, which the unique index keeps one of each.
 */
function fakeSequencer(issued: string[] = []) {
    const rows = new Map<string, number>();
    const numbers = new Set(issued);
    const upsert = jest.fn(
        ({
            where,
        }: {
            where: {
                organizationId_series: {
                    organizationId: string;
                    series: string;
                };
            };
        }) => {
            const { organizationId, series } = where.organizationId_series;
            const key = `${organizationId}|${series}`;
            const next = (rows.get(key) ?? 0) + 1;
            rows.set(key, next);
            return Promise.resolve({ lastNumber: next });
        },
    );
    const update = jest.fn(
        ({
            where,
            data,
        }: {
            where: {
                organizationId_series: {
                    organizationId: string;
                    series: string;
                };
            };
            data: { lastNumber: number };
        }) => {
            const { organizationId, series } = where.organizationId_series;
            rows.set(`${organizationId}|${series}`, data.lastNumber);
            return Promise.resolve({ lastNumber: data.lastNumber });
        },
    );
    const findUnique = jest.fn(
        ({ where }: { where: { organizationId_number: { number: string } } }) =>
            Promise.resolve(
                numbers.has(where.organizationId_number.number)
                    ? { id: "inv" }
                    : null,
            ),
    );
    const findMany = jest.fn(
        ({ where }: { where: { number: { startsWith: string } } }) =>
            Promise.resolve(
                [...numbers]
                    .filter((n) => n.startsWith(where.number.startsWith))
                    .map((number) => ({ number })),
            ),
    );
    /** Take the next number in a series and issue it. */
    const issue = async (series: ReturnType<typeof seriesFor>) => {
        const n = await nextInvoiceNumber(tx as never, "org_1", series);
        numbers.add(n);
        return n;
    };
    const tx = {
        invoiceSequence: { upsert, update },
        invoice: { findUnique, findMany },
    };
    return { tx, upsert, update, rows, issue, numbers };
}

describe("invoice numbering", () => {
    it("keeps the legacy INV series: pads to four digits and then grows", () => {
        expect(formatInvoiceNumber(1)).toBe("INV-0001");
        expect(formatInvoiceNumber(42)).toBe("INV-0042");
        expect(formatInvoiceNumber(10000)).toBe("INV-10000");
        expect(LEGACY_SERIES.key).toBe("INV");
        expect(LEGACY_SERIES.format(7)).toBe("INV-0007");
    });

    it("takes the number with one upsert keyed on business and series", async () => {
        const upsert = jest.fn().mockResolvedValue({ lastNumber: 1 });
        const tx = {
            invoiceSequence: { upsert },
            invoice: { findUnique: jest.fn().mockResolvedValue(null) },
        };

        await expect(nextInvoiceNumber(tx as never, "org_1")).resolves.toBe(
            "INV-0001",
        );
        expect(upsert).toHaveBeenCalledWith({
            where: {
                organizationId_series: {
                    organizationId: "org_1",
                    series: "INV",
                },
            },
            create: { organizationId: "org_1", series: "INV", lastNumber: 1 },
            update: { lastNumber: { increment: 1 } },
            select: { lastNumber: true },
        });
    });
});

describe("financial year", () => {
    it("runs April to March, in the business's own time", () => {
        // 1 April 2027 00:10 in India is still 31 March in UTC.
        expect(financialYear(new Date("2027-03-31T18:40:00Z"))).toBe("27-28");
        expect(financialYear(new Date("2027-03-31T18:20:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2026-09-23T10:00:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2027-01-15T10:00:00Z"))).toBe("26-27");
        expect(financialYear(new Date("2099-06-01T10:00:00Z"))).toBe("99-00");
    });
});

describe("series", () => {
    const at = new Date("2026-09-23T10:00:00Z");

    it("a registered business numbers by prefix and financial year", () => {
        const s = seriesFor({
            registered: true,
            prefix: "RC",
            kind: "INVOICE",
            at,
        });
        expect(s.key).toBe("RC/26-27");
        expect(s.format(1)).toBe("RC/26-27/0001");
    });

    it("an unregistered business numbers by a plain prefix", () => {
        const s = seriesFor({
            registered: false,
            prefix: "PF",
            kind: "INVOICE",
            at,
        });
        expect(s.key).toBe("PF");
        expect(s.format(1)).toBe("PF-0001");
    });

    it("no prefix keeps the legacy INV series", () => {
        expect(
            seriesFor({
                registered: false,
                prefix: null,
                kind: "INVOICE",
                at,
            }).format(3),
        ).toBe("INV-0003");
        expect(
            seriesFor({
                registered: true,
                prefix: null,
                kind: "INVOICE",
                at,
            }).format(3),
        ).toBe("INV/26-27/0003");
    });

    it("credit notes have their own series; supplementary invoices share the invoices'", () => {
        expect(
            seriesFor({
                registered: true,
                prefix: "RC",
                kind: "CREDIT_NOTE",
                at,
            }).format(1),
        ).toBe("RCCN/26-27/0001");
        expect(
            seriesFor({
                registered: false,
                prefix: "PF",
                kind: "CREDIT_NOTE",
                at,
            }).format(1),
        ).toBe("PFCN-0001");
        expect(
            seriesFor({
                registered: true,
                prefix: "RC",
                kind: "SUPPLEMENTARY",
                at,
            }).key,
        ).toBe("RC/26-27");
    });

    it("the longest number a valid prefix makes stays within 16 characters", () => {
        // ABCCN/26-27/ leaves no room for the count to grow past 9999, so
        // CN takes the prefix's place.
        const s = seriesFor({
            registered: true,
            prefix: "ABC",
            kind: "CREDIT_NOTE",
            at,
        });
        expect(s.format(1)).toBe("CN/26-27/0001");
        expect(s.format(99999)).toBe("CN/26-27/99999");
        expect(
            seriesFor({
                registered: true,
                prefix: "ABC",
                kind: "INVOICE",
                at,
            }).format(99999),
        ).toBe("ABC/26-27/99999");
    });

    it("refuses a number past 16 characters rather than printing it", () => {
        // A format saving allows, counted ten times past its headroom.
        const s = seriesFor({
            registered: true,
            prefix: "RC",
            kind: "INVOICE",
            at,
            format: { ...MONTHLY, digits: 3 },
        });
        expect(s.format(9999)).toBe("RC/26-27/09/9999");
        expect(() => s.format(10000)).toThrow(/16 characters/);
    });
});

describe("prefix", () => {
    it("is one to three letters or digits", () => {
        expect(prefixProblem("RC")).toBeNull();
        expect(prefixProblem("R2D")).toBeNull();
        expect(prefixProblem("")).toMatch(/one to three/);
        expect(prefixProblem("ABCD")).toMatch(/one to three/);
        expect(prefixProblem("R/C")).toMatch(/letters and digits/);
        expect(prefixProblem("rc")).toMatch(/capital/);
    });
});

describe("issuing across 1 April", () => {
    it("two invoices at once either side of midnight land in the right series, distinct", async () => {
        const { tx } = fakeSequencer();
        const before = new Date("2027-03-31T18:29:59Z"); // 23:59:59 IST, 31 March
        const after = new Date("2027-03-31T18:30:00Z"); // 00:00 IST, 1 April
        const take = (at: Date) =>
            nextInvoiceNumber(
                tx as never,
                "org_1",
                seriesFor({
                    registered: true,
                    prefix: "RC",
                    kind: "INVOICE",
                    at,
                }),
            );

        // A March invoice already out.
        await take(new Date("2027-03-10T10:00:00Z"));
        const [march, april, april2] = await Promise.all([
            take(before),
            take(after),
            take(after),
        ]);
        expect(march).toBe("RC/26-27/0002");
        expect(april).toBe("RC/27-28/0001");
        expect(april2).toBe("RC/27-28/0002");
        expect(new Set([march, april, april2]).size).toBe(3);
    });
});

// ── The business's number format ────────────────────────────────────────────

const REGISTERED_DEFAULT: NumberFormat = {
    parts: ["PREFIX", "FY"],
    separator: "/",
    digits: 4,
    restart: "FY",
};
const MONTHLY: NumberFormat = {
    parts: ["PREFIX", "FY", "MONTH"],
    separator: "/",
    digits: 4,
    restart: "MONTH",
};

describe("defaults: a business that never chose a format keeps its numbers", () => {
    const at = new Date("2026-09-23T10:00:00Z");
    const number = (
        registered: boolean,
        prefix: string | null,
        kind: "INVOICE" | "CREDIT_NOTE" | "SUPPLEMENTARY" = "INVOICE",
        format: unknown = null,
    ) => {
        const s = seriesFor({ registered, prefix, kind, at, format });
        return [s.key, s.format(1)];
    };

    it("registered with a prefix: RC/26-27/0001, per financial year", () => {
        expect(number(true, "RC")).toEqual(["RC/26-27", "RC/26-27/0001"]);
        expect(number(true, "RC", "CREDIT_NOTE")).toEqual([
            "RCCN/26-27",
            "RCCN/26-27/0001",
        ]);
        expect(number(true, "RC", "SUPPLEMENTARY")).toEqual([
            "RC/26-27",
            "RC/26-27/0001",
        ]);
    });

    it("not registered with a prefix: RC-0001, one running counter", () => {
        expect(number(false, "RC")).toEqual(["RC", "RC-0001"]);
        expect(number(false, "RC", "CREDIT_NOTE")).toEqual([
            "RCCN",
            "RCCN-0001",
        ]);
    });

    it("no prefix: the legacy INV series", () => {
        const legacy = seriesFor({
            registered: false,
            prefix: null,
            kind: "INVOICE",
            at,
        });
        expect(legacy.key).toBe(LEGACY_SERIES.key);
        expect(legacy.format(12)).toBe(LEGACY_SERIES.format(12));
        expect(number(false, null, "CREDIT_NOTE")).toEqual([
            "INVCN",
            "INVCN-0001",
        ]);
        expect(number(true, null)).toEqual(["INV/26-27", "INV/26-27/0001"]);
    });

    it("a stored format that is not one is read as none", () => {
        for (const junk of [
            null,
            "RC",
            [],
            { parts: ["PREFIX"], separator: "|", digits: 4, restart: "FY" },
            {
                parts: ["PREFIX", "PREFIX"],
                separator: "/",
                digits: 4,
                restart: "FY",
            },
            { parts: ["PREFIX"], separator: "/", digits: 7, restart: "FY" },
            { parts: ["WEEK"], separator: "/", digits: 4, restart: "FY" },
        ]) {
            expect(readNumberFormat(junk)).toBeNull();
            expect(number(true, "RC", "INVOICE", junk)[1]).toBe(
                "RC/26-27/0001",
            );
        }
        expect(numberFormatFor(null, false)).toEqual(
            defaultNumberFormat(false),
        );
    });

    it("the defaults are valid formats for any valid prefix", () => {
        for (const registered of [true, false]) {
            for (const prefix of [null, "R", "RC", "ABC"]) {
                expect(
                    numberFormatProblem(defaultNumberFormat(registered), {
                        registered,
                        prefix,
                    }),
                ).toBeNull();
            }
        }
    });
});

describe("a chosen format", () => {
    const at = new Date("2026-09-23T10:00:00Z");
    const make = (
        format: NumberFormat,
        kind: "INVOICE" | "CREDIT_NOTE" = "INVOICE",
        prefix: string | null = "RC",
        registered = true,
    ) => seriesFor({ registered, prefix, kind, at, format });

    it("prints its parts in its order, with its separator and digits", () => {
        expect(make(MONTHLY).format(1)).toBe("RC/26-27/09/0001");
        expect(
            make({
                parts: ["FY", "PREFIX"],
                separator: "-",
                digits: 3,
                restart: "FY",
            }).format(7),
        ).toBe("26-27-RC-007");
        expect(
            make({
                parts: ["PREFIX", "YEAR", "MONTH"],
                separator: "-",
                digits: 5,
                restart: "MONTH",
            }).format(42),
        ).toBe("RC-2026-09-00042");
        expect(
            make(
                { parts: [], separator: "/", digits: 6, restart: "NEVER" },
                "INVOICE",
                "RC",
                false,
            ).format(3),
        ).toBe("000003");
    });

    it("the counter grows past its digits rather than wrap", () => {
        expect(make({ ...REGISTERED_DEFAULT, digits: 3 }).format(1000)).toBe(
            "RC/26-27/1000",
        );
    });

    it("the series is the prefix and the restart period, not the rest of the format", () => {
        expect(make(REGISTERED_DEFAULT).key).toBe("RC/26-27");
        expect(
            make({
                parts: ["PREFIX", "YEAR", "FY"],
                separator: "-",
                digits: 6,
                restart: "FY",
            }).key,
        ).toBe("RC/26-27");
        expect(make(MONTHLY).key).toBe("RC/2026-09");
        expect(make(MONTHLY, "CREDIT_NOTE").key).toBe("RCCN/2026-09");
        expect(
            make(
                {
                    parts: ["PREFIX"],
                    separator: "/",
                    digits: 4,
                    restart: "NEVER",
                },
                "INVOICE",
                "RC",
                false,
            ).key,
        ).toBe("RC");
        expect(invoiceSeriesKeys("RC", at)).toEqual({
            FY: "RC/26-27",
            MONTH: "RC/2026-09",
            NEVER: "RC",
        });
        expect(invoiceSeriesKeys(null, at).NEVER).toBe(LEGACY_SERIES.key);
    });

    it("a cleared zone (an old empty string) reads India's time, not no zone", () => {
        // 31 March 23:30 in India is still the old financial year.
        const at = new Date("2026-03-31T18:00:00Z");
        expect(invoiceSeriesKeys("RC", at, "").FY).toBe("RC/25-26");
        expect(invoiceSeriesKeys("RC", at, "Europe/London").FY).toBe(
            "RC/25-26",
        );
        expect(invoiceSeriesKeys("RC", at, "Asia/Tokyo").FY).toBe("RC/26-27");
    });

    it("the month is the business's own: 1 October 00:10 in India is October", () => {
        const s = seriesFor({
            registered: true,
            prefix: "RC",
            kind: "INVOICE",
            at: new Date("2026-09-30T18:40:00Z"),
            timezone: "Asia/Kolkata",
            format: MONTHLY,
        });
        expect(s.key).toBe("RC/2026-10");
        expect(s.format(1)).toBe("RC/26-27/10/0001");
    });

    it("a stored counter that never restarts meets a registered business as yearly", () => {
        const never = {
            parts: ["PREFIX", "FY"],
            separator: "/",
            digits: 4,
            restart: "NEVER",
        };
        expect(numberFormatFor(never, true).restart).toBe("FY");
        expect(numberFormatFor(never, false).restart).toBe("NEVER");
    });

    describe("credit notes can never share an invoice's number", () => {
        it("carry CN after the prefix where it fits, as they always have", () => {
            expect(creditMark(REGISTERED_DEFAULT, "RC")).toBe("after");
            expect(make(REGISTERED_DEFAULT, "CREDIT_NOTE").format(1)).toBe(
                "RCCN/26-27/0001",
            );
        });

        it("carry CN in the prefix's place where after it would pass 16", () => {
            // ABCCN/26-27/99999, the count a digit past its four, is 17.
            expect(creditMark(REGISTERED_DEFAULT, "ABC")).toBe("instead");
            // RCCN/26-27/09/0001 would be 18.
            expect(creditMark(MONTHLY, "RC")).toBe("instead");
            expect(make(MONTHLY, "CREDIT_NOTE").format(1)).toBe(
                "CN/26-27/09/0001",
            );
            expect(make(MONTHLY).format(1)).toBe("RC/26-27/09/0001");
        });

        it("lead with CN when the number has no prefix", () => {
            const bare: NumberFormat = {
                parts: ["FY", "MONTH"],
                separator: "-",
                digits: 4,
                restart: "MONTH",
            };
            expect(creditMark(bare, "RC")).toBe("first");
            expect(make(bare).format(1)).toBe("26-27-09-0001");
            expect(make(bare, "CREDIT_NOTE").format(1)).toBe(
                "CN-26-27-09-0001",
            );
        });
    });
});

describe("format rules", () => {
    const problem = (
        format: NumberFormat,
        registered = true,
        prefix: string | null = "RC",
    ) => numberFormatProblem(format, { registered, prefix });

    it("the defaults leave the count room to grow a digit, for any prefix", () => {
        // With no prefix, or a three-character one, CN takes its place on
        // a registered business's credit notes: INVCN/26-27/99999 is 17.
        expect(longestNumber(REGISTERED_DEFAULT, null)).toBe("INV/26-27/99999");
        expect(longestNumber(REGISTERED_DEFAULT, "ABC")).toBe(
            "ABC/26-27/99999",
        );
        expect(longestNumber(REGISTERED_DEFAULT, "RC")).toBe(
            "RCCN/26-27/99999",
        );
        expect(problem(REGISTERED_DEFAULT, true, "ABC")).toBeNull();
    });

    it("keeps a digit of room: a format at 16 with its own digits is refused", () => {
        // RC/26-27/09/0001 is 16, but its 10,000th number would be 17.
        expect(problem(MONTHLY)).toMatchObject({
            field: "invoiceNumberDigits",
            message: expect.stringMatching(
                /Once the count passes 9999, numbers like RC\/26-27\/09\/99999 are 17 characters/,
            ),
        });
        // Three digits leave the room: RC/26-27/09/9999 is 16.
        expect(problem({ ...MONTHLY, digits: 3 })).toBeNull();
        expect(longestNumber({ ...MONTHLY, digits: 3 }, "RC")).toHaveLength(16);
    });

    it("never restarting is only for a business that is not registered", () => {
        const never: NumberFormat = {
            parts: ["PREFIX"],
            separator: "-",
            digits: 4,
            restart: "NEVER",
        };
        expect(problem(never, false)).toBeNull();
        expect(problem(never, true)?.field).toBe("invoiceNumberRestart");
    });

    it("a yearly restart needs the financial year or the year", () => {
        const noYear: NumberFormat = {
            parts: ["PREFIX", "MONTH"],
            separator: "/",
            digits: 4,
            restart: "FY",
        };
        expect(problem(noYear)).toMatchObject({
            field: "invoiceNumberParts",
            message: expect.stringMatching(/financial year or the year/),
        });
        expect(problem({ ...noYear, parts: ["PREFIX", "YEAR"] })).toBeNull();
        expect(problem({ ...noYear, parts: ["PREFIX", "FY"] })).toBeNull();
    });

    it("a monthly restart needs the month, and the financial year or the year", () => {
        expect(problem({ ...MONTHLY, parts: ["PREFIX", "FY"] })).toMatchObject({
            field: "invoiceNumberParts",
            message: expect.stringMatching(/month in them/),
        });
        expect(
            problem({ ...MONTHLY, parts: ["PREFIX", "MONTH"] }),
        ).toMatchObject({
            field: "invoiceNumberParts",
            message: expect.stringMatching(/same month comes round/),
        });
        expect(
            problem({ ...MONTHLY, parts: ["PREFIX", "YEAR", "MONTH"] }),
        ).toBeNull();
    });

    it("the longest number, invoice or credit note, is at most 16 characters", () => {
        // RC/26-27/09/999999: 18.
        expect(problem({ ...MONTHLY, digits: 5 })).toMatchObject({
            field: "invoiceNumberDigits",
            message: expect.stringMatching(/RC\/26-27\/09\/999999 are 18/),
        });
        // No prefix: CN/26-27/09/9999999 is the long one, 19.
        expect(
            problem({ ...MONTHLY, parts: ["FY", "MONTH"], digits: 6 }),
        ).toMatchObject({
            field: "invoiceNumberDigits",
            message: expect.stringMatching(/CN\/26-27\/09\/9999999 are 19/),
        });
        expect(
            problem({
                parts: ["PREFIX", "YEAR", "FY", "MONTH"],
                separator: "-",
                digits: 3,
                restart: "MONTH",
            }),
        ).toMatchObject({ field: "invoiceNumberDigits" });
    });

    it("uses only capitals, digits, - and /", () => {
        expect(longestNumber(MONTHLY, "RC")).toMatch(/^[A-Z0-9/-]+$/);
        expect(problem(REGISTERED_DEFAULT, true, "r c")).toMatchObject({
            field: "invoiceNumberParts",
        });
    });

    it("CN cannot be the prefix where it takes the prefix's place", () => {
        expect(problem({ ...MONTHLY, digits: 3 }, true, "CN")).toMatchObject({
            field: "invoicePrefix",
        });
        // Where it follows the prefix, CNCN/26-27/0001 is its own.
        expect(problem(REGISTERED_DEFAULT, true, "CN")).toBeNull();
    });
});

describe("changing the format mid-year", () => {
    const sept = new Date("2026-09-10T10:00:00Z");
    const series = (format: NumberFormat | null, at = sept) =>
        seriesFor({
            registered: true,
            prefix: "RC",
            kind: "INVOICE",
            at,
            format,
        });

    it("renumbers nothing and carries on counting in the same series", async () => {
        const { issue } = fakeSequencer();
        expect(await issue(series(null))).toBe("RC/26-27/0001");
        expect(await issue(series(null))).toBe("RC/26-27/0002");
        // Same restart (the financial year), new parts, separator and digits.
        const withMonth: NumberFormat = {
            parts: ["PREFIX", "FY", "MONTH"],
            separator: "-",
            digits: 3,
            restart: "FY",
        };
        expect(await issue(series(withMonth))).toBe("RC-26-27-09-003");
        // And back: the counter never went back.
        expect(await issue(series(null))).toBe("RC/26-27/0004");
    });

    it("a new restart period starts its own series", async () => {
        const { issue } = fakeSequencer();
        await issue(series(null));
        await issue(series(null));
        expect(await issue(series(MONTHLY))).toBe("RC/26-27/09/0001");
    });

    it("steps past a number the business already issued, never hitting the unique index", async () => {
        // September's numbers were taken on the yearly counter, in a format
        // that happened to carry the month...
        const { issue, update, numbers } = fakeSequencer();
        const yearlyWithMonth: NumberFormat = { ...MONTHLY, restart: "FY" };
        for (let i = 0; i < 5; i++) await issue(series(yearlyWithMonth));
        expect(numbers).toContain("RC/26-27/09/0005");
        // ...so September's own monthly counter would start on one of them.
        expect(await issue(series(MONTHLY))).toBe("RC/26-27/09/0006");
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId_series: {
                        organizationId: "org_1",
                        series: "RC/2026-09",
                    },
                },
                data: { lastNumber: 6 },
            }),
        );
        // And carries on from there.
        expect(await issue(series(MONTHLY))).toBe("RC/26-27/09/0007");
        expect(numbers.size).toBe(7);
    });

    it("steps past numbers from before a counter was kept", async () => {
        const { issue } = fakeSequencer(["RC-0001", "RC-0002", "RC-0010"]);
        const plain = seriesFor({
            registered: false,
            prefix: "RC",
            kind: "INVOICE",
            at: sept,
        });
        expect(await issue(plain)).toBe("RC-0011");
    });

    it("gives up, on the number format, when every step lands on a number taken", async () => {
        // A format that can only print one number, already issued: stepping
        // past it never frees one.
        const { tx, update } = fakeSequencer(["RC-STUCK"]);
        const stuck = { key: "RC", stem: "RC-", format: () => "RC-STUCK" };
        await expect(
            nextInvoiceNumber(tx as never, "org_1", stuck),
        ).rejects.toMatchObject({
            constructor: BadRequestException,
            response: { details: { field: "invoiceNumberParts" } },
        });
        // Three steps past it, then no more.
        expect(update).toHaveBeenCalledTimes(3);
    });
});

describe("issuing across a month's end on a monthly counter", () => {
    it("restarts at 0001 on the 1st, in the business's time", async () => {
        const { issue } = fakeSequencer();
        const at = (iso: string) =>
            seriesFor({
                registered: true,
                prefix: "RC",
                kind: "INVOICE",
                at: new Date(iso),
                format: MONTHLY,
            });
        expect(await issue(at("2026-09-30T18:00:00Z"))).toBe(
            "RC/26-27/09/0001",
        );
        expect(await issue(at("2026-09-30T18:20:00Z"))).toBe(
            "RC/26-27/09/0002",
        );
        // 00:00 IST, 1 October.
        expect(await issue(at("2026-09-30T18:30:00Z"))).toBe(
            "RC/26-27/10/0001",
        );
        // 31 March → 1 April: a new month and a new financial year.
        expect(await issue(at("2027-03-31T18:29:00Z"))).toBe(
            "RC/26-27/03/0001",
        );
        expect(await issue(at("2027-03-31T18:30:00Z"))).toBe(
            "RC/27-28/04/0001",
        );
    });
});
