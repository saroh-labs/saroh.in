/**
 * How a business's invoice numbers are built — the app's mirror of the API's
 * `invoices/numbering.ts` (ADR-008), for the Tax card's editor and preview.
 * The API is the authority; this says the same thing first, in the form.
 *
 * A number is its parts in the business's order (prefix, financial year
 * "26-27" or short "26", year "2026", month "09"), joined by "/", "-" or
 * nothing at all, then a counter padded to 3–6 digits. The counter restarts every financial year, every
 * month or — for a business that is not GST-registered — never. The
 * financial year is April–March for everyone: GST law sets it.
 */

export const NUMBER_PARTS = [
    "PREFIX",
    "FY",
    "FY_SHORT",
    "YEAR",
    "MONTH",
] as const;
export type NumberPart = (typeof NUMBER_PARTS)[number];

/** "" runs the parts together: RC26090001. */
export const NUMBER_SEPARATORS = ["/", "-", ""] as const;
export type NumberSeparator = (typeof NUMBER_SEPARATORS)[number];

export const NUMBER_RESTARTS = ["FY", "MONTH", "NEVER"] as const;
export type NumberRestart = (typeof NUMBER_RESTARTS)[number];

export const MIN_COUNTER_DIGITS = 3;
export const MAX_COUNTER_DIGITS = 6;

/** GST's limit on an invoice or credit note number (rules 46 and 53). */
export const MAX_NUMBER_LENGTH = 16;

/**
 * The digits a counter is measured with past its own, as the API does: it
 * grows rather than wrap, and a number past 16 characters cannot be issued,
 * so a format keeps room for a period counting ten times past its digits.
 */
const COUNTER_HEADROOM = 1;

export interface NumberFormat {
    parts: NumberPart[];
    separator: NumberSeparator;
    digits: number;
    restart: NumberRestart;
}

export const PART_LABEL: Record<NumberPart, string> = {
    PREFIX: "Prefix",
    FY: "Financial year",
    FY_SHORT: "Financial year, short",
    YEAR: "Year",
    MONTH: "Month",
};

export const SEPARATOR_LABEL: Record<NumberSeparator, string> = {
    "/": "/",
    "-": "-",
    "": "None",
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

/**
 * The zone a business with none set is numbered in — the API's
 * `DEFAULT_TIMEZONE`.
 */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * The year and month a moment falls in, in the business's zone. No zone, or
 * one this browser does not know, reads India's, as the API does.
 */
function localParts(
    now: Date,
    zone: string | null | undefined,
): { year: number; month: number } {
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = new Intl.DateTimeFormat("en-US", {
            timeZone:
                zone === null || zone === undefined || zone === ""
                    ? DEFAULT_TIMEZONE
                    : zone,
            year: "numeric",
            month: "numeric",
        }).formatToParts(now);
    } catch {
        return localParts(now, DEFAULT_TIMEZONE);
    }
    const part = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value);
    return { year: part("year"), month: part("month") };
}

/**
 * India's financial year, April to March, in the business's time (India's
 * unless another is set): "26-27" runs from 1 April 2026 to 31 March 2027.
 */
export function financialYear(
    now: Date,
    zone: string | null = DEFAULT_TIMEZONE,
): string {
    const start = financialYearStart(now, zone);
    return `${twoDigits(start)}-${twoDigits(start + 1)}`;
}

/**
 * The financial year by the year it starts in, two digits: "26" for 26-27,
 * from 1 April 2026 to 31 March 2027.
 */
export function financialYearShort(
    now: Date,
    zone: string | null = DEFAULT_TIMEZONE,
): string {
    return twoDigits(financialYearStart(now, zone));
}

function financialYearStart(now: Date, zone: string | null): number {
    const { year, month } = localParts(now, zone);
    return month >= 4 ? year : year - 1;
}

const twoDigits = (y: number) => String(y % 100).padStart(2, "0");

/**
 * What one part prints, today in the business's zone: "RC", "26-27", "26",
 * "2026", "09".
 */
export function partValue(
    part: NumberPart,
    prefix: string | null,
    now: Date = new Date(),
    zone: string | null = DEFAULT_TIMEZONE,
): string {
    switch (part) {
        case "PREFIX":
            return printedPrefix(prefix);
        case "FY":
            return financialYear(now, zone);
        case "FY_SHORT":
            return financialYearShort(now, zone);
        case "YEAR":
            return String(localParts(now, zone).year);
        case "MONTH":
            return String(localParts(now, zone).month).padStart(2, "0");
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
 * where that fits in 16 characters with the counter's headroom
 * (RCCN/26-27/0001), else in its place (CN/26-27/09/0001), or first when the
 * number has no prefix.
 */
export type CreditMark = "after" | "instead" | "first";

export function creditMark(
    format: NumberFormat,
    prefix: string | null,
): CreditMark {
    if (!format.parts.includes("PREFIX")) return "first";
    const after = stem(format, prefix, true, new Date(), "after");
    return after.length + format.digits + COUNTER_HEADROOM <= MAX_NUMBER_LENGTH
        ? "after"
        : "instead";
}

function stem(
    format: NumberFormat,
    prefix: string | null,
    credit: boolean,
    now: Date,
    mark: CreditMark,
    zone: string | null = DEFAULT_TIMEZONE,
): string {
    const values = format.parts.map((part) => {
        if (part === "PREFIX" && credit) {
            return mark === "instead"
                ? CREDIT_MARK
                : `${printedPrefix(prefix)}${CREDIT_MARK}`;
        }
        return partValue(part, prefix, now, zone);
    });
    const parts =
        credit && mark === "first" ? [CREDIT_MARK, ...values] : values;
    return parts.map((p) => `${p}${format.separator}`).join("");
}

/**
 * A number in a format: invoice (or supplementary) or credit note, dated in
 * the business's zone (India's when none is given).
 */
export function formatNumber(
    format: NumberFormat,
    input: {
        prefix: string | null;
        counter: number;
        credit?: boolean;
        now?: Date;
        timezone?: string | null;
    },
): string {
    const mark = creditMark(format, input.prefix);
    const head = stem(
        format,
        input.prefix,
        input.credit ?? false,
        input.now ?? new Date(),
        mark,
        input.timezone ?? DEFAULT_TIMEZONE,
    );
    return `${head}${String(input.counter).padStart(format.digits, "0")}`;
}

/**
 * The longest number a format is allowed for, invoice or credit note: the
 * counter at its digits and one more — 99999 for a four-digit counter.
 */
export function longestNumber(
    format: NumberFormat,
    prefix: string | null,
): string {
    const counter = 10 ** (format.digits + COUNTER_HEADROOM) - 1;
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
 * restart needs the financial year in the number, long or short — January
 * to March share their calendar year with the next financial year — and a
 * monthly one the month and a year of either kind); the longest number, invoice or credit note,
 * with the counter a digit past its own, is at most 16 characters of A–Z,
 * 0–9, "-" and "/".
 */
export function numberFormatProblem(
    format: NumberFormat,
    business: { registered: boolean; prefix: string | null },
): { field: NumberFormatField; message: string } | null {
    const has = (part: NumberPart) => format.parts.includes(part);
    const fiscal = has("FY") || has("FY_SHORT");
    const yearly = fiscal || has("YEAR");
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
    if (format.restart === "MONTH" && !yearly) {
        return {
            field: "numberParts",
            message:
                "Add the financial year or the year too: the same month comes round every year, and a number must never repeat.",
        };
    }
    if (format.restart === "FY" && !fiscal) {
        return {
            field: "numberParts",
            message: has("YEAR")
                ? "Numbers that start again every financial year need the financial year in them. The year alone would repeat: January to March share it with the next financial year."
                : "Numbers that start again every financial year need the financial year in them, or they would repeat.",
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
            message: `Once the count passes ${"9".repeat(format.digits)}, numbers like ${longest} are ${longest.length} characters. GST allows ${MAX_NUMBER_LENGTH}: use fewer digits or parts.`,
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
        /** The business's zone, which dates the number; India's if none. */
        timezone?: string | null;
    },
): string {
    const last = input.samePrefix ? (input.last?.[format.restart] ?? 0) : 0;
    return formatNumber(format, {
        prefix: input.prefix,
        counter: last + 1,
        now: input.now,
        timezone: input.timezone,
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

/**
 * The list as one string a form field holds:
 * "PREFIX,FY,!FY_SHORT,!YEAR,!MONTH".
 */
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

const isSeparator = (v: string): v is NumberSeparator =>
    (NUMBER_SEPARATORS as readonly string[]).includes(v);

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
        // "" is a choice — no separator — not an empty field.
        separator: isSeparator(values.numberSeparator)
            ? values.numberSeparator
            : "/",
        digits: Number(values.numberDigits) || 4,
        restart: (NUMBER_RESTARTS as readonly string[]).includes(
            values.numberRestart,
        )
            ? (values.numberRestart as NumberRestart)
            : "FY",
    };
}

/**
 * The form fields whose change re-checks the number format: the format's
 * own, the prefix and the registration — what can make a number wrong.
 */
export const NUMBER_RECHECK_FIELDS = [
    "numberParts",
    "numberSeparator",
    "numberDigits",
    "numberRestart",
    "invoicePrefix",
    "gstRegistered",
] as const;

/**
 * Why a save would be refused for its number format, or null. As the API
 * does (DEC-028), the stored format is re-checked only when the save
 * changes the format, the prefix or the registration: one saved under
 * older, looser rules keeps numbering and never blocks a GSTIN, address or
 * name save. `dirty` is the form's `dirtyFields`.
 */
export function numberFormatProblemOnSave(
    values: {
        numberParts: string;
        numberSeparator: string;
        numberDigits: string;
        numberRestart: string;
        invoicePrefix: string;
        gstRegistered: boolean;
    },
    dirty: Readonly<Partial<Record<string, unknown>>>,
): ReturnType<typeof numberFormatProblem> {
    if (!NUMBER_RECHECK_FIELDS.some((key) => dirty[key])) return null;
    return numberFormatProblem(formatOf(values), {
        registered: values.gstRegistered,
        prefix: prefixOf(values.invoicePrefix),
    });
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
