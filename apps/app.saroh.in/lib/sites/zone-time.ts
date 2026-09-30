/**
 * Times as the site editor says them, in the business's time zone (DEC-071,
 * T11): when a test release goes live, was made or was last opened. Never
 * the browser's zone: a schedule happens where the business keeps time.
 */

const LOCALE = "en-GB";

function parts(at: Date, zone: string) {
    const f = new Intl.DateTimeFormat(LOCALE, {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
    const out: Record<string, string> = { dayPeriod: "" };
    for (const p of f.formatToParts(at)) out[p.type] = p.value;
    return out;
}

/** "2026-10-03" in the zone. */
export function dayKey(at: Date, zone: string): string {
    const p = parts(at, zone);
    return `${p.year}-${p.month}-${p.day}`;
}

/** "6:00pm", as the API's own notices write a time. */
export function clockTime(at: Date | string, zone: string): string {
    const p = parts(new Date(at), zone);
    return `${p.hour}:${p.minute}${p.dayPeriod.toLowerCase()}`;
}

function dayDiff(a: string, b: string): number {
    return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

/**
 * When something happens or happened, in the business's zone: "today,
 * 6:00pm", "tomorrow, 6:00pm", "Fri 6:00pm" within the week ahead, and
 * "Fri 3 Oct, 6:00pm" further off or in the past.
 */
export function whenIn(
    at: Date | string,
    zone: string,
    now: Date = new Date(),
): string {
    const date = new Date(at);
    const clock = clockTime(date, zone);
    const diff = dayDiff(dayKey(date, zone), dayKey(now, zone));
    if (diff === 0) return `today, ${clock}`;
    if (diff === 1) return `tomorrow, ${clock}`;
    if (diff === -1) return `yesterday, ${clock}`;
    const weekday = parts(date, zone).weekday;
    if (diff > 1 && diff < 7) return `${weekday} ${clock}`;
    const day = new Intl.DateTimeFormat(LOCALE, {
        timeZone: zone,
        day: "numeric",
        month: "short",
    })
        .format(date)
        .replace("Sept", "Sep");
    return `${weekday} ${day}, ${clock}`;
}

/** The zone as people read it: "Asia/Kolkata" → "Kolkata time". */
export function zoneName(zone: string): string {
    const city = zone.split("/").pop() ?? zone;
    return `${city.replace(/_/g, " ")} time`;
}

/** "18:00" in the zone, rounded up to the next half hour, for a default. */
export function nextSlot(
    now: Date,
    zone: string,
    aheadMinutes = 60,
): { date: string; time: string } {
    const at = new Date(now.getTime() + aheadMinutes * 60_000);
    const f = new Intl.DateTimeFormat(LOCALE, {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
    const [h, m] = f.format(at).split(":").map(Number);
    const total = h * 60 + m;
    const rounded = Math.ceil(total / 30) * 30;
    if (rounded >= 24 * 60) {
        const tomorrow = new Date(at.getTime() + 86_400_000);
        return { date: dayKey(tomorrow, zone), time: "00:00" };
    }
    const hh = String(Math.floor(rounded / 60)).padStart(2, "0");
    const mm = String(rounded % 60).padStart(2, "0");
    return { date: dayKey(at, zone), time: `${hh}:${mm}` };
}

/** "7 Oct" in the zone. */
export function shortDay(at: Date | string, zone: string): string {
    return new Intl.DateTimeFormat(LOCALE, {
        timeZone: zone,
        day: "numeric",
        month: "short",
    })
        .format(new Date(at))
        .replace("Sept", "Sep");
}
