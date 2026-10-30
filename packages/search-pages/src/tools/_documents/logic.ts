import { rupee } from "../../money";

/**
 * What the four document makers share (GST invoice, bill of supply,
 * receipt, quotation; boards `GstInvoice*`, `BillOfSupply*`,
 * `ReceiptMaker*`, `Quotation*`): reading what's typed, lines and their
 * GST in integer paise (no float touches money), CGST + SGST in the
 * seller's state and IGST outside it, the GSTIN check, Indian states,
 * dates, and the amount in words. Pure, so its tests pin the boards'
 * samples to the paisa. The rules mirror the API's
 * (`apps/api.saroh.in/src/modules/invoices/gst.ts`), copied, as the
 * package takes no workspace imports.
 */

/** GST's rates (the API's list); the slabs since 22 Sep 2025 are 0, 5, 18 and 40. */
export const GST_RATES = [
    "0",
    "0.25",
    "1.5",
    "3",
    "5",
    "12",
    "18",
    "28",
    "40",
] as const;

/** "18" → 1800, "0.25" → 25: rates in basis points. */
export function bps(rate: string): number {
    const [whole = "0", frac = ""] = rate.split(".");
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** A rate in basis points as the bill prints it: 1800 → "18%", 250 → "2.5%", 12.5 → "0.125%". */
export const ratePct = (b: number) => `${b / 100}%`;

/** Rupees as typed ("1,500", "₹1500.50") → paise; null when it isn't an amount to the paisa. */
export function readPaise(value: string): number | null {
    const v = value.replace(/[,\s₹]/g, "");
    const m = /^(\d{1,11})(?:\.(\d{1,2}))?$/.exec(v);
    if (!m) return null;
    return Number(m[1]) * 100 + Number(((m[2] ?? "") + "00").slice(0, 2));
}

/** A quantity as typed ("2", "1.5") → thousandths; null when it isn't one above 0. */
export function readQty(value: string): number | null {
    const m = /^(\d{1,7})(?:\.(\d{1,3}))?$/.exec(value.replace(/[,\s]/g, ""));
    if (!m) return null;
    const q = Number(m[1]) * 1000 + Number(((m[2] ?? "") + "000").slice(0, 3));
    return q > 0 ? q : null;
}

/** Paise as the bill prints it, always with paise: 241500 → "₹2,415.00". */
export const money = (paise: number) => rupee(paise / 100, true);

/** Paise as a short figure, paise only when there are some: 300000 → "₹3,000". */
export const short = (paise: number) => rupee(paise / 100);

/** One line as typed in the form. `gst` is a rate from GST_RATES; makers without GST leave it. */
export interface LineInput {
    item: string;
    code: string;
    qty: string;
    rate: string;
    gst: string;
}

export const emptyLine = (gst = "18"): LineInput => ({
    item: "",
    code: "",
    qty: "1",
    rate: "",
    gst,
});

/** A line the sums can use. */
export interface Line {
    item: string;
    code: string;
    /** Thousandths. */
    qty: number;
    ratePaise: number;
    bps: number;
    /** Quantity × rate, to the paisa (before GST). */
    amount: number;
}

/** Which of a line's numbers can't be read (a filled-in field only). */
export function lineProblems(l: LineInput): ("qty" | "rate")[] {
    const out: ("qty" | "rate")[] = [];
    if (l.qty.trim() && readQty(l.qty) === null) out.push("qty");
    if (l.rate.trim() && readPaise(l.rate) === null) out.push("rate");
    return out;
}

/**
 * The lines the bill shows: those with a name or a rate, whose numbers
 * read. An empty quantity is one; an empty rate is ₹0.
 */
export function readLines(inputs: readonly LineInput[]): Line[] {
    const out: Line[] = [];
    for (const l of inputs) {
        if (!l.item.trim() && !l.rate.trim()) continue;
        const qty = l.qty.trim() ? readQty(l.qty) : 1000;
        const ratePaise = l.rate.trim() ? readPaise(l.rate) : 0;
        if (qty === null || ratePaise === null) continue;
        out.push({
            item: l.item.trim(),
            code: l.code.trim(),
            qty,
            ratePaise,
            bps: bps(l.gst || "0"),
            amount: Math.round((qty * ratePaise) / 1000),
        });
    }
    return out;
}

/** "Butter cookies, 250 g box × 2 · HSN 1905": a SAC is six digits starting 99. */
export function lineLabel(l: Line): string {
    const qty = l.qty === 1000 ? "" : ` × ${l.qty / 1000}`;
    const code = l.code
        ? ` · ${/^99\d{4}$/.test(l.code) ? "SAC" : "HSN"} ${l.code}`
        : "";
    return `${l.item || "Item"}${qty}${code}`;
}

export interface Sum {
    k: string;
    v: string;
}

export interface GstTotals {
    taxable: number;
    tax: number;
    total: number;
    /** Taxable value, then CGST + SGST (or IGST) a rate at a time; no total. */
    rows: Sum[];
}

/**
 * GST on the lines: each line's tax rounded to the paisa, added up a rate
 * at a time; in the seller's state half is CGST and half SGST (an odd
 * paisa to CGST, as the API does), in another IGST. `charge` false (no
 * GSTIN): no tax at all.
 */
export function gstTotals(
    lines: readonly Line[],
    inter: boolean,
    charge = true,
): GstTotals {
    const taxable = lines.reduce((s, l) => s + l.amount, 0);
    const byRate = new Map<number, number>();
    if (charge) {
        for (const l of lines) {
            if (l.bps <= 0) continue;
            const t = Math.round((l.amount * l.bps) / 10_000);
            byRate.set(l.bps, (byRate.get(l.bps) ?? 0) + t);
        }
    }
    const rows: Sum[] = [{ k: "Taxable value", v: money(taxable) }];
    let tax = 0;
    for (const [b, t] of [...byRate].sort((x, y) => x[0] - y[0])) {
        tax += t;
        if (inter) rows.push({ k: `IGST ${ratePct(b)}`, v: money(t) });
        else {
            const s = Math.floor(t / 2);
            rows.push(
                { k: `CGST ${ratePct(b / 2)}`, v: money(t - s) },
                { k: `SGST ${ratePct(b / 2)}`, v: money(s) },
            );
        }
    }
    return { taxable, tax, total: taxable + tax, rows };
}

const ONES = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
];
const TENS = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
];

function under100(n: number): string {
    if (n < 20) return ONES[n] ?? "";
    const t = TENS[Math.floor(n / 10)] ?? "";
    return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

/** Whole rupees in Indian words: crore, lakh, thousand, hundred. */
function indianWords(n: number): string {
    if (n === 0) return "zero";
    const parts: string[] = [];
    const crore = Math.floor(n / 10_000_000);
    const lakh = Math.floor((n % 10_000_000) / 100_000);
    const thousand = Math.floor((n % 100_000) / 1000);
    const hundred = Math.floor((n % 1000) / 100);
    const rest = n % 100;
    if (crore) parts.push(`${indianWords(crore)} crore`);
    if (lakh) parts.push(`${under100(lakh)} lakh`);
    if (thousand) parts.push(`${under100(thousand)} thousand`);
    if (hundred) parts.push(`${ONES[hundred]} hundred`);
    if (rest)
        parts.push(parts.length ? `and ${under100(rest)}` : under100(rest));
    return parts.join(" ");
}

/** 143000 → "Rupees one thousand four hundred and thirty only"; paise said after. */
export function amountInWords(paise: number): string {
    const r = Math.floor(paise / 100);
    const p = paise % 100;
    const tail = p ? ` and ${under100(p)} paise` : "";
    return `Rupees ${indianWords(r)}${tail} only`;
}

/** India's GST state codes and names (the register's; app.saroh.in's list). */
export const STATES = [
    ["01", "Jammu and Kashmir"],
    ["02", "Himachal Pradesh"],
    ["03", "Punjab"],
    ["04", "Chandigarh"],
    ["05", "Uttarakhand"],
    ["06", "Haryana"],
    ["07", "Delhi"],
    ["08", "Rajasthan"],
    ["09", "Uttar Pradesh"],
    ["10", "Bihar"],
    ["11", "Sikkim"],
    ["12", "Arunachal Pradesh"],
    ["13", "Nagaland"],
    ["14", "Manipur"],
    ["15", "Mizoram"],
    ["16", "Tripura"],
    ["17", "Meghalaya"],
    ["18", "Assam"],
    ["19", "West Bengal"],
    ["20", "Jharkhand"],
    ["21", "Odisha"],
    ["22", "Chhattisgarh"],
    ["23", "Madhya Pradesh"],
    ["24", "Gujarat"],
    ["26", "Dadra and Nagar Haveli and Daman and Diu"],
    ["27", "Maharashtra"],
    ["29", "Karnataka"],
    ["30", "Goa"],
    ["31", "Lakshadweep"],
    ["32", "Kerala"],
    ["33", "Tamil Nadu"],
    ["34", "Puducherry"],
    ["35", "Andaman and Nicobar Islands"],
    ["36", "Telangana"],
    ["37", "Andhra Pradesh"],
    ["38", "Ladakh"],
    ["97", "Other Territory"],
] as const;

export const stateName = (code: string) =>
    STATES.find(([c]) => c === code)?.[1] ?? "";

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The GSTIN's last character, from the other fourteen (the register's check). */
function checkChar(first14: string): string {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        const v = BASE36.indexOf(first14[i] ?? "") * (i % 2 ? 2 : 1);
        sum += Math.floor(v / 36) + (v % 36);
    }
    return BASE36[(36 - (sum % 36)) % 36] ?? "";
}

/** Why a typed GSTIN can't be right, or null (empty is fine: not registered). */
export function gstinProblem(value: string): string | null {
    const g = value.trim().toUpperCase();
    if (!g) return null;
    if (g.length !== 15)
        return `A GSTIN has 15 characters. This one has ${g.length}.`;
    if (!GSTIN_SHAPE.test(g))
        return "That isn't a GSTIN's shape: two digits, the ten of the PAN, then three more.";
    if (!stateName(g.slice(0, 2)))
        return `A GSTIN starts with a state code, and ${g.slice(0, 2)} isn't one.`;
    if (checkChar(g.slice(0, 14)) !== g[14])
        return "The last character doesn't match the rest. Check it for a typo.";
    return null;
}

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

/** "2026-10-26" → "26 Oct 2026"; "" when it isn't a date. */
export function showDate(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return "";
    return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`;
}

/** Today in the browser's time zone, as a date field holds it. */
export function today(now = new Date()): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "2026-10-26" + 14 → "2026-11-09". */
export function addDays(iso: string, days: number): string {
    const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
    return today(new Date(y, m - 1, d + days));
}

/** The paper's line under its title: "Northwind Bakes, Indiranagar, Bengaluru · GSTIN …". */
export function fromLine(p: {
    name: string;
    address: string;
    gstin: string;
}): string {
    const who = [p.name.trim() || "Your business", p.address.trim()]
        .filter(Boolean)
        .join(", ");
    return p.gstin.trim() ? `${who} · GSTIN ${p.gstin.trim()}` : who;
}

/** The customer, their GSTIN when given, and where the supply is. */
export function toLine(
    p: { customer: string; customerGstin: string; customerState: string },
    inter: boolean,
): string {
    return [
        p.customer.trim() || "your customer",
        p.customerGstin.trim() ? `GSTIN ${p.customerGstin.trim()}` : "",
        `${stateName(p.customerState)}${inter ? " (place of supply)" : ""}`,
    ]
        .filter(Boolean)
        .join(" · ");
}

/** Nothing typed yet: no business name and no line. */
export const untouched = (name: string, lines: readonly LineInput[]) =>
    !name.trim() && lines.every((l) => !l.item.trim() && !l.rate.trim());

/** Who the document is from and to: the GST makers' "You" and "Customer". */
export interface Parties {
    name: string;
    address: string;
    gstin: string;
    /** GST state code. */
    state: string;
    customer: string;
    customerGstin: string;
    customerState: string;
}

export const START_PARTIES: Parties = {
    name: "",
    address: "",
    gstin: "",
    state: "29",
    customer: "",
    customerGstin: "",
    customerState: "29",
};

/**
 * A typed date ("26 Oct 2026", "26 october 2026", "26/10/2026",
 * "2026-10-26") → yyyy-mm-dd; null when it isn't a real date. Text, not
 * a native date input: the owner's rule (scripts/check-date-inputs.mjs),
 * and the package can't use @saroh/ui's picker.
 */
export function readDate(value: string): string | null {
    const v = value.trim();
    let y: number, m: number, d: number;
    let x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
    if (x) [y, m, d] = [Number(x[1]), Number(x[2]), Number(x[3])];
    else if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v)))
        [d, m, y] = [Number(x[1]), Number(x[2]), Number(x[3])];
    else if ((x = /^(\d{1,2})\s+([a-z]{3,})\.?,?\s+(\d{4})$/i.exec(v))) {
        const name = (x[2] ?? "").slice(0, 3).toLowerCase();
        m = MONTHS.findIndex((n) => n.toLowerCase() === name) + 1;
        [d, y] = [Number(x[1]), Number(x[3])];
    } else return null;
    const iso = today(new Date(y, m - 1, d));
    const p = (n: number) => String(n).padStart(2, "0");
    return m >= 1 && iso === `${y}-${p(m)}-${p(d)}` ? iso : null;
}

/** The document's date: what they typed, else today. */
export const docDate = (typed: string) => readDate(typed) ?? today();
