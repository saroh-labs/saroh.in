import type { OpeningHoursDay, Weekday } from "@/lib/stores/storefronts";

/**
 * Business → Hours reads a week as a shop writes it on its door,
 * "07:00–19:00" or "Closed" per day, from what the API keeps per storefront:
 * seven `{ day, open, close, closed }` entries, Monday first
 * (`UpdateStorefrontDto.openingHours`). The week is edited with the
 * location's own fields (`components/stores/place/opening-hours.tsx`), so nothing
 * here parses typed text.
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

/** One day as its row shows it: "07:00–19:00" or "Closed". */
export function dayText(day: OpeningHoursDay): string {
    return day.closed ? "Closed" : `${day.open}–${day.close}`;
}

/** A saved week as seven rows show it; none saved is all blank. */
export function weekText(week: readonly OpeningHoursDay[] | null): WeekText {
    return Object.fromEntries(
        WEEK.map(({ day, key }) => {
            const saved = week?.find((d) => d.day === day);
            return [key, saved ? dayText(saved) : ""];
        }),
    ) as WeekText;
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
