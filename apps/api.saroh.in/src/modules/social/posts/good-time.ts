import { createHash } from "node:crypto";

import { DateTime } from "luxon";

/** How far one business's good time is spread past the half hour (S-07). */
export const SPREAD_MINUTES = 25;

/**
 * "Good time" (R3): fixed suggestions until Saroh has its own click data,
 * in the business's zone: weekdays from 7:30 PM (the 7–9 PM evening),
 * weekends from 12:30 PM (around noon). Each business gets its own minute
 * within {@link SPREAD_MINUTES} of those (from `key`, its id), so every
 * business's main button doesn't land on one worker at one instant (S-07).
 * The next few that are at least `leadMinutes` away.
 */
export function goodTimes(
    now: Date,
    zone: string,
    key = "",
    count = 3,
    leadMinutes = 15,
): Date[] {
    const spread = key
        ? createHash("sha256").update(key).digest().readUInt16BE(0) %
          (SPREAD_MINUTES + 1)
        : 0;
    const earliest = DateTime.fromJSDate(now, { zone }).plus({
        minutes: leadMinutes,
    });
    const out: Date[] = [];
    for (let day = 0; out.length < count && day < 14; day++) {
        const d = earliest.startOf("day").plus({ days: day });
        const weekend = d.weekday >= 6;
        const at = d.set(
            weekend
                ? { hour: 12, minute: 30 + spread }
                : { hour: 19, minute: 30 + spread },
        );
        if (at >= earliest) out.push(at.toUTC().toJSDate());
    }
    return out;
}
