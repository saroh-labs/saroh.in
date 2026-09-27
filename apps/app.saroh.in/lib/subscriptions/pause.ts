import type { PauseChoice, Subscription } from "./service";
import { dayText } from "./view";

/**
 * How long a pause lasts (plan 2026-09-26-004, D8): 2, 4 or 8 weeks, which
 * resume on their own, or "Until I resume", which is staff's alone (a
 * customer's own pause always has an end date, default 30). The API dates
 * the end at the start of that day in the subscription's timezone; these
 * are the same days, for the sheet to say before it asks.
 */

export interface PauseOption {
    key: string;
    /** "4 weeks · until 17 Oct", "Until I resume". */
    label: string;
    choice: PauseChoice;
    /** The day it resumes, YYYY-MM-DD in its zone; null until resumed. */
    until: string | null;
}

export const PAUSE_WEEKS = [2, 4, 8] as const;

/** The design's pick when the sheet opens. */
export const DEFAULT_PAUSE = "4";

/** Today's date in a zone, YYYY-MM-DD. */
export function localDay(at: Date, timeZone: string): string {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(at);
}

/** A YYYY-MM-DD date `days` later, by the calendar. */
export function addDays(day: string, days: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export function pauseOptions(
    sub: Pick<Subscription, "timezone">,
    now: Date,
): PauseOption[] {
    const today = localDay(now, sub.timezone);
    return [
        ...PAUSE_WEEKS.map((weeks) => {
            const until = addDays(today, weeks * 7);
            return {
                key: String(weeks),
                label: `${weeks} weeks · until ${dayText(until, sub.timezone, now)}`,
                choice: { weeks },
                until,
            };
        }),
        {
            key: "open",
            label: "Until I resume",
            choice: { until: null },
            until: null,
        },
    ];
}

/**
 * What the sheet says under the choices (review S-1). A pause that ends on
 * or before the paid period's end moves that end later by the days paused;
 * one that ends after it starts a new period, with its invoice, on the day
 * it ends — the API decides the same way from the same dates. The pause's
 * end is the start of its day, so "on or before" is its day on or before
 * the period's last day.
 */
export function pauseNote(
    option: PauseOption | undefined,
    sub: Pick<Subscription, "timezone" | "contact" | "currentPeriodEnd">,
    now: Date,
): string {
    const first = sub.contact.name.split(" ")[0] || sub.contact.name;
    const tz = sub.timezone;
    const periodEnd = dayText(sub.currentPeriodEnd, tz, now);
    const added = `The days it's paused are added to the period ${first} has paid for.`;
    if (!option?.until) {
        return `Nothing is charged or collected until you resume it. Resume before ${periodEnd} and the days it's paused are added to the period ${first} has paid for; later, a new period starts with its invoice.`;
    }
    const until = dayText(option.until, tz, now);
    if (option.until <= localDay(new Date(sub.currentPeriodEnd), tz)) {
        return `Nothing is charged or collected until ${until}. It restarts on its own. ${added}`;
    }
    return `Nothing is charged or collected until ${until}. ${first} has paid up to ${periodEnd}, so on ${until} it restarts with a new period and its invoice.`;
}

/**
 * The pause a resume's Undo puts back: to the same day when it had one
 * still to come, else until resumed.
 */
export function pauseAgain(
    sub: Pick<Subscription, "pausedUntil" | "timezone">,
    now: Date,
): PauseChoice {
    if (!sub.pausedUntil) return { until: null };
    const day = localDay(new Date(sub.pausedUntil), sub.timezone);
    return day > localDay(now, sub.timezone) ? { until: day } : { until: null };
}
