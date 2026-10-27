import type { LineInput, Parties } from "../_documents/logic";
import {
    addDays,
    docDate,
    emptyLine,
    fromLine,
    gstTotals,
    lineLabel,
    money,
    readDate,
    readLines,
    showDate,
    START_PARTIES,
    toLine,
} from "../_documents/logic";
import type { PaperProps } from "../_documents/parts";

/**
 * The quotation maker's quote (boards Quotation*.dc.html): lines with GST
 * worked out as on a tax invoice (CGST + SGST in the seller's state, IGST
 * in another, none without a GSTIN), a date it's valid until (two weeks
 * after the quote's date unless they pick one) and the terms.
 */

export interface QuoteForm extends Parties {
    number: string;
    /** As typed; empty is today. */
    date: string;
    /** As typed; empty is two weeks after the date. */
    validUntil: string;
    terms: string;
    lines: LineInput[];
}

export const START: QuoteForm = {
    ...START_PARTIES,
    number: "",
    date: "",
    validUntil: "",
    terms: "",
    lines: [emptyLine("18")],
};

export const NUMBER_PLACEHOLDER = "QT-0001";

/** The quote's date and the valid-until it gets when none is picked. */
export function dates(f: QuoteForm): {
    date: string;
    /** Null when what's typed isn't a date. */
    until: string | null;
    usual: string;
} {
    const date = docDate(f.date);
    const usual = addDays(date, 14);
    return {
        date,
        usual,
        until: f.validUntil.trim() ? readDate(f.validUntil) : usual,
    };
}

/** Why the valid-until can't be used, or null. Dates as yyyy-mm-dd compare as text. */
export function untilProblem(f: QuoteForm): string | null {
    const { date, until } = dates(f);
    if (until === null) return null; // DocDate says it isn't a date
    return until <= date
        ? `That's not after the quote date. Pick a day after ${showDate(date)}.`
        : null;
}

export function quote(
    f: QuoteForm,
    /** The valid-until to show while the typed one can't be used. */
    held: string | null = null,
): { paper: PaperProps; registered: boolean; inter: boolean; until: string } {
    const registered = f.gstin.trim() !== "";
    const inter = f.customerState !== f.state;
    const { date, until: typed, usual } = dates(f);
    const until = typed && !untilProblem(f) ? typed : (held ?? usual);
    const lines = readLines(f.lines);
    const t = gstTotals(lines, inter, registered);
    return {
        registered,
        inter,
        until,
        paper: {
            title: "Quotation",
            sub: fromLine(f),
            num: `${f.number.trim() || NUMBER_PLACEHOLDER} · ${showDate(date)}`,
            billed: `For ${toLine(f, inter)} · Valid until ${showDate(until)}`,
            items: lines.map((l) => ({ k: lineLabel(l), v: money(l.amount) })),
            sums: registered ? t.rows : [],
            total: { k: "Total", v: money(t.total) },
        },
    };
}

/** A wa.me link with the quote in a message; they pick the chat and attach the PDF. */
export function shareLink(f: QuoteForm, total: string, until: string): string {
    const text = `Quotation ${f.number.trim() || NUMBER_PLACEHOLDER} from ${f.name.trim() || "us"}: ${total}, valid until ${showDate(until)}. The PDF is attached.`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export const WORDS = {
    form: "Your quote details",
    aside: "Your quote",
    gstinHint:
        "Leave it empty if you aren't registered: the quote then shows no GST.",
    set: "Quote",
    number: "Quote number",
    date: "Date",
    validUntil: "Valid until",
    validHint: "Two weeks is common. After this date your prices can change.",
    held: (iso: string) => `Still showing valid until ${showDate(iso)}.`,
    lines: "Lines",
    codes: "Check each item's HSN or SAC code and its rate before you send it.",
    find: "Find an HSN or SAC code",
    terms: "Terms",
    termsLabel: "Payment and delivery (optional)",
    termsPlaceholder:
        "50% to book the date, the rest on delivery. Photos in 5 working days.",
    empty: "Your quote shows here as you type.",
    sameState:
        "Same state: CGST and SGST. Another state: IGST. The preview changes as you type.",
    otherState: "Another state: IGST at the full rate.",
    unregistered:
        "A business that isn't registered can't charge GST, so the quote has none.",
    notABill:
        "A quote isn't a bill. When they say yes, make the tax invoice for the work.",
    invoiceTool: "GST invoice generator",
    share: "Send on WhatsApp",
} as const;
