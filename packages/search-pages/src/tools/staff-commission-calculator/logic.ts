import { money } from "../numbers";

/**
 * The staff commission calculator's sums (design StaffCommission*.dc.html,
 * its generator genC/staff.py), in paise and basis points: pure, so a
 * test pins the boards' sample. Each person's payout is rounded to the
 * paisa once, after their parts are added.
 */

export const RULES = [
    { value: "same", label: "Same % on everything" },
    { value: "slabs", label: "Slabs" },
    { value: "apart", label: "Services and products apart" },
] as const;

export type Rule = (typeof RULES)[number]["value"];

export interface Person {
    name: string;
    /** Paise, before GST. */
    services: number;
    products: number;
}

export interface CommissionInput {
    rule: Rule;
    /** Percentages. `same` uses `service` on everything. */
    service: number;
    product: number;
    /** Slabs on services: where each ends (paise, rising), and a rate for each, one more than the ends. */
    ends: number[];
    slabRates: number[];
    people: Person[];
}

const bp = (pct: number) => Math.round(pct * 100);

/** The slabs a person's services fall in: [rate %, the part inside, its commission ×10⁴]. */
function slabParts(i: CommissionInput, services: number) {
    return i.slabRates.map((rate, n) => {
        const low = n === 0 ? 0 : (i.ends[n - 1] ?? 0);
        const high = i.ends[n] ?? Infinity;
        const part = Math.max(0, Math.min(services, high) - low);
        return { rate, part, raw: part * bp(rate) };
    });
}

/** One person's payout, in paise, and its parts in paise ×10⁴. */
export function payout(i: CommissionInput, p: Person) {
    if (i.rule === "same")
        return Math.round(((p.services + p.products) * bp(i.service)) / 10000);
    const services =
        i.rule === "apart"
            ? p.services * bp(i.service)
            : slabParts(i, p.services).reduce((s, x) => s + x.raw, 0);
    return Math.round((services + p.products * bp(i.product)) / 10000);
}

export const personName = (p: Person, n: number) =>
    p.name.trim() || `Person ${n + 1}`;

export function commission(i: CommissionInput) {
    const each = i.people.map((p) => payout(i, p));
    return {
        each,
        total: each.reduce((s, x) => s + x, 0),
        sales: i.people.reduce((s, p) => s + p.services + p.products, 0),
    };
}

export type Commission = ReturnType<typeof commission>;

export function resultRows(i: CommissionInput, c: Commission) {
    return [
        ...i.people.map((p, n) => ({
            k: personName(p, n),
            v: money(c.each[n] ?? 0),
        })),
        { k: "Sales counted", v: money(c.sales) },
        { k: "Commission this month", v: money(c.total), total: true },
    ];
}

/** How the first person's payout is made up, in words. */
export function workingNote(i: CommissionInput): string | null {
    const p = i.people[0];
    if (!p) return null;
    const who = `${personName(p, 0)}:`;
    const cut = (paise: number, pct: number) =>
        money(Math.round((paise * bp(pct)) / 10000));
    if (i.rule === "same")
        return `${who} ${i.service}% of ${money(p.services + p.products)} is ${cut(p.services + p.products, i.service)}.`;
    const products = p.products
        ? `${i.product}% of ${money(p.products)} in products is ${cut(p.products, i.product)}`
        : null;
    if (i.rule === "apart")
        return `${who} ${[
            `${i.service}% of ${money(p.services)} in services is ${cut(p.services, i.service)}`,
            products,
        ]
            .filter(Boolean)
            .join(", and ")}.`;
    const parts = slabParts(i, p.services)
        .filter((x) => x.part > 0)
        .map(
            (x, n) =>
                `${x.rate}% of the ${n === 0 ? "first" : "next"} ${money(x.part)} (${cut(x.part, x.rate)})`,
        );
    if (p.products) parts.push(`and ${cut(p.products, i.product)} on products`);
    return parts.length ? `${who} ${parts.join(", ")}.` : null;
}

/** The payout sheet as a spreadsheet: a row a person, then the total. */
export function payoutCsv(i: CommissionInput, c: Commission): string {
    const rupees = (paise: number) => (paise / 100).toFixed(2);
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    return [
        "Person,Services (₹),Products (₹),Commission (₹)",
        ...i.people.map((p, n) =>
            [
                q(personName(p, n)),
                rupees(p.services),
                rupees(p.products),
                rupees(c.each[n] ?? 0),
            ].join(","),
        ),
        ["Total", "", "", rupees(c.total)].join(","),
    ].join("\n");
}

export const WORDS = {
    form: "Your team's commission",
    rule: "How you pay commission",
    same: "Commission",
    service: "On services",
    product: "On products",
    rateBad: "A rate is between 0 and 100%.",
    slabsLegend: "Slabs on services",
    slabsHint: "Each slab's rate is paid on the part of sales inside it.",
    endBad: "Each slab has to end above the one before it, so every rupee has a rate.",
    addSlab: "Add a slab",
    sales: "This month's sales, before GST",
    salesHint: "Use amounts before GST, so nobody earns commission on tax.",
    amountBad: "Type an amount in rupees, like 40,000.",
    person: "Person",
    services: "Services, ₹",
    products: "Products, ₹",
    remove: "Remove",
    addPerson: "Add a person",
    label: "Payouts",
    empty: "Add a person and their sales to see what they earn.",
    figure: "Commission this month",
    heldSlabs:
        "Still showing the slabs from before. Fix the one marked to work it out again.",
    held: "Still showing your last payouts. Fix the one marked to work it out again.",
    gate: "Get the payout sheet (PDF and spreadsheet)",
    gateButton: "Email it",
    print: "Print or save as PDF",
    csv: "Download the spreadsheet (CSV)",
} as const;
