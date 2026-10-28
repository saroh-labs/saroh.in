/**
 * The one day formatter in accounts (DEC-195's "one day formatter",
 * DEC-199): a day in India, where Saroh bills, never the browser's locale
 * or a time of day. "21 Nov", or "21 Nov 2026" with the year.
 */
export function day(at: string | Date, withYear = false): string {
    return new Date(at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        ...(withYear ? { year: "numeric" } : {}),
        timeZone: "Asia/Kolkata",
    });
}
