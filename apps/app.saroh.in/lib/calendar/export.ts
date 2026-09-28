import type { LayerKey, MoneyEntry, MoneyKind } from "./types";

/**
 * "Export the month" (plan 005 E23, R13; default 118): the month's money as a
 * CSV, built in the app from the same entries the strip and the cells add up,
 * so the file and the screen agree. The API sends the entries only to a
 * caller holding `payment:read` (E19), so nobody else can make one.
 *
 * One row per amount that came in, went out or is still due, with the
 * design's columns: Date, Kind, What, Who / detail, In, Out, Due. A failed
 * renewal charge is neither — the strip leaves it out, and so does the file.
 * Amounts are plain decimals in major units, so a sheet can sum them; a
 * business trading in two currencies gets a Currency column as well.
 */

/** What each amount was, as the What column opens with it. */
const KIND_WORD: Record<MoneyKind, string> = {
    order_paid: "Paid",
    invoice_paid: "Paid",
    refund: "Refund",
    fee: "Payment fee",
    invoice_due: "Due",
    renewal_due: "Renewal due",
    booking_due: "Due at the visit",
    renewal_failed: "Renewal failed",
};

/**
 * One CSV field, quoted when it has to be. Text that a spreadsheet would
 * read as a formula (a name typed as "=…") is led by an apostrophe.
 */
function cell(value: string): string {
    const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Minor units as "1250.50"; empty for nothing. */
function amount(minor: number): string {
    return minor ? (minor / 100).toFixed(2) : "";
}

/** A bare order number reads as one: "1017" → "#1017". */
function titleOf(entry: MoneyEntry): string {
    return entry.layer === "orders" && /^\d+$/.test(entry.title)
        ? `#${entry.title}`
        : entry.title;
}

/**
 * The month's money as CSV text, and how many rows it holds (for the
 * toast). `labelOf` names a kind as the calendar's switches do.
 */
export function monthCsv(
    entries: MoneyEntry[],
    labelOf: (layer: LayerKey) => string,
): { csv: string; lines: number } {
    const rows = entries.filter((e) => e.in || e.out || e.due);
    const currencies = new Set(rows.map((e) => e.currency));
    const mixed = currencies.size > 1;
    const head = [
        "Date",
        "Kind",
        "What",
        "Who / detail",
        "In",
        "Out",
        "Due",
        ...(mixed ? ["Currency"] : []),
    ];
    const lines = rows.map((e) =>
        [
            e.date,
            labelOf(e.layer),
            `${KIND_WORD[e.kind]} · ${titleOf(e)}`,
            e.subtitle ?? "",
            amount(e.in),
            amount(e.out),
            amount(e.due),
            ...(mixed ? [e.currency] : []),
        ]
            .map(cell)
            .join(","),
    );
    return { csv: [head.join(","), ...lines].join("\n"), lines: rows.length };
}

/** "money-2026-09.csv". */
export function monthCsvName(month: string): string {
    return `money-${month}.csv`;
}
