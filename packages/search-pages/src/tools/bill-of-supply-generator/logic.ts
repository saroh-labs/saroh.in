import type { LineInput, Parties } from "../_documents/logic";
import {
    amountInWords,
    docDate,
    emptyLine,
    fromLine,
    lineLabel,
    money,
    readLines,
    showDate,
    START_PARTIES,
    toLine,
} from "../_documents/logic";
import type { PaperProps } from "../_documents/parts";

/**
 * The bill of supply generator's bill (boards BillOfSupply*.dc.html): the
 * lines added up, no GST, the amount in words and the line the rules ask
 * for: the composition declaration, or that the supply is exempt. With no
 * GSTIN it is a plain bill, and says why.
 */

export const WHY = [
    { value: "composition", label: "Composition scheme" },
    { value: "exempt", label: "Exempt goods or services" },
] as const;

export type Why = (typeof WHY)[number]["value"];

export interface BillForm extends Parties {
    why: Why;
    number: string;
    date: string;
    lines: LineInput[];
}

export const START: BillForm = {
    ...START_PARTIES,
    why: "composition",
    number: "",
    date: "",
    lines: [emptyLine("0")],
};

export const NUMBER_PLACEHOLDER = "BOS-0001";

export const DECLARATION: Record<Why, string> = {
    composition:
        "Composition taxable person, not eligible to collect tax on supplies.",
    exempt: "Supply exempt from GST.",
};

export function billOfSupply(f: BillForm): {
    paper: PaperProps;
    words: string;
    /** The declaration on the bill; none on a plain bill. */
    declaration: string | null;
} {
    const registered = f.gstin.trim() !== "";
    const lines = readLines(f.lines);
    const total = lines.reduce((s, l) => s + l.amount, 0);
    return {
        words: amountInWords(total),
        declaration: registered ? DECLARATION[f.why] : null,
        paper: {
            title: registered ? "Bill of supply" : "Bill",
            sub: fromLine(f),
            num: f.number.trim() || NUMBER_PLACEHOLDER,
            billed: `Billed to ${toLine(f, false)} · ${showDate(docDate(f.date))}`,
            items: lines.map((l) => ({ k: lineLabel(l), v: money(l.amount) })),
            sums: [],
            total: { k: "Total", v: money(total) },
        },
    };
}

export const WORDS = {
    form: "Your bill details",
    aside: "Your bill",
    gstinHint:
        "Leave it empty if you aren't registered: it's then a plain bill.",
    whySet: "Why there's no GST",
    why: "This bill is for",
    whyHint:
        "Composition: the bill carries the line the rules ask for. Exempt: it says the supply is exempt.",
    set: "Bill",
    number: "Bill number",
    numberHint: "Up to 16 characters, one series each financial year.",
    date: "Date",
    lines: "Lines",
    find: "Find an HSN or SAC code",
    empty: "Your bill shows here as you type.",
    noGst: "No GST on this bill. Charging GST?",
    useInvoice: "Use the GST invoice generator",
    plain: "A bill of supply is for GST-registered sellers. Without a GSTIN this is a plain bill with no tax on it.",
} as const;
