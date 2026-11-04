import { addDays, formatDate, isDate } from "./dates";
import type { Currency } from "./money";
import {
    CURRENCIES,
    formatMoney,
    formatPlain,
    parseNumber,
    toCents,
} from "./money";

/** What the invoice and quote tools edit. Numbers stay as typed. */
export interface FromDetails {
    logo: string;
    name: string;
    email: string;
    address: string;
    taxId: string;
}

export interface Item {
    id: string;
    description: string;
    qty: string;
    rate: string;
    /** A quote's optional extra: shown, but not in the total. */
    optional?: boolean;
}

export interface TaxLine {
    id: string;
    name: string;
    rate: string;
}

export type Terms = "receipt" | "net14" | "net30" | "custom";
export type DocStyle = "plain" | "bold" | "compact";
export type DepositPlan = "none" | "20" | "30" | "50" | "amount";

export interface DocDraft {
    number: string;
    issued: string;
    /** Invoice: due date. Quote: valid until. */
    due: string;
    terms: Terms;
    currency: Currency;
    clientName: string;
    clientEmail: string;
    clientAddress: string;
    items: Item[];
    taxes: TaxLine[];
    discount: string | null;
    discountMode: "percent" | "amount";
    depositPaid: string | null;
    payLink: string;
    bank: string;
    note: string;
    style: DocStyle;
    /** Quote only. */
    estimate: boolean;
    depositPlan: DepositPlan;
    depositAmount: string;
    termsText: string;
    signLine: boolean;
}

export const TERM_DAYS: Record<Exclude<Terms, "custom">, number> = {
    receipt: 0,
    net14: 14,
    net30: 30,
};

export const TERM_LABELS: Record<Terms, string> = {
    receipt: "Due on receipt",
    net14: "Net 14",
    net30: "Net 30",
    custom: "Custom",
};

/** The due date a set of terms gives, or the one typed for custom terms. */
export const dueFor = (issued: string, terms: Terms, typed: string) =>
    terms === "custom" || !isDate(issued)
        ? typed
        : addDays(issued, TERM_DAYS[terms]);

export const lineCents = (item: Pick<Item, "qty" | "rate">) =>
    toCents(parseNumber(item.qty) * parseNumber(item.rate));

export interface Totals {
    subtotal: number;
    discount: number;
    taxes: { name: string; rate: number; amount: number }[];
    total: number;
    depositPaid: number;
    /** What's left to pay. */
    due: number;
    /** Optional extras, not in the total. */
    extras: number;
    /** A quote's deposit, due on acceptance. */
    depositDue: number;
}

type TotalsInput = Pick<
    DocDraft,
    | "items"
    | "taxes"
    | "discount"
    | "discountMode"
    | "depositPaid"
    | "depositPlan"
    | "depositAmount"
>;

/** The order is the invoice's: discount first, then tax on what's left. */
export function totals(d: TotalsInput): Totals {
    const sum = (items: Item[]) =>
        items.reduce((all, item) => all + lineCents(item), 0);
    const subtotal = sum(d.items.filter((i) => !i.optional));
    const typed = d.discount === null ? 0 : parseNumber(d.discount);
    const discount = Math.min(
        subtotal,
        d.discountMode === "percent"
            ? Math.round((subtotal * typed) / 100)
            : toCents(typed),
    );
    const taxable = subtotal - discount;
    const taxes = d.taxes.map((t) => {
        const rate = parseNumber(t.rate);
        return {
            name: t.name,
            rate,
            amount: Math.round((taxable * rate) / 100),
        };
    });
    const total = taxable + taxes.reduce((all, t) => all + t.amount, 0);
    const depositPaid = Math.min(
        total,
        d.depositPaid === null ? 0 : toCents(parseNumber(d.depositPaid)),
    );
    const depositDue =
        d.depositPlan === "none"
            ? 0
            : d.depositPlan === "amount"
              ? Math.min(total, toCents(parseNumber(d.depositAmount)))
              : Math.round((total * Number(d.depositPlan)) / 100);
    return {
        subtotal,
        discount,
        taxes,
        total,
        depositPaid,
        due: total - depositPaid,
        extras: sum(d.items.filter((i) => i.optional)),
        depositDue,
    };
}

/** One document, ready to draw: the preview and the PDF both read this. */
export interface DocumentView {
    heading: string;
    number: string;
    stamp?: string;
    style: DocStyle;
    logo: string;
    /** Label, then lines, side by side under the heading. */
    parties: { label: string; lines: string[] }[];
    facts: { label: string; value: string }[];
    rows: { description: string; qty: string; rate: string; amount: string }[];
    /** A price list's columns; else Qty, Rate, Amount. */
    headers?: { qty: string; rate: string; amount: string };
    extras: { description: string; amount: string }[];
    totals: { label: string; value: string; strong?: boolean }[];
    blocks: { label: string; lines: string[] }[];
    signLine: boolean;
    fileName: string;
}

const present = (lines: string[]) => lines.filter((l) => l.trim() !== "");

export const fromLines = (from: FromDetails, taxName = "Tax ID") =>
    present([
        from.name,
        from.email,
        from.address,
        from.taxId && `${taxName} ${from.taxId}`,
    ]);

const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "-") || "document";

export function documentView(
    kind: "invoice" | "quote",
    d: DocDraft,
    from: FromDetails,
): DocumentView {
    const t = totals(d);
    const money = (cents: number) => formatMoney(cents, d.currency);
    const heading =
        kind === "invoice" ? "Invoice" : d.estimate ? "Estimate" : "Quote";
    const line = (i: Item) => ({
        description: i.description,
        qty: i.qty,
        rate: formatPlain(toCents(parseNumber(i.rate))),
        amount: formatPlain(lineCents(i)),
    });
    const issued = formatDate(d.issued);
    const due = formatDate(d.due);
    // A tax line nobody has filled in isn't a line on the document.
    const taxRows = t.taxes
        .filter((x) => x.name.trim() || x.rate)
        .map((x) => ({
            label: `${x.name || "Tax"} ${x.rate}%`,
            value: money(x.amount),
        }));
    const pay = present([d.payLink, d.bank]);
    return {
        heading,
        number: d.number,
        style: d.style,
        logo: from.logo,
        parties: [
            { label: "From", lines: fromLines(from, taxName(d)) },
            {
                label: "Bill to",
                lines: present([d.clientName, d.clientEmail, d.clientAddress]),
            },
        ],
        facts: [
            { label: "Issued", value: issued },
            { label: kind === "invoice" ? "Due" : "Valid until", value: due },
            ...(kind === "invoice" && d.terms !== "custom"
                ? [{ label: "Terms", value: TERM_LABELS[d.terms] }]
                : []),
        ].filter((f) => f.value !== ""),
        rows: d.items.filter((i) => !i.optional).map(line),
        extras: d.items
            .filter((i) => i.optional)
            .map((i) => ({
                description: i.description,
                amount: money(lineCents(i)),
            })),
        totals: [
            { label: "Subtotal", value: money(t.subtotal) },
            ...(d.discount === null
                ? []
                : [{ label: "Discount", value: `−${money(t.discount)}` }]),
            ...taxRows,
            ...(kind === "invoice" && d.depositPaid !== null
                ? [
                      { label: "Total", value: money(t.total) },
                      {
                          label: "Deposit paid",
                          value: `−${money(t.depositPaid)}`,
                      },
                  ]
                : []),
            {
                label: kind === "invoice" ? "Total due" : `${heading} total`,
                value: money(kind === "invoice" ? t.due : t.total),
                strong: true,
            },
            ...(kind === "quote" && d.depositPlan !== "none"
                ? [
                      {
                          label: "Deposit due on acceptance",
                          value: money(t.depositDue),
                      },
                  ]
                : []),
        ],
        blocks: [
            ...(kind === "quote" && d.termsText.trim()
                ? [{ label: "Terms", lines: [d.termsText] }]
                : []),
            ...(pay.length || d.note.trim()
                ? [
                      {
                          label: pay.length ? "How to pay" : "Note",
                          lines: present([...pay, d.note]),
                      },
                  ]
                : []),
        ],
        signLine: kind === "quote" && d.signLine,
        fileName: `${fileSafe(d.number || heading)}.pdf`,
    };
}

/** "VAT GB123" reads better than "Tax ID GB123" when the first tax line says. */
const taxName = (d: Pick<DocDraft, "taxes">) =>
    d.taxes.find((t) => t.name.trim() !== "")?.name.trim() ?? "Tax ID";

let nextId = 0;
export const newId = () => `${Date.now().toString(36)}-${nextId++}`;

const text = (v: unknown, fallback = "") =>
    typeof v === "string" ? v : fallback;

/**
 * What another tool hands over in the address: a quote's work, a tax rate, a
 * late fee. It's whatever was linked, so only known fields as text get in.
 */
export function applyCarry(d: DocDraft, carry: unknown): Partial<DocDraft> {
    if (!carry || typeof carry !== "object") return {};
    const c = carry as Record<string, unknown>;
    const list = (v: unknown) =>
        Array.isArray(v)
            ? v.filter(
                  (x): x is Record<string, unknown> =>
                      Boolean(x) && typeof x === "object",
              )
            : [];
    const items = list(c.items).map((i) => ({
        id: newId(),
        description: text(i.description),
        qty: text(i.qty, "1"),
        rate: text(i.rate),
    }));
    const taxes = list(c.taxes).map((t) => ({
        id: newId(),
        name: text(t.name),
        rate: text(t.rate),
    }));
    const kept = d.items.filter((i) => i.description || i.rate);
    const patch: Partial<DocDraft> = {};
    if (items.length) patch.items = [...kept, ...items];
    if (taxes.length) patch.taxes = taxes;
    for (const key of ["clientName", "clientEmail", "clientAddress"] as const) {
        if (typeof c[key] === "string") patch[key] = c[key];
    }
    if (typeof c.currency === "string" && c.currency in CURRENCIES) {
        patch.currency = c.currency as Currency;
    }
    if (c.estimate === true) patch.estimate = true;
    if (typeof c.depositPaid === "string") patch.depositPaid = c.depositPaid;
    return patch;
}

/** The columns over a document's lines: who it's between, then its facts. */
export const columnsOf = (v: DocumentView) => [
    ...v.parties,
    ...(v.facts.length
        ? [
              {
                  label: "",
                  lines: v.facts.map((f) => `${f.label}: ${f.value}`),
              },
          ]
        : []),
];
