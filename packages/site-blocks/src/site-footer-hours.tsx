"use client";

import { useSyncExternalStore } from "react";

import { groupedHoursRows, hoursRows } from "./blocks/hours";
import type { OpeningHoursDay, Weekday } from "./lib/opening-hours";
import { FALLBACK_TIME_ZONE, weekdayIn } from "./lib/opening-hours";

/**
 * A place's week at the foot of the page: one line per day, days in a row
 * that keep the same hours said once ("Monday to Friday"), closed days
 * stated, and today's line marked.
 *
 * The week is laid out by the Opening hours block's own helpers
 * (`hoursRows`, `groupedHoursRows`), and today is read on the business's
 * wall clock (`weekdayIn`, the clock "Open now" reads), never the
 * visitor's: a shop in Mumbai marks Monday while it is Monday in Mumbai.
 *
 * TODAY IS MARKED IN THE BROWSER. A page may be kept and served again
 * tomorrow, and a day marked on the server would then be yesterday. So the
 * server draws the week with no day marked, and the browser marks one after
 * it loads; with scripts off the week is still all there. `now` pins the
 * moment for fixtures and tests, and is then marked on the server too.
 *
 * It does not say "Open now": the footer's read carries no closed dates, so
 * the line could be wrong on a holiday. The Visit us and Opening hours
 * blocks say it, from a read that does.
 *
 * Drawn in the footer's own colours at full strength (no tint nobody
 * checked): today is marked by weight and by a word a screen reader says.
 */
const noSubscribe = () => () => undefined;

function useToday(timeZone: string, now: Date | undefined): Weekday | null {
    return useSyncExternalStore(
        noSubscribe,
        // A weekday, not a Date: the same value on every read within a day.
        () => weekdayIn(now ?? new Date(), timeZone),
        () => (now ? weekdayIn(now, timeZone) : null),
    );
}

export function FooterHours({
    hours,
    timeZone,
    now,
    label = "Opening hours",
    labelClassName,
}: {
    /** The small heading over the week, in the footer's label style. */
    labelClassName: string;
    hours: readonly OpeningHoursDay[] | null | undefined;
    /** The business's zone (DEC-033); India when none is known. */
    timeZone?: string | null;
    /** The moment today is worked out for. Fixtures and tests pin it. */
    now?: Date;
    /** What the week is called. */
    label?: string;
}) {
    const zone = timeZone?.trim() ?? "";
    const today = useToday(zone === "" ? FALLBACK_TIME_ZONE : zone, now);
    // Closed days are stated: "Sunday  Closed" is a fact someone came for.
    const rows = hoursRows(hours, true);
    if (!rows) return null;
    const lines = groupedHoursRows(rows);
    return (
        <div data-site-hours="" className="mt-4">
            <h3 className={labelClassName}>{label}</h3>
            <dl className="m-0 grid max-w-xs grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[13.5px] leading-snug">
                {lines.map((line) => {
                    const isToday = today !== null && line.days.includes(today);
                    const weight = isToday ? "font-bold" : "font-normal";
                    return (
                        <div
                            key={line.days[0]}
                            className="contents"
                            data-today={isToday ? "" : undefined}
                        >
                            <dt className={weight}>
                                {line.label}
                                {isToday ? (
                                    <span className="sr-only">, today</span>
                                ) : null}
                            </dt>
                            <dd
                                className={`m-0 whitespace-nowrap text-right tabular-nums ${weight}`}
                            >
                                {line.hours ?? "Closed"}
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}
