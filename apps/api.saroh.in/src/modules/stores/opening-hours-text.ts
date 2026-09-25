import type { OpeningHoursDay } from "./storefronts.dto";

const DAY_NAMES: Record<OpeningHoursDay["day"], string> = {
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
    SUN: "Sun",
};

const ORDER: readonly OpeningHoursDay["day"][] = [
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
    "SUN",
];

/**
 * A shop's week as a person reads it — "Mon–Fri 09:00–18:00, Sat
 * 10:00–14:00, Sun closed" — with neighbouring days that keep the same
 * hours said once. What Settings › Activity shows as a storefront's hours
 * before and after a save (#509); null for a week never set.
 */
export function openingHoursText(
    week: readonly OpeningHoursDay[] | null | undefined,
): string | null {
    if (!week || week.length === 0) return null;
    const byDay = new Map(week.map((d) => [d.day, d]));
    const hours = (d: OpeningHoursDay | undefined) =>
        !d || d.closed ? "closed" : `${d.open}–${d.close}`;

    type Day = OpeningHoursDay["day"];
    const runs: { from: Day; to: Day; hours: string }[] = [];
    for (const day of ORDER) {
        const said = hours(byDay.get(day));
        const last = runs.length > 0 ? runs[runs.length - 1] : null;
        if (last !== null && last.hours === said) {
            last.to = day;
        } else {
            runs.push({ from: day, to: day, hours: said });
        }
    }
    return runs
        .map((run) => {
            const days =
                run.from === run.to
                    ? DAY_NAMES[run.from]
                    : `${DAY_NAMES[run.from]}–${DAY_NAMES[run.to]}`;
            return `${days} ${run.hours}`;
        })
        .join(", ");
}
