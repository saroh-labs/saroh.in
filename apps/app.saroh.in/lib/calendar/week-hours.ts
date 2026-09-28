import type { Band } from "./hour-layout";
import { hhmm, minutesOf, placeBlocks, workBands } from "./hour-layout";
import type { FlagTone, LayerStyle, LayerTone, Off } from "./layers";
import { clock, describeItem } from "./layers";
import type {
    CalendarDay,
    CalendarItem,
    CalendarMonth,
    LayerKey,
} from "./types";
import type { WeekColumn } from "./week-columns";

/**
 * The Week as an hour grid, for a business with a team (plan 005 E27, R17),
 * after the "Saroh Business Calendar" design. Each day keeps the header the
 * card columns give it (E25's `weekColumns`: date, money in and out for a
 * role that reads it, who is off, the named problem), and adds:
 * - an All day row: what has no length — renewals, invoices, payments,
 *   orders and pick-ups — as chips in its layer's colour;
 * - blocks placed by start and length (bookings and classes), side by side
 *   where they overlap (`hour-layout.ts`), each with its time range and flag;
 * - the hours outside working time shaded, or the whole day striped when it
 *   is closed, the person picked is off, or nobody works it.
 *
 * The same switches as everywhere else apply: only layers switched on, and
 * — through `forPerson` before this — only the person picked, whose hours
 * alone then set the shading (E24). Pure, so it is tested without a browser.
 */

/** All-day chips a day shows before pointing at its panel for the rest. */
export const ALL_DAY_CHIPS = 4;

export interface AllDayChip {
    key: string;
    tone: LayerTone;
    title: string;
    /** The whole line, for its tooltip and label. */
    full: string;
    href: string;
    /** Failed or overdue: drawn in the danger fill, as the design does. */
    bad: boolean;
}

export interface HourBlock {
    key: string;
    layer: LayerKey;
    tone: LayerTone;
    /** "09:00–10:00". */
    time: string;
    flag: { label: string; tone: FlagTone } | null;
    /** What it is, without the time the block already shows. */
    title: string;
    /** The whole line with its time and flag, for its tooltip and label. */
    full: string;
    href: string;
    /** Pixels from the grid's top, and tall. */
    top: number;
    height: number;
    /** Its share of the column, in percent, from the left. */
    left: number;
    width: number;
    /** A no-show or a cancelled one: the danger fill. */
    bad: boolean;
    /** Cancelled: struck through. */
    struck: boolean;
    startsEarlier: boolean;
    endsLater: boolean;
}

export interface HourDay {
    /** The day's header, as the card columns draw it. */
    column: WeekColumn;
    allDay: AllDayChip[];
    /** All-day things past the chips shown. */
    allDayMore: number;
    blocks: HourBlock[];
    /**
     * `striped`: closed, the person picked off, or nobody at work. `bands`:
     * the hours outside working time. Neither when out of range, or when
     * the hours were not sent.
     */
    shade: { striped: boolean; bands: Band[] };
}

/** A day's time, dropped from the front of a title the block times itself. */
const LEADING_TIME = /^\d{2}:\d{2} /;

/** A thing with a start and a length is drawn by the hour. */
export function isTimed(item: CalendarItem): boolean {
    return item.at !== null && typeof item.durationMinutes === "number";
}

function cancelled(item: CalendarItem): boolean {
    return item.kind === "cancelled" || !!item.flags?.includes("cancelled");
}

/**
 * The hours shading one day. Out of range, or no hours sent: nothing (the
 * column is muted, or the API is older). Striped when the header says the
 * day is off, or nobody picked works it while someone works some day this
 * week — a team that never set its hours is not drawn as always away.
 */
export function dayShade({
    date,
    hours,
    person,
    striped,
    outside,
}: {
    date: string;
    hours: CalendarMonth["hours"];
    person: string | null;
    /** The header's own rule (E24): closed, or the person picked is off. */
    striped: boolean;
    outside: boolean;
}): HourDay["shade"] {
    if (outside) return { striped: false, bands: [] };
    if (striped) return { striped: true, bands: [] };
    if (!hours) return { striped: false, bands: [] };
    const whose = hours.filter((h) => !person || h.staffId === person);
    if (whose.length === 0) return { striped: false, bands: [] };
    const bands = workBands(whose.filter((h) => h.date === date));
    return bands ? { striped: false, bands } : { striped: true, bands: [] };
}

/** One day's all-day chips and timed blocks, among the layers switched on. */
export function dayHours(
    day: CalendarDay,
    {
        layers,
        off,
        today,
        timeZone,
    }: {
        layers: LayerStyle[];
        off: Off;
        today: string;
        timeZone: string;
    },
): { allDay: AllDayChip[]; allDayMore: number; blocks: HourBlock[] } {
    const ahead = day.date > today;
    const allDay: (AllDayChip & { when: string })[] = [];
    const timed: {
        start: number;
        end: number;
        item: CalendarItem;
        layer: LayerStyle;
    }[] = [];
    for (const layer of layers) {
        if (off[layer.key]) continue;
        for (const item of day.layers[layer.key]?.items ?? []) {
            if (item.at && isTimed(item)) {
                const start = minutesOf(clock(item.at, timeZone));
                timed.push({
                    start,
                    end: start + Math.max(0, item.durationMinutes ?? 0),
                    item,
                    layer,
                });
                continue;
            }
            const line = describeItem(layer.key, item, { timeZone, ahead });
            const title = line.title.replace(LEADING_TIME, "");
            allDay.push({
                key: `${layer.key}:${item.id}`,
                tone: layer.tone,
                title,
                full: line.sub ? `${line.title} · ${line.sub}` : line.title,
                href: line.href,
                bad: line.flag?.tone === "bad",
                when: item.at ?? "~",
            });
        }
    }

    const placed = placeBlocks(timed);
    const blocks = placed.map((p): HourBlock => {
        const { item, layer, start, end } = p.span;
        const line = describeItem(layer.key, item, { timeZone, ahead });
        const struck = cancelled(item);
        const flag =
            line.flag ?? (struck ? { label: "Cancelled", tone: "bad" } : null);
        const time = `${hhmm(start)}–${hhmm(end)}`;
        const title = line.title.replace(LEADING_TIME, "");
        return {
            key: `${layer.key}:${item.id}`,
            layer: layer.key,
            tone: layer.tone,
            time,
            flag,
            title,
            full: [
                `${time} ${title}`,
                flag?.label,
                line.sub || null,
                p.startsEarlier ? "starts before 06:00" : null,
                p.endsLater ? "runs past 22:00" : null,
            ]
                .filter(Boolean)
                .join(" · "),
            href: line.href,
            top: p.top,
            height: p.height,
            left: (p.lane / p.lanes) * 100,
            width: 100 / p.lanes,
            bad: struck || item.kind === "no_show",
            struck,
            startsEarlier: p.startsEarlier,
            endsLater: p.endsLater,
        };
    });

    // Things with a time first, in time; the rest keep the layers' order.
    const sorted = allDay
        .map((c, i) => ({ c, i }))
        .sort((a, b) =>
            a.c.when < b.c.when ? -1 : a.c.when > b.c.when ? 1 : a.i - b.i,
        )
        .map(({ c: { when: _when, ...chip } }) => chip);
    return {
        allDay: sorted.slice(0, ALL_DAY_CHIPS),
        allDayMore: Math.max(0, sorted.length - ALL_DAY_CHIPS),
        blocks,
    };
}

/**
 * The week's seven days for the hour grid, from E25's columns (already
 * narrowed to the person picked) and the week as read.
 */
export function weekHours({
    week,
    columns,
    layers,
    off,
    today,
    person,
}: {
    /** The week as read, narrowed by `forPerson` when someone is picked. */
    week: CalendarMonth;
    columns: WeekColumn[];
    layers: LayerStyle[];
    off: Off;
    today: string;
    /** The team filter's person, whose hours alone set the shading. */
    person: string | null;
}): HourDay[] {
    return columns.map((column): HourDay => {
        const day: CalendarDay = week.days.find(
            (d) => d.date === column.date,
        ) ?? { date: column.date, layers: {}, toActOn: 0 };
        return {
            column,
            ...dayHours(day, {
                layers,
                off,
                today,
                timeZone: week.timezone,
            }),
            shade: dayShade({
                date: column.date,
                hours: week.hours,
                person,
                striped: !!column.off?.striped,
                outside: column.outside,
            }),
        };
    });
}
