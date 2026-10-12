import type { OfferedDay } from "./types";

/**
 * Which day Availability's preview shows: the one picked by hand while the
 * booking page still lists it, else the first day with a time to offer
 * (today when it has one, or the next that does), else today, else the
 * first listed. Null with no days at all. Pure.
 */
export function pickOfferedDay(
    days: readonly OfferedDay[],
    picked: string | null,
    today: string,
): OfferedDay | null {
    return (
        days.find((d) => d.date === picked) ??
        days.find((d) => d.starts.length > 0) ??
        days.find((d) => d.date === today) ??
        days.at(0) ??
        null
    );
}
