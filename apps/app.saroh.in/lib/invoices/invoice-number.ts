/**
 * How a business's invoice numbers are built — the app's mirror of the API's
 * `invoices/numbering.ts` (ADR-008), for the Tax card's editor and preview.
 * The API is the authority; this says the same thing first, in the form.
 *
 * A number is its parts in the business's order (prefix, financial year
 * "26-27", year "2026", month "09"), joined by "/" or "-", then a counter
 * padded to 3–6 digits. The counter restarts every financial year, every
 * month or — for a business that is not GST-registered — never. The
 * financial year is April–March for everyone: GST law sets it.
 */

export const NUMBER_PARTS = ["PREFIX", "FY", "YEAR", "MONTH"] as const;
export type NumberPart = (typeof NUMBER_PARTS)[number];

export const NUMBER_SEPARATORS = ["/", "-"] as const;
export type NumberSeparator = (typeof NUMBER_SEPARATORS)[number];

export const NUMBER_RESTARTS = ["FY", "MONTH", "NEVER"] as const;
export type NumberRestart = (typeof NUMBER_RESTARTS)[number];

export const MIN_COUNTER_DIGITS = 3;
export const MAX_COUNTER_DIGITS = 6;

/** GST's limit on an invoice or credit note number (rules 46 and 53). */
export const MAX_NUMBER_LENGTH = 16;

export interface NumberFormat {
    parts: NumberPart[];
    separator: NumberSeparator;
    digits: number;
    restart: NumberRestart;
}

export const PART_LABEL: Record<NumberPart, string> = {
    PREFIX: "Prefix",
    FY: "Financial year",
    YEAR: "Year",
    MONTH: "Month",
};

export const RESTART_LABEL: Record<NumberRestart, string> = {
    FY: "Every financial year",
    MONTH: "Every month",
    NEVER: "Never — one running count",
};

/**
 * The format of a business that never chose one — the numbers it has always
 * had: registered, RC/26-27/0001 restarting each financial year; not,
 * RC-0001 on one running count.
 */
export function defaultNumberFormat(registered: boolean): NumberFormat {
    return registered
        ? { parts: ["PREFIX", "FY"], separator: "/", digits: 4, restart: "FY" }
        : { parts: ["PREFIX"], separator: "-", digits: 4, restart: "NEVER" };
}

/** India's date parts: IST is UTC+5:30 all year, a fixed offset away. */
function inIndia(now: Date): { year: number; month: number } {
    const ist = new Date(now.getTime() + 330 * 60_000);
    return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1 };
}

/**
 * India's financial year, April to March, in India's time: "26-27" runs from
 * 1 April 2026 to 31 March 2027.
 */
export function financialYear(now: Date): string {
    const { year, month } = inIndia(now);
    const start = month >= 4 ? year : year - 1;
    const two = (y: number) => String(y % 100).padStart(2, "0");
    return `${two(start)}-${two(start + 1)}`;
}

/** What one part prints, today: "RC", "26-27", "2026", "09". */
export function partValue(
    part: NumberPart,
    prefix: string | null,
    now: Date = new Date(),
): string {
    switch (part) {
        case "PREFIX":
            return printedPrefix(prefix);
        case "FY":
            return financialYear(now);
        case "YEAR":
            return String(inIndia(now).year);
        case "MONTH":
            return String(inIndia(now).month).padStart(2, "0");
    }
}

/** The prefix as typed, or null for none (the legacy INV series). */
export function prefixOf(typed: string): string | null {
    const p = typed.trim().toUpperCase();
    return p === "" ? null : p;
}

const printedPrefix = (prefix: string | null) => prefix ?? "INV";

const CREDIT_MARK = "CN";

/**
 * Where a credit note's "CN" goes, as the API decides it: after the prefix
 * where that fits in 16 characters (RCCN/26-27/0001), else in its place
 * (CN/26-27/09/0001), or first when the number has no prefix.
 */
export type CreditMark = "after" | "instead" | "first";

export function creditMark(
    format: NumberFormat,
    prefix: string | null,
): CreditMark {
    if (!format.parts.includes("PREFIX")) return "first";
    const after = stem(format, prefix, true, new Date(), "after");
    return after.length + format.digits <= MAX_NUMBER_LENGTH
        ? "after"
        : "instead";
}

function stem(
    format: NumberFormat,
    prefix: string | null,
    credit: boolean,
    now: Date,
    mark: CreditMark,
): string {
    const values = format.parts.map((part) => {
        if (part === "PREFIX" && credit) {
            return mark === "instead"
                ? CREDIT_MARK
                : `${printedPrefix(prefix)}${CREDIT_MARK}`;
        }
        return partValue(part, prefix, now);
    });
    const parts =
        credit && mark === "first" ? [CREDIT_MARK, ...values] : values;
    return parts.map((p) => `${p}${format.separator}`).join("");
}

/** A number in a format: invoice (or supplementary) or credit note. */
export function formatNumber(
    format: NumberFormat,
    input: {
        prefix: string | null;
        counter: number;
        credit?: boolean;
        now?: Date;
    },
): string {
    const mark = creditMark(format, input.prefix);
    return `${stem(format, input.prefix, input.credit ?? false, input.now ?? new Date(), mark)}${String(input.counter).padStart(format.digits, "0")}`;
}

/** The longest number a format prints, invoice or credit note. */
export function longestNumber(
    format: NumberFormat,
    prefix: string | null,
): string {
    const counter = 10 ** format.digits - 1;
    const invoice = formatNumber(format, { prefix, counter });
    const credit = formatNumber(format, { prefix, counter, credit: true });
    return credit.length > invoice.length ? credit : invoice;
}

/** The form fields a problem is about. */
export type NumberFormatField =
    "numberParts" | "numberRestart" | "numberDigits" | "invoicePrefix";

/**
 * Why a format is refused, or null — the API's rules and words: a
 * registered business restarts; numbers never repeat across years (a yearly
 * restart needs the financial year or the year in the number, a monthly one
 * the month and one of them); the longest number, invoice or credit note,
 * is at most 16 characters of A–Z, 0–9, "-" and "/".
 */
export function numberFormatProblem(
    format: NumberFormat,
    business: { registered: boolean; prefix: string | null },
): { field: NumberFormatField; message: string } | null {
    const has = (part: NumberPart) => format.parts.includes(part);
    const yearly = has("FY") || has("YEAR");
    if (format.restart === "NEVER" && business.registered) {
        return {
            field: "numberRestart",
            message:
                "A GST-registered business starts its numbers again every financial year or every month.",
        };
    }
    if (format.restart === "MONTH" && !has("MONTH")) {
        return {
            field: "numberParts",
            message:
                "Numbers that start again every month need the month in them, or they would repeat.",
        };
    }
    if (format.restart !== "NEVER" && !yearly) {
        return {
            field: "numberParts",
            message:
                format.restart === "MONTH"
                    ? "Add the financial year or the year too: the same month comes round every year, and a number must never repeat."
                    : "Numbers that start again every financial year need the financial year or the year in them, or they would repeat.",
        };
    }
    const longest = longestNumber(format, business.prefix);
    if (!/^[A-Z0-9/-]+$/.test(longest)) {
        return {
            field: "numberParts",
            message:
                "An invoice number can use only capital letters, digits, - and /.",
        };
    }
    if (longest.length > MAX_NUMBER_LENGTH) {
        return {
            field: "numberDigits",
            message: `The longest number this makes, like ${longest}, is ${longest.length} characters. GST allows ${MAX_NUMBER_LENGTH}: use fewer digits or parts.`,
        };
    }
    if (
        creditMark(format, business.prefix) === "instead" &&
        business.prefix === CREDIT_MARK
    ) {
        return {
            field: "invoicePrefix",
            message:
                "In this format CN marks credit notes, so it can't be the prefix too. Choose another.",
        };
    }
    return null;
}

/**
 * The next invoice's number: the count continues in the series the format
 * restarts in — this financial year's, this month's or the running one —
 * from where the business's counters stand (`last`, from the API). A new
 * prefix starts its own count.
 */
export function nextInvoiceNumber(
    format: NumberFormat,
    input: {
        prefix: string | null;
        /** Where the saved prefix's series stand now; absent, nothing yet. */
        last?: Partial<Record<NumberRestart, number>>;
        samePrefix: boolean;
        now?: Date;
    },
): string {
    const last = input.samePrefix ? (input.last?.[format.restart] ?? 0) : 0;
    return formatNumber(format, {
        prefix: input.prefix,
        counter: last + 1,
        now: input.now,
    });
}

// ── The parts list, as one form value ───────────────────────────────────────

/** Each part, in the order shown, and whether the number carries it. */
export interface PartRow {
    part: NumberPart;
    on: boolean;
}

/**
 * The editor's list: the format's parts in its order, then the ones it
 * leaves out, in the usual order.
 */
export function partRows(format: NumberFormat): PartRow[] {
    return [
        ...format.parts.map((part) => ({ part, on: true })),
        ...NUMBER_PARTS.filter((p) => !format.parts.includes(p)).map(
            (part) => ({ part, on: false }),
        ),
    ];
}

/** The list as one string a form field holds: "PREFIX,FY,!YEAR,!MONTH". */
export function encodeParts(rows: PartRow[]): string {
    return rows.map((r) => (r.on ? r.part : `!${r.part}`)).join(",");
}

/** Back to rows; a part missing or repeated is put right, off, at the end. */
export function decodeParts(value: string): PartRow[] {
    const rows: PartRow[] = [];
    for (const token of value.split(",")) {
        const part = token.replace(/^!/, "");
        if (isPart(part) && !rows.some((r) => r.part === part)) {
            rows.push({ part, on: !token.startsWith("!") });
        }
    }
    for (const part of NUMBER_PARTS) {
        if (!rows.some((r) => r.part === part)) rows.push({ part, on: false });
    }
    return rows;
}

const isPart = (v: string): v is NumberPart =>
    (NUMBER_PARTS as readonly string[]).includes(v);

/** Move one row up (-1) or down (+1); the list is unchanged at an end. */
export function moveRow(rows: PartRow[], index: number, by: -1 | 1): PartRow[] {
    const to = index + by;
    if (to < 0 || to >= rows.length) return rows;
    const next = [...rows];
    next.splice(to, 0, ...next.splice(index, 1));
    return next;
}

/** The format the editor's four fields describe. */
export function formatOf(values: {
    numberParts: string;
    numberSeparator: string;
    numberDigits: string;
    numberRestart: string;
}): NumberFormat {
    return {
        parts: decodeParts(values.numberParts)
            .filter((r) => r.on)
            .map((r) => r.part),
        separator: values.numberSeparator === "-" ? "-" : "/",
        digits: Number(values.numberDigits) || 4,
        restart: (NUMBER_RESTARTS as readonly string[]).includes(
            values.numberRestart,
        )
            ? (values.numberRestart as NumberRestart)
            : "FY",
    };
}

/** The editor's four fields for a format. */
export function formatFields(format: NumberFormat) {
    return {
        numberParts: encodeParts(partRows(format)),
        numberSeparator: format.separator,
        numberDigits: String(format.digits),
        numberRestart: format.restart,
    };
}
