import { describe, expect, it } from "vitest";

import { monthCsv, monthCsvName } from "./export";
import { LABELS } from "./layers";
import { monthEntries, monthStrip, shownEntries, sumEntries } from "./money";
import type { CalendarMonth, MoneyEntry } from "./types";

const labelOf = (key: MoneyEntry["layer"]) => LABELS[key](true).label;

function entry(over: Partial<MoneyEntry> = {}): MoneyEntry {
    return {
        date: "2026-08-04",
        kind: "order_paid",
        layer: "orders",
        title: "1017",
        subtitle: "Kavya Iyer",
        currency: "INR",
        in: 0,
        out: 0,
        due: 0,
        failed: 0,
        link: { type: "order", id: "o1" },
        itemId: "o1",
        ...over,
    };
}

/** A past month: two orders paid, a refund, a fee, an invoice still due. */
const august: MoneyEntry[] = [
    entry({ in: 184_000 }),
    entry({ date: "2026-08-09", title: "1022", in: 42_050 }),
    entry({ date: "2026-08-09", kind: "refund", out: 20_000 }),
    entry({ date: "2026-08-09", kind: "fee", out: 1_025 }),
    entry({
        date: "2026-08-20",
        kind: "invoice_due",
        layer: "invoices",
        title: "INV-0042",
        subtitle: "Mehta Traders",
        due: 60_000,
        link: { type: "invoice", id: "inv1" },
    }),
    // A failed renewal is neither in, out nor due.
    entry({
        date: "2026-08-21",
        kind: "renewal_failed",
        layer: "subscriptions",
        title: "Weekly bread",
        failed: 180_000,
        link: { type: "subscription", id: "s1" },
    }),
];

/** Parse the file back: header, then rows split on commas outside quotes. */
function parse(csv: string): string[][] {
    return csv.split("\n").map((line) => {
        const fields: string[] = [];
        let field = "";
        let quoted = false;
        for (let i = 0; i < line.length; i += 1) {
            const c = line[i];
            if (quoted && c === '"' && line[i + 1] === '"') {
                field += '"';
                i += 1;
            } else if (c === '"') quoted = !quoted;
            else if (c === "," && !quoted) {
                fields.push(field);
                field = "";
            } else field += c;
        }
        fields.push(field);
        return fields;
    });
}

const minor = (text: string) => (text ? Math.round(Number(text) * 100) : 0);

describe("monthCsv", () => {
    it("writes the design's columns, one row per amount in, out or due", () => {
        const { csv, lines } = monthCsv(august, labelOf);
        const [head, ...rows] = parse(csv);
        expect(head).toEqual([
            "Date",
            "Kind",
            "What",
            "Who / detail",
            "In",
            "Out",
            "Due",
        ]);
        expect(lines).toBe(5);
        expect(rows).toHaveLength(5);
        expect(rows[0]).toEqual([
            "2026-08-04",
            "Orders",
            "Paid · #1017",
            "Kavya Iyer",
            "1840.00",
            "",
            "",
        ]);
        expect(rows[3].slice(2, 6)).toEqual([
            "Payment fee · #1017",
            "Kavya Iyer",
            "",
            "10.25",
        ]);
        expect(rows[4].slice(1, 3)).toEqual(["Invoices", "Due · INV-0042"]);
    });

    it("its rows add up to the strip, In, Out and Due", () => {
        const { csv } = monthCsv(august, labelOf);
        const rows = parse(csv).slice(1);
        const total = (col: number) =>
            rows.reduce((n, r) => n + minor(r[col]), 0);
        const sum = sumEntries(august);
        expect(total(4)).toBe(sum.in);
        expect(total(5)).toBe(sum.out);
        expect(total(6)).toBe(sum.due);

        const strip = monthStrip(august, {
            when: "past",
            today: "2026-09-18",
            currency: "INR",
        });
        const word = (key: string) => strip.find((p) => p.key === key)?.value;
        // ₹1,840 + ₹420.50 in; ₹200 + ₹10.25 out — whole rupees on screen.
        expect(word("in")).toBe("₹2,261");
        expect(word("out")).toBe("₹210");
        expect(word("due")).toBe("₹600");
    });

    it("quotes commas and quotes, and defuses what a sheet would run", () => {
        const { csv } = monthCsv(
            [
                entry({ in: 100, subtitle: 'Iyer, "Kavya"' }),
                entry({ in: 100, subtitle: '=HYPERLINK("x")' }),
            ],
            labelOf,
        );
        const lines = csv.split("\n");
        expect(lines[1]).toContain('"Iyer, ""Kavya"""');
        expect(parse(csv)[2][3]).toBe('\'=HYPERLINK("x")');
    });

    it("adds a Currency column only when the month holds two", () => {
        expect(monthCsv(august, labelOf).csv.split("\n")[0]).not.toContain(
            "Currency",
        );
        const { csv } = monthCsv(
            [entry({ in: 100 }), entry({ in: 500, currency: "USD" })],
            labelOf,
        );
        const [head, , usd] = parse(csv);
        expect(head.at(-1)).toBe("Currency");
        expect(usd.at(-1)).toBe("USD");
    });

    it("a month with no money is a header and nothing else", () => {
        expect(monthCsv([], labelOf)).toEqual({
            csv: "Date,Kind,What,Who / detail,In,Out,Due",
            lines: 0,
        });
    });

    it("names the file for its month", () => {
        expect(monthCsvName("2026-08")).toBe("money-2026-08.csv");
    });
});

describe("who gets money at all", () => {
    const base: CalendarMonth = {
        month: "2026-08",
        timezone: "Asia/Kolkata",
        timezoneSource: "business",
        from: "",
        to: "",
        layers: ["orders"],
        totals: { orders: 2 },
        days: [],
        toActOn: [],
        unavailable: [],
    };

    it("a viewer without payment:read gets no entries: no strip, no cells, no file", () => {
        // The API leaves `money` out for them (E19).
        expect(monthEntries(base)).toBeNull();
    });

    it("money that could not be added up is left out, not half-drawn", () => {
        expect(
            monthEntries({ ...base, money: { total: null, entries: [] } }),
        ).toBeNull();
    });

    it("a viewer with payment:read gets every entry", () => {
        const month = {
            ...base,
            money: {
                total: [
                    {
                        currency: "INR",
                        in: 1,
                        out: 0,
                        net: 1,
                        due: 0,
                        failed: 0,
                    },
                ],
                entries: august,
            },
        };
        expect(monthEntries(month)).toBe(august);
    });

    it("the strip follows the switches; the file is the whole month", () => {
        const shown = shownEntries(august, "INR", { invoices: true });
        expect(sumEntries(shown).due).toBe(0);
        expect(monthCsv(august, labelOf).lines).toBe(5);
    });
});
