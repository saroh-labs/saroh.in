import { formatDay } from "@/lib/format/datetime";

/**
 * A list's date filter in the address, the one Orders started (B4) and
 * Invoices, All bookings and the stock log share: `?date=` is a preset the
 * API works out in the business's zone (`today`, `yesterday`, `7d`,
 * `month`), or `custom` with `?from=` and `?to=` (YYYY-MM-DD, both days
 * included, either may be left out). Pure: each list's query reads and
 * writes its address through it, and `DateRangeFilter` draws it.
 */

/** The API's presets (`DATE_PRESETS`). */
export type DatePreset = "today" | "yesterday" | "7d" | "month";

/** The date menu: a preset, or a custom range of days. */
export type DatePick = DatePreset | "custom";

export interface DateRange {
    date: DatePick | null;
    /** A custom range's days, YYYY-MM-DD in the business's zone. */
    from: string | null;
    to: string | null;
}

export const NO_DATE_RANGE: DateRange = { date: null, from: null, to: null };

export const DATE_OPTIONS: readonly { value: DatePick; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "7d", label: "Last 7 days" },
    { value: "month", label: "This month" },
    { value: "custom", label: "Custom range…" },
];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | undefined {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim() ? value.trim() : undefined;
}

/** A real calendar day, or null: "2026-02-30" is not one. */
export function dayOrNull(value: string | undefined): string | null {
    if (!value || !DAY_RE.test(value)) return null;
    const at = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(at.getTime()) &&
        at.toISOString().slice(0, 10) === value
        ? value
        : null;
}

/**
 * The range the address asks for. Anything malformed is no filter (a
 * hand-edited link shows more, never an error page), and the days count
 * only under `custom`.
 */
export function readDateRange(params: Params): DateRange {
    const date = one(params, "date")?.toLowerCase();
    const custom = date === "custom";
    return {
        date: DATE_OPTIONS.find((d) => d.value === date)?.value ?? null,
        from: custom ? dayOrNull(one(params, "from")) : null,
        to: custom ? dayOrNull(one(params, "to")) : null,
    };
}

/** The range into an address, replacing what was there; off leaves none. */
export function writeDateRange(range: DateRange, q: URLSearchParams): void {
    for (const key of ["date", "from", "to"]) q.delete(key);
    if (range.date) q.set("date", range.date);
    if (range.date === "custom") {
        if (range.from) q.set("from", range.from);
        if (range.to) q.set("to", range.to);
    }
}

/**
 * Whether the range narrows the list: a preset, or a custom range with a
 * day chosen (a custom date with none yet narrows nothing).
 */
export function dateRangeOn(range: DateRange): boolean {
    return (
        range.date !== null &&
        (range.date !== "custom" || !!range.from || !!range.to)
    );
}

/** What the API is asked: a preset, or the days, put the right way round. */
export function dateRangeAsk(range: DateRange): {
    date?: DatePreset;
    from?: string;
    to?: string;
} {
    const preset = range.date && range.date !== "custom" ? range.date : null;
    let from = range.date === "custom" ? range.from : null;
    let to = range.date === "custom" ? range.to : null;
    // A range typed backwards is still the range someone meant.
    if (from && to && from > to) [from, to] = [to, from];
    return {
        date: preset ?? undefined,
        from: from ?? undefined,
        to: to ?? undefined,
    };
}

const PRESET_WORDS: Record<DatePreset, string> = {
    today: "today",
    yesterday: "yesterday",
    "7d": "in the last 7 days",
    month: "this month",
};

/**
 * The range as the end of a sentence ("No orders in the last 7 days",
 * "… between 1 Aug and 3 Sep"); null when it narrows nothing.
 */
export function dateRangeWords(range: DateRange): string | null {
    if (!dateRangeOn(range)) return null;
    if (range.date && range.date !== "custom") return PRESET_WORDS[range.date];
    const { from, to } = dateRangeAsk(range);
    const day = (d: string) => formatDay(d, { year: "never" });
    if (from && to) {
        return from === to
            ? `on ${day(from)}`
            : `between ${day(from)} and ${day(to)}`;
    }
    return from ? `since ${day(from)}` : `up to ${day(to ?? "")}`;
}
