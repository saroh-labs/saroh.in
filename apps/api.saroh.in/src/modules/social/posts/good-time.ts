import { DateTime } from "luxon";

/**
 * "Good time" (R3): fixed suggestions until Saroh has its own click data,
 * in the business's zone: weekdays 7:30 PM (the 7–9 PM evening), weekends
 * 12:30 PM (around noon). The next few that are at least `leadMinutes`
 * away.
 */
export function goodTimes(
    now: Date,
    zone: string,
    count = 3,
    leadMinutes = 15,
): Date[] {
    const earliest = DateTime.fromJSDate(now, { zone }).plus({
        minutes: leadMinutes,
    });
    const out: Date[] = [];
    for (let day = 0; out.length < count && day < 14; day++) {
        const d = earliest.startOf("day").plus({ days: day });
        const weekend = d.weekday >= 6;
        const at = d.set(
            weekend ? { hour: 12, minute: 30 } : { hour: 19, minute: 30 },
        );
        if (at >= earliest) out.push(at.toUTC().toJSDate());
    }
    return out;
}
