import { describe, expect, it } from "vitest";

import { embeddedDocs } from "./docs-embedded";
import type { GstPage } from "./docs-load";
import { readPaise } from "./tools/_documents/logic";
import { CODES } from "./tools/hsn-sac-code-finder/codes";

/**
 * GST pages hold to Saroh's own GST data (plan 2026-10-31-002, R6): each
 * page's HSN/SAC codes and rates match the code finder's list, or the page
 * says where it differs (`differsFromSaroh`). And every sample invoice adds
 * up by the rules Saroh's invoices use (`_documents/logic.ts`).
 */

const pages = embeddedDocs.list("gst");

/** Where a page's code and rate don't match the code finder's list. */
function differences(p: GstPage): string[] {
    return p.codes.flatMap((c) => {
        // The finder lists 4- or 6-digit codes; a page may give the full 8 (1905 90 20 is in 1905).
        const entry = CODES.filter(
            (e) => e.kind === c.kind && c.code.startsWith(e.code),
        ).sort((a, b) => b.code.length - a.code.length)[0];
        if (!entry) return [`${c.kind} ${c.code} isn't in the code finder`];
        const rates = (entry.rate.match(/\d+(\.\d+)?/g) ?? []).map(Number);
        return rates.includes(c.rate)
            ? []
            : [
                  `${c.kind} ${c.code} is ${c.rate}% here, ${entry.rate} in the code finder`,
              ];
    });
}

describe("GST pages against Saroh's rates", () => {
    it.each(pages.map((p) => [p.slug, p] as const))(
        "%s: codes and rates match, or the page says how they differ",
        (_, p) => {
            if (!p.differsFromSaroh) expect(differences(p)).toEqual([]);
        },
    );

    it("fails a page whose rate differs without saying so", () => {
        const salon = pages.find((p) => p.slug === "salon-and-beauty-services");
        if (!salon) throw new Error("no salon page");
        const wrong = {
            ...salon,
            codes: salon.codes.map((c) => ({ ...c, rate: 18 })),
        };
        expect(differences(wrong)).toEqual([
            "SAC 999721 is 18% here, 5% in the code finder",
            "SAC 999722 is 18% here, 5% in the code finder",
        ]);
    });
});

/** "₹45.00 (2.5%)" → 4500; "—" → 0; anything else → null. */
function cash(cell: string | undefined): number | null {
    if (cell === "—") return 0;
    const m = /^₹[\d,]+\.\d{2}/.exec(cell ?? "");
    return m ? readPaise(m[0]) : null;
}

/** A head's rate in basis points: "CGST 9%" → 1800 (half of the whole), "IGST 18%" → 1800. */
function headBps(head: readonly string[]): number | null {
    for (const h of head) {
        const m = /^(CGST|IGST) (\d+(?:\.\d+)?)%$/.exec(h);
        if (m)
            return Math.round(Number(m[2]) * 100 * (m[1] === "CGST" ? 2 : 1));
    }
    return null;
}

/** Each invoice row worked out again from its value and rate; the problems found. */
function invoiceProblems(p: GstPage): string[] {
    const { head, rows, foot } = p.table;
    const col = (test: (h: string) => boolean) => head.findIndex(test);
    const value = col((h) => h === "Value");
    const total = col((h) => h === "Total");
    const code = col((h) => ["SAC", "HSN", "Code"].includes(h));
    const taxCols = {
        cgst: col((h) => h.startsWith("CGST")),
        sgst: col((h) => h.startsWith("SGST")),
        igst: col((h) => h.startsWith("IGST")),
        gst: col((h) => h === "GST"),
    };
    const problems: string[] = [];
    const sums = new Map<number, number>();
    const add = (i: number, n: number) => sums.set(i, (sums.get(i) ?? 0) + n);
    let checked = 0;
    rows.forEach((r, n) => {
        const v = cash(r[value]);
        const t = cash(r[total]);
        // A line taxed "at its HSN rate" has no figure to check (physiotherapy's brace).
        if (v === null || t === null) return;
        const own = p.codes.find((c) => c.code === r[code]?.replace(/\s/g, ""));
        const bps = own ? Math.round(own.rate * 100) : headBps(head);
        if (bps === null) {
            problems.push(`row ${n + 1}: no rate to work it out with`);
            return;
        }
        const tax = Math.round((v * bps) / 10_000);
        const want = new Map<number, number>();
        if (taxCols.gst >= 0) want.set(taxCols.gst, tax);
        else if (taxCols.igst >= 0 && r[taxCols.igst] !== "—")
            want.set(taxCols.igst, tax);
        else {
            // An odd paisa goes to CGST, as the API does.
            want.set(taxCols.cgst, tax - Math.floor(tax / 2));
            want.set(taxCols.sgst, Math.floor(tax / 2));
        }
        for (const [i, w] of want)
            if (cash(r[i]) !== w)
                problems.push(
                    `row ${n + 1}: ${head[i]} is ${r[i]}, not ${w / 100}`,
                );
        if (t !== v + tax)
            problems.push(
                `row ${n + 1}: Total is ${r[total]}, not ${(v + tax) / 100}`,
            );
        head.forEach((_, i) => {
            const c = cash(r[i]);
            if (c !== null) add(i, c);
        });
        checked++;
    });
    if (!checked) problems.push("no row could be checked");
    foot?.forEach((cell, i) => {
        const c = cash(cell);
        if (c !== null && c !== sums.get(i))
            problems.push(
                `foot: ${head[i]} is ${cell}, not ${(sums.get(i) ?? 0) / 100}`,
            );
    });
    return problems;
}

describe("GST pages' sample invoices add up", () => {
    const invoices = pages.filter((p) => p.table.kind === "invoice");

    it("every trade page draws an invoice", () => {
        for (const p of pages.filter((x) => x.type === "trade"))
            expect(p.table.kind, p.slug).toBe("invoice");
    });

    it.each(invoices.map((p) => [p.slug, p] as const))(
        "%s: each tax and total works out from its rows",
        (_, p) => {
            expect(invoiceProblems(p)).toEqual([]);
        },
    );

    it("catches a tax or a total that is off", () => {
        const salon = invoices.find(
            (p) => p.slug === "salon-and-beauty-services",
        );
        if (!salon) throw new Error("no salon page");
        const off = {
            ...salon,
            table: {
                ...salon.table,
                rows: salon.table.rows.map((r, i) =>
                    i ? r : r.map((c) => (c === "₹20.00" ? "₹21.00" : c)),
                ),
            },
        };
        expect(invoiceProblems(off)).toEqual(
            expect.arrayContaining([
                "row 1: CGST 2.5% is ₹21.00, not 20",
                "foot: CGST 2.5% is ₹57.50, not 58.5",
            ]),
        );
    });

    it("the deposit steps add up: GST in each is its 5% share", () => {
        const p = pages.find((x) => x.slug === "gst-on-advance-and-deposits");
        if (!p) throw new Error("no deposits page");
        let paid = 0;
        let gst = 0;
        for (const [, cell, tax] of p.table.rows) {
            const c = cash(cell) ?? NaN;
            const t = cash(tax) ?? NaN;
            expect(t).toBe(c - Math.round((c * 10_000) / 10_500));
            paid += c;
            gst += t;
        }
        expect([cash(p.table.foot?.[1]), cash(p.table.foot?.[2])]).toEqual([
            paid,
            gst,
        ]);
    });
});
