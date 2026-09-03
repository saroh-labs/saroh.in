/**
 * Dates that render identically on the server and in the browser.
 *
 * `toLocaleString()` reads the runtime's locale and time zone, and the server's
 * are not the viewer's — Node produced "9/2/2026, 3:59:54 AM" while the browser
 * produced "02/09/2026, 03:59:54" for the same instant, which React reported as
 * a hydration mismatch. React's own list of causes names this exactly: "date
 * formatting in a user's locale which doesn't match the server".
 *
 * So both are pinned. A fixed locale and UTC cost the viewer their own
 * formatting; the alternatives cost more. Formatting after mount means every
 * date visibly changes a beat after the page appears, and sending the server's
 * offset means one of the two is always wrong about what day it is.
 */
const LOCALE = "en-GB";
const ZONE = "UTC";

/** "2 Sep" — for a list where the year is rarely the point. */
export function shortDate(value: string | Date): string {
    return new Date(value).toLocaleDateString(LOCALE, {
        day: "numeric",
        month: "short",
        timeZone: ZONE,
    });
}

/** "2 Sep 2026, 03:59 UTC" — for a tooltip, where precision is the point. */
export function exactDate(value: string | Date): string {
    const formatted = new Date(value).toLocaleString(LOCALE, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: ZONE,
    });
    // Named, because a time with no zone is a time the reader has to guess at.
    return `${formatted} UTC`;
}
