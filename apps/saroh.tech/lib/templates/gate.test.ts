import { describe, expect, it } from "vitest";

import { COMBOS } from "@/content/templates";
import { PAGES } from "@/lib/site-map";
import { decodeDraft } from "@/lib/tools/handoff";

import type { GatePage } from "./gate";
import {
    auditAll,
    auditPage,
    blocking,
    factProblems,
    plannedCombos,
    sameShare,
    staleFacts,
    uniqueWords,
} from "./gate";
import {
    fillHref,
    relatedOf,
    similarOf,
    templateAt,
    templatePages,
    templateView,
} from "./pages";

const words = (seed: string, n: number) =>
    Array.from({ length: n }, (_, i) => `${seed}${i}`).join(" ");

const good: GatePage = {
    path: "/templates/invoice/cleaner",
    document: "invoice",
    trade: "cleaner",
    reviewed: true,
    itemCount: 6,
    rates: ["60", "0.50"],
    tipCount: 3,
    faqs: [
        { question: "One?", answer: words("a", 10) },
        { question: "Two?", answer: words("b", 10) },
        { question: "Three?", answer: words("c", 10) },
    ],
    facts: [],
    text: words("x", 300),
    view: {
        rows: [{ description: "Clean", qty: "1", rate: "1", amount: "1" }],
        heading: "Invoice",
        number: "1",
        style: "plain",
        logo: "",
        parties: [],
        facts: [],
        extras: [],
        totals: [],
        blocks: [],
        signLine: false,
        fileName: "x.pdf",
    },
    files: ["/templates/x.pdf"],
};
const yes = () => true;
const sibling: GatePage = {
    ...good,
    path: "/templates/invoice/plumber",
    trade: "plumber",
    text: words("y", 300),
    faqs: [
        { question: "Four?", answer: words("d", 10) },
        { question: "Five?", answer: words("e", 10) },
        { question: "Six?", answer: words("f", 10) },
    ],
};
const audit = (p: GatePage, others = [sibling]) =>
    auditPage(p, [p, ...others], yes);

describe("the quality gate", () => {
    it("passes a page with everything", () => {
        expect(audit(good)).toEqual([]);
    });

    it("counts items, tips, FAQs, preview and files", () => {
        const noFile = auditPage(good, [good, sibling], () => false);
        expect(noFile[0]).toMatch(/download missing/);
        expect(audit({ ...good, itemCount: 5 })[0]).toMatch(/5 line items/);
        expect(audit({ ...good, tipCount: 2 })[0]).toMatch(/2 tips/);
        expect(audit({ ...good, faqs: good.faqs.slice(0, 2) })[0]).toMatch(
            /2 FAQs/,
        );
        expect(audit({ ...good, view: null })[0]).toMatch(/no preview/);
    });

    it("wants 250 words of the page's own", () => {
        expect(audit({ ...good, text: words("x", 100) }).join()).toMatch(
            /100 words of its own/,
        );
        // Same words as another page, so none are its own.
        const copy = { ...good, text: sibling.text };
        expect(audit(copy).join()).toMatch(/0 words of its own/);
    });

    it("fails over 50% the same as a sibling, not a stranger", () => {
        const shared = words("s", 200);
        const a = { ...good, text: `${shared} ${words("p", 300)}` };
        const b = { ...sibling, text: `${shared} ${words("q", 100)}` };
        expect(audit(b, [a]).join()).toMatch(/% the same as/);
        const stranger = { ...b, document: "quote", trade: "tutor" };
        expect(audit(stranger, [a]).join()).not.toMatch(/% the same as/);
    });

    it("never lets an FAQ repeat on a sibling", () => {
        const q = { ...sibling, faqs: [good.faqs[0], ...sibling.faqs] };
        const problems = audit(q, [good]).join();
        expect(problems).toMatch(/FAQ question also on/);
        expect(problems).toMatch(/FAQ answer repeats on/);
    });

    it("bans 'usually charges' and amounts that look like real prices", () => {
        const text = `${words("x", 300)} a plumber usually charges this`;
        expect(audit({ ...good, text }).join()).toMatch(/usually charges/);
        expect(audit({ ...good, rates: ["47.33"] })[0]).toMatch(/isn't round/);
    });

    it("wants a source and a date on every country fact", () => {
        expect(
            factProblems({ label: "Rate", value: "20%", confirm: true })[0],
        ).toMatch(/\[confirm\]/);
        expect(
            factProblems({
                label: "Rate",
                value: "20%",
                source: { name: "Tax office", url: "nope" },
                checkedOn: "soon",
            }),
        ).toHaveLength(2);
        expect(
            staleFacts(
                [
                    {
                        label: "Rate",
                        value: "20%",
                        source: { name: "T", url: "https://x.example" },
                        checkedOn: "2026-01-01",
                    },
                ],
                "2026-11-02",
            ),
        ).toEqual(["Rate"]);
    });

    it("stops the build only for a reviewed page, or with --strict", () => {
        const failing = { reviewed: false, problems: ["x"] };
        expect(blocking([failing], false)).toEqual([]);
        expect(blocking([failing], true)).toEqual([failing]);
        expect(blocking([{ ...failing, reviewed: true }], false)).toHaveLength(
            1,
        );
    });

    it("measures sameness and own words as described", () => {
        expect(sameShare("one two three four", "one two three four")).toBe(1);
        expect(uniqueWords("one two three four", ["one two three four"])).toBe(
            0,
        );
    });
});

describe("the real content", () => {
    it("passes the gate on all pages, downloads aside", () => {
        const pages = auditAll(yes);
        // An unsourced fact stays marked [confirm] until a person sources it: that's the rule, not a failure here.
        for (const r of pages) {
            const real = r.problems.filter((x) => !/confirm/i.test(x));
            expect(real, r.path).toEqual([]);
        }
    });

    it("gives a combo 250 words of its own, without the trade's shared lines", () => {
        for (const c of COMBOS) {
            const own = [
                c.lede,
                ...c.tips.flatMap((t) => [t.title, t.text]),
                ...c.faqs.flatMap((f) => [f.question, f.answer]),
                c.band.title,
                c.band.line,
            ].join(" ");
            expect(
                own.split(/\s+/).length,
                `${c.document}-${c.trade ?? c.country}`,
            ).toBeGreaterThanOrEqual(250);
        }
    });

    it("has every combo the waves planned written", () => {
        expect(plannedCombos()).toEqual([]);
    });
});

describe("template pages", () => {
    const addresses = new Set(PAGES.map((p) => p.path));

    it("are in the site map, unreviewed until the data says so", () => {
        for (const p of templatePages) {
            const entry = PAGES.find((x) => x.path === p.path);
            expect(entry?.unreviewed, p.path).toBe(
                p.reviewed ? undefined : true,
            );
        }
    });

    it("link only to pages that exist", () => {
        for (const p of templatePages) {
            const links = [...relatedOf(p), ...similarOf(p)];
            for (const l of links) {
                expect(addresses.has(l.href), `${p.path} -> ${l.href}`).toBe(
                    true,
                );
            }
        }
    });

    it("carry their example into the right tool", () => {
        const carry = (path: string) => {
            const page = templateAt(path);
            if (!page) throw new Error(path);
            const [to, hash] = fillHref(page).split("#carry=");
            return { to, draft: decodeDraft(hash) as Record<string, unknown> };
        };
        const invoice = carry("/templates/invoice/photographer");
        expect(invoice.to).toBe("/tools/invoice-generator");
        expect(invoice.draft.depositPaid).toBe("600");
        expect(invoice.draft.items).toHaveLength(6);
        const estimate = carry("/templates/estimate");
        expect(estimate.to).toBe("/tools/quote-maker");
        expect(estimate.draft.estimate).toBe(true);
        expect(carry("/templates/receipt").to).toBe("/tools/receipt-maker");
        expect(carry("/templates/receipt").draft.amount).toBe("480.00");
        expect(carry("/templates/payment-reminder-letter").to).toBe(
            "/tools/payment-reminder",
        );
        expect(carry("/templates/price-list").to).toBe("/tools/quote-maker");
    });

    it("draw the board's photographer invoice", () => {
        const page = templateAt("/templates/invoice/photographer");
        if (!page) throw new Error("missing");
        const view = templateView(page);
        expect(view.heading).toBe("Invoice");
        expect(view.totals.map((t) => t.label)).toEqual([
            "Subtotal",
            "Booking deposit paid",
            "Balance due",
        ]);
        expect(view.totals.at(-1)?.value).toBe("$1,880.00");
    });

    it("draw a price list with units and no totals, a UK invoice with VAT", () => {
        const list = templateAt("/templates/price-list");
        const uk = templateAt("/templates/invoice/uk");
        if (!list || !uk) throw new Error("missing");
        const view = templateView(list);
        expect(view.totals).toEqual([]);
        expect(view.headers?.qty).toBe("Unit");
        expect(view.rows[2].qty).toBe("per dozen");
        const vat = templateView(uk);
        expect(vat.heading).toBe("VAT invoice");
        expect(vat.parties[0].lines.at(-1)).toBe("VAT no. GB000 0000 00");
        expect(vat.totals.map((t) => t.label)).toContain("VAT 20%");
        expect(vat.totals.at(-1)?.value.startsWith("£")).toBe(true);
    });
});
