/**
 * How the API writes an amount, a day and a time into a sentence a person
 * reads: a notification, an email, a refusal, a line on Home.
 *
 * One form each, the same as the merchant app's `lib/format` (UX audit,
 * 10 Oct 2026):
 *
 * - money: the currency's own sign, Indian grouping, and paise only when
 *   there are some. "₹1,250", "₹1,250.50", "₹20,44,971".
 * - a day: "12 Oct", or "12 Oct 2025" with the year, "Mon 12 Oct" with the
 *   weekday. Three letters every month.
 * - a time: the 12-hour clock, "9:30 am", "12:00 pm".
 *
 * Every caller passes its own time zone, so a message is read in the zone
 * it was always written in. Nothing here guesses one. A printed invoice's
 * own columns (`paperMoney`, `paperDay`) are a document, not a sentence,
 * and stay with the paper.
 *
 * Pure: no Prisma, no Nest, no clock.
 */
import { toMoneyString } from "./money";

const MONEY_LOCALE = "en-IN";

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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The sign a currency is written with ("₹" for INR), else its code. */
function moneySign(currency: string): string {
    try {
        return (
            new Intl.NumberFormat(MONEY_LOCALE, {
                style: "currency",
                currency,
                currencyDisplay: "narrowSymbol",
            })
                .formatToParts(0)
                .find((p) => p.type === "currency")?.value ?? `${currency} `
        );
    } catch {
        return `${currency} `;
    }
}

/**
 * "₹1,250" or "₹1,250.50", from the decimal string ("1250.50") or a Prisma
 * Decimal: grouped by digits, so no float ever touches the amount.
 */
export function moneyWords(
    amount: { toString(): string },
    currency: string,
): string {
    const fixed = toMoneyString(amount);
    const negative = fixed.startsWith("-");
    const [whole = "0", frac = "00"] = fixed.replace("-", "").split(".");
    const grouped = new Intl.NumberFormat(MONEY_LOCALE).format(BigInt(whole));
    const paise = frac === "00" ? "" : `.${frac}`;
    return `${negative ? "-" : ""}${moneySign(currency)}${grouped}${paise}`;
}

/** The same, from minor units: 125050 paise is "₹1,250.50". */
export function moneyWordsMinor(minor: number, currency: string): string {
    const sign = minor < 0 ? "-" : "";
    const abs = Math.abs(Math.trunc(minor));
    const major = `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
    return moneyWords(major, currency);
}

interface ZoneParts {
    year: number;
    month: number;
    day: number;
    weekday: number;
    hour: number;
    minute: number;
}

/** An instant's calendar and clock in a zone. Throws on an unknown zone. */
function zoneParts(at: Date, timeZone: string): ZoneParts {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(at);
    const value = (type: string) =>
        parts.find((p) => p.type === type)?.value ?? "";
    return {
        year: Number(value("year")),
        month: Number(value("month")),
        day: Number(value("day")),
        weekday: Math.max(0, WEEKDAYS.indexOf(value("weekday"))),
        hour: Number(value("hour")) % 24,
        minute: Number(value("minute")),
    };
}

/** Whether this runtime knows the zone ("Asia/Kolkata"). */
export function isTimeZone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat("en-GB", { timeZone });
        return true;
    } catch {
        return false;
    }
}

export interface DayOptions {
    /** Say the year: "12 Oct 2025". Off by default: "12 Oct". */
    year?: boolean;
    /** Lead with the weekday: "Mon 12 Oct". */
    weekday?: boolean;
}

/** A day in a zone: "12 Oct", "12 Oct 2025", "Mon 12 Oct". */
export function dayWords(
    at: Date,
    timeZone: string,
    options: DayOptions = {},
): string {
    const p = zoneParts(at, timeZone);
    const weekday = options.weekday ? `${WEEKDAYS[p.weekday]} ` : "";
    const year = options.year ? ` ${p.year}` : "";
    return `${weekday}${p.day} ${MONTHS[p.month - 1] ?? ""}${year}`;
}

function clock(hour: number, minute: number): string {
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour % 24 < 12 ? "am" : "pm"}`;
}

/** A time in a zone, on the 12-hour clock: "9:30 am", "12:00 pm". */
export function timeWords(at: Date, timeZone: string): string {
    const p = zoneParts(at, timeZone);
    return clock(p.hour, p.minute);
}

/**
 * The same for a wall-clock value with no date or zone in it, an opening
 * hour kept as "09:30": "9:30 am". Anything else is returned as it came.
 */
export function clockWords(value: string): string {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return value;
    return clock(Number(m[1]) % 24, Number(m[2]));
}

/** A day and its time: "12 Oct, 9:30 am". Takes what `dayWords` does. */
export function whenWords(
    at: Date,
    timeZone: string,
    options: DayOptions = {},
): string {
    return `${dayWords(at, timeZone, options)}, ${timeWords(at, timeZone)}`;
}
