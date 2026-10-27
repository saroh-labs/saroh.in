import type { LineInput, Parties } from "../_documents/logic";
import {
    docDate,
    emptyLine,
    fromLine,
    gstTotals,
    lineLabel,
    money,
    readLines,
    showDate,
    START_PARTIES,
    toLine,
} from "../_documents/logic";
import type { PaperProps } from "../_documents/parts";

/**
 * The GST invoice generator's invoice (boards GstInvoice*.dc.html): a tax
 * invoice when the seller gives a GSTIN, CGST + SGST when the customer is
 * in the seller's state and IGST when not (the customer's state is the
 * place of supply); with no GSTIN, a plain bill with no GST.
 */

export interface InvoiceForm extends Parties {
    number: string;
    /** yyyy-mm-dd; empty is today. */
    date: string;
    lines: LineInput[];
}

export const START: InvoiceForm = {
    ...START_PARTIES,
    number: "",
    date: "",
    lines: [emptyLine("18")],
};

export const NUMBER_PLACEHOLDER = "INV-0001";

export function invoice(f: InvoiceForm): {
    paper: PaperProps;
    registered: boolean;
    inter: boolean;
} {
    const registered = f.gstin.trim() !== "";
    const inter = f.customerState !== f.state;
    const lines = readLines(f.lines);
    const t = gstTotals(lines, inter, registered);
    return {
        registered,
        inter,
        paper: {
            title: registered ? "Tax invoice" : "Bill",
            sub: fromLine(f),
            num: f.number.trim() || NUMBER_PLACEHOLDER,
            billed: `Billed to ${toLine(f, inter)} · ${showDate(docDate(f.date))}`,
            items: lines.map((l) => ({ k: lineLabel(l), v: money(l.amount) })),
            sums: t.rows,
            total: { k: "Total", v: money(t.total) },
        },
    };
}

export const WORDS = {
    form: "Your invoice details",
    aside: "Your invoice",
    gstinHint:
        "Leave it empty if you aren't registered: the bill then shows no GST.",
    set: "Invoice",
    number: "Invoice number",
    numberHint: "One series each financial year, up to 16 characters.",
    date: "Date",
    lines: "Lines",
    find: "Find an HSN or SAC code",
    empty: "Your invoice shows here as you type.",
    sameState:
        "Same state: CGST and SGST. Another state: IGST. The preview changes as you type.",
    otherState: "Another state: IGST at the full rate.",
    unregistered:
        "A business that isn't registered can't charge GST, so this is a plain bill with no tax.",
} as const;
