/** Dates as yyyy-mm-dd, which is what the date picker gives and takes. */
const toUtc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
};

const DAY_MS = 86_400_000;

export const isDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso);

export function todayIso(now = new Date()): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const addDays = (iso: string, days: number) =>
    new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `from` to `to`; negative when `to` comes first. */
export const daysBetween = (from: string, to: string) =>
    Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

/**
 * An end date when its start moves: it stays until the start passes it, then
 * keeps the gap in days it had.
 */
export function endAfterMove(before: string, after: string, end: string) {
    if (!isDate(after) || !isDate(end) || after <= end) return end;
    const gap = isDate(before) ? Math.max(daysBetween(before, end), 0) : 0;
    return addDays(after, gap);
}

const LONG = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
});

const SHORT = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
});

export const formatDate = (iso: string) =>
    isDate(iso) ? LONG.format(toUtc(iso)) : "";

export const formatDayMonth = (iso: string) =>
    isDate(iso) ? SHORT.format(toUtc(iso)) : "";
