import type { OpeningHoursDay, Weekday } from "@/lib/stores/storefronts";

/**
 * Business → Hours writes a week as a shop writes it on its door —
 * "07:00–19:00" or "Closed" per day — and the API keeps it per storefront as
 * seven `{ day, open, close, closed }` entries, Monday first
 * (`UpdateStorefrontDto.openingHours`). These turn one into the other.
 *
 * Pure, so the rules are tested without a form.
 */

export const WEEK: readonly { day: Weekday; key: DayKey; label: string }[] = [
    { day: "MON", key: "mon", label: "Monday" },
    { day: "TUE", key: "tue", label: "Tuesday" },
    { day: "WED", key: "wed", label: "Wednesday" },
    { day: "THU", key: "thu", label: "Thursday" },
    { day: "FRI", key: "fri", label: "Friday" },
    { day: "SAT", key: "sat", label: "Saturday" },
    { day: "SUN", key: "sun", label: "Sunday" },
];

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type WeekText = Record<DayKey, string>;

/** What a day's field accepts, as the design checks it. */
export const DAY_SHAPE = /^(closed|\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2})$/i;
export const DAY_PROBLEM = "Use 07:00–19:00, or Closed.";
export const BACKWARDS_PROBLEM = "A day has to close after it opens.";

/** A time as the API stores it, "7:05" → "07:05"; `null` past 23:59. */
function clock(text: string): string | null {
    const [h = "", m = ""] = text.split(":");
    const hours = Number(h);
    const minutes = Number(m);
    if (hours > 23 || minutes > 59) return null;
    return `${String(hours).padStart(2, "0")}:${m}`;
}

/** One day as its field shows it: "07:00–19:00" or "Closed". */
export function dayText(day: OpeningHoursDay): string {
    return day.closed ? "Closed" : `${day.open}–${day.close}`;
}

/** A saved week as the seven fields show it; none saved is all blank. */
export function weekText(week: readonly OpeningHoursDay[] | null): WeekText {
    return Object.fromEntries(
        WEEK.map(({ day, key }) => {
            const saved = week?.find((d) => d.day === day);
            return [key, saved ? dayText(saved) : ""];
        }),
    ) as WeekText;
}

/**
 * What is wrong with a day's field, or `null`. Beyond the design's shape: a
 * time the clock doesn't have, and a day that closes before it opens — the
 * API refuses both, so they are said here first.
 */
export function dayProblem(text: string): string | null {
    const value = text.trim();
    if (!DAY_SHAPE.test(value)) return DAY_PROBLEM;
    if (/^closed$/i.test(value)) return null;
    const [from = "", to = ""] = value.split(/\s*[–-]\s*/);
    const open = clock(from);
    const close = clock(to);
    if (!open || !close) return DAY_PROBLEM;
    return open < close ? null : BACKWARDS_PROBLEM;
}

/**
 * The week the API takes from seven valid fields. A closed day keeps the
 * times it had (`previous`), as the storefront's own editor does, so opening
 * it again brings its hours back; one that never had any keeps 09:00–18:00.
 */
export function weekFromText(
    text: WeekText,
    previous: readonly OpeningHoursDay[] | null,
): OpeningHoursDay[] {
    return WEEK.map(({ day, key }) => {
        const value = text[key].trim();
        if (/^closed$/i.test(value)) {
            const before = previous?.find((d) => d.day === day);
            return {
                day,
                open: before?.open ?? "09:00",
                close: before?.close ?? "18:00",
                closed: true,
            };
        }
        const [from = "", to = ""] = value.split(/\s*[–-]\s*/);
        return {
            day,
            open: clock(from) ?? from,
            close: clock(to) ?? to,
            closed: false,
        };
    });
}

/** The read row for Monday to Thursday: one value if all four agree. */
export function monToThu(text: WeekText): string {
    const days = [text.mon, text.tue, text.wed, text.thu];
    return days.every((d) => d === text.mon) ? text.mon : days.join(" · ");
}

/** Whether two storefronts keep the same week, as a person would read it. */
export function sameWeek(
    a: readonly OpeningHoursDay[] | null,
    b: readonly OpeningHoursDay[] | null,
): boolean {
    const x = weekText(a);
    const y = weekText(b);
    return WEEK.every(({ key }) => x[key] === y[key]);
}
