/**
 * Dates that render identically on the server and in the browser.
 *
 * `toLocaleString()` reads the runtime's locale and time zone, and the server's
 * are not the viewer's — Node produced "9/2/2026, 3:59:54 AM" while the browser
 * produced "02/09/2026, 03:59:54" for the same instant, which React reported as
 * a hydration mismatch. React's own list of causes names this exactly: "date
 * formatting in a user's locale which doesn't match the server".
 *
 * So both are pinned: a fixed locale, and the business's zone (UX-008), which
 * server and browser both know (`useBusinessZone`). These were pinned to UTC
 * once, and a business in India read "04:39 UTC" for its 10:09 in the
 * morning; the business's own clock needs no zone named after it.
 */
const LOCALE = "en-GB";

/** "2 Sep" — for a list where the year is rarely the point. */
export function shortDate(value: string | Date, zone: string): string {
    return new Date(value).toLocaleDateString(LOCALE, {
        day: "numeric",
        month: "short",
        timeZone: zone,
    });
}

/** "2 Sep 2026, 09:29" — for a tooltip, where precision is the point. */
export function exactDate(value: string | Date, zone: string): string {
    return new Date(value).toLocaleString(LOCALE, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zone,
    });
}
