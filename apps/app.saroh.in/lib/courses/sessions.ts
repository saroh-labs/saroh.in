/**
 * A session is picked as a day and a time on the wall of the business — the
 * service's zone — not the browser's. This turns that into the instant the
 * API stores, without a date library: guess it as if it were UTC, then take
 * off the zone's offset at that moment, checked once more across a clock
 * change.
 */

function offsetMs(at: number, timeZone: string): number {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(new Date(at));
    const get = (type: string) =>
        Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute"),
        get("second"),
    );
    return asUtc - at;
}

/** "2026-10-06" + "18:30" in "Europe/London" → the ISO instant. */
export function wallClockToIso(
    ymd: string,
    hhmm: string,
    timeZone: string,
): string {
    const [y = 1970, m = 1, d = 1] = ymd.split("-").map(Number);
    const [h = 0, min = 0] = hhmm.split(":").map(Number);
    const guess = Date.UTC(y, m - 1, d, h, min);
    let at = guess - offsetMs(guess, timeZone);
    // Across a clock change the offset at the guess and at the answer differ.
    at = guess - offsetMs(at, timeZone);
    return new Date(at).toISOString();
}

/** A local calendar day as YYYY-MM-DD — the day the merchant picked. */
export function ymd(d: Date): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
