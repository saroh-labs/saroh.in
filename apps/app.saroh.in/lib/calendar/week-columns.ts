import type { CellOff } from "./days-off";
import { cellOff } from "./days-off";
import type { FlagTone, LayerStyle, LayerTone, Off } from "./layers";
import { clock, dayCount, dayTitle, describeItem } from "./layers";
import type { CalendarCash } from "./money";
import {
    cellMoney,
    minorMoney,
    moneyByDate,
    toMajor,
    wholeMoney,
} from "./money";
import { dayProblems, problemChip } from "./problems";
import type { CalendarRange } from "./range";
import { inRange } from "./range";
import type { CalendarDay, CalendarMonth, LayerKey } from "./types";

/**
 * The Week's card columns (plan 005 E25, R17), after the "Saroh Business
 * Calendar" design: a column a day, headed by its weekday and date, what
 * came in and went out (money roles only, E23), who is off or that it is
 * closed (E24), and its named problem (E22); under it, a card per dated
 * thing in time order, each opening its record. Only the layers switched
 * on, and — through `forPerson` before this — only the person picked.
 * Pure, so the rules are tested without a browser.
 */

/** Cards a column lists before pointing at the day's panel for the rest. */
export const COLUMN_CARDS = 20;

export interface WeekCard {
    key: string;
    layer: LayerKey;
    tone: LayerTone;
    /** "07:00", or the layer's name for a thing with no time (a pick-up). */
    at: string;
    /** What it is, without the time the card already shows. */
    title: string;
    /** The whole line, for the card's tooltip and label. */
    full: string;
    flag: { label: string; tone: FlagTone } | null;
    /** `payment:read` only, as the design has it: "₹1,200". */
    amount: string | null;
    href: string;
}

export interface WeekColumn {
    date: string;
    /** "Mon". */
    dow: string;
    /** "14". */
    n: string;
    isToday: boolean;
    past: boolean;
    /** Before the business joined, or past what can be planned: muted. */
    outside: boolean;
    selected: boolean;
    /** "+₹3.8k" and "−₹200"; empty when nothing moved, or no money read. */
    moneyIn: string;
    moneyOut: string;
    off: CellOff | null;
    /** "1 late order", "2 need you"; "" when nothing is wrong. */
    problem: string;
    cards: WeekCard[];
    /** Things on the day past the cards listed. */
    more: number;
    /** "Nothing" or "Nothing yet" on an empty day; "" when it is off. */
    empty: string;
    /** The day in words for a screen reader, as the month's cell says it. */
    label: string;
}

const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A day's time, dropped from the front of a title the card times itself. */
const LEADING_TIME = /^\d{2}:\d{2} /;

/** One day's cards, every layer switched on, in time; untimed last. */
export function dayCards(
    day: CalendarDay,
    {
        layers,
        off,
        today,
        timeZone,
        money,
    }: {
        layers: LayerStyle[];
        off: Off;
        today: string;
        timeZone: string;
        /** Whether this viewer reads money (`payment:read`). */
        money: boolean;
    },
): WeekCard[] {
    const ahead = day.date > today;
    const cards: (WeekCard & { when: string })[] = [];
    for (const layer of layers) {
        if (off[layer.key]) continue;
        for (const item of day.layers[layer.key]?.items ?? []) {
            const line = describeItem(layer.key, item, { timeZone, ahead });
            cards.push({
                key: `${layer.key}:${item.id}`,
                layer: layer.key,
                tone: layer.tone,
                at: item.at ? clock(item.at, timeZone) : layer.label,
                title: line.title.replace(LEADING_TIME, ""),
                full: line.sub ? `${line.title} · ${line.sub}` : line.title,
                flag: line.flag,
                amount:
                    money && item.amount !== undefined && item.currency
                        ? wholeMoney(toMajor(item.amount), item.currency)
                        : null,
                href: line.href,
                // Instants sort as text; a thing with no time goes last.
                when: item.at ?? "~",
            });
        }
    }
    // Stable: things at the same time keep the layers' reading order.
    return cards
        .sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0))
        .map(({ when: _when, ...card }) => card);
}

/**
 * The week's seven columns, from the week as read — narrowed to the person
 * picked already — and the switches.
 */
export function weekColumns({
    week,
    dates,
    layers,
    off,
    today,
    selected,
    range,
    cash,
    person,
}: {
    /** The week as read, narrowed by `forPerson` when someone is picked. */
    week: CalendarMonth;
    /** The Monday to Sunday shown. */
    dates: string[];
    layers: LayerStyle[];
    off: Off;
    today: string;
    selected: string;
    range: CalendarRange;
    /** `payment:read` only (E23); null: no money drawn. */
    cash: CalendarCash | null;
    /** The team filter's person, for whose day off is striped (E24). */
    person: string | null;
}): WeekColumn[] {
    const sums = cash ? moneyByDate(cash.shown) : null;
    return dates.map((date, i): WeekColumn => {
        const day: CalendarDay = week.days.find((d) => d.date === date) ?? {
            date,
            layers: {},
            toActOn: 0,
        };
        const outside = !inRange(date, range);
        const past = date < today;
        const isToday = date === today;
        const all = dayCards(day, {
            layers,
            off,
            today,
            timeZone: week.timezone,
            money: cash !== null,
        });
        const count = dayCount(day, layers, off);
        const offDay = cellOff(week, date, person);
        const problem = problemChip(dayProblems(day, off, today));
        const sum = sums?.get(date);
        const shown = cash
            ? cellMoney(sum, cash.currency)
            : { in: "", out: "" };
        const label = [
            `${dayTitle(date, today)}${isToday ? ", today" : ""}: ${
                count
                    ? `${count} ${count === 1 ? "thing" : "things"}`
                    : "nothing"
            }`,
            offDay?.title ?? null,
            problem || null,
            sum?.in && cash ? `${minorMoney(sum.in, cash.currency)} in` : null,
            sum?.out && cash
                ? `${minorMoney(sum.out, cash.currency)} out`
                : null,
        ]
            .filter(Boolean)
            .join(", ");
        const cards = all.slice(0, COLUMN_CARDS);
        return {
            date,
            dow: DOWS[i] ?? "",
            n: String(Number(date.slice(8))),
            isToday,
            past,
            outside,
            selected: date === selected,
            moneyIn: shown.in,
            moneyOut: shown.out,
            off: offDay,
            problem,
            cards,
            // The day's true count, past the cards drawn (a layer's list
            // stops at 50 on the API's side too).
            more: Math.max(0, count - cards.length),
            empty:
                count > 0 || offDay?.striped || outside
                    ? ""
                    : past
                      ? "Nothing"
                      : "Nothing yet",
            label,
        };
    });
}

/**
 * The line beside the week's title, as the design has it: nothing for a
 * money role (the columns carry the money); otherwise a count per layer
 * switched on — "4 bookings · 2 classes" — or that every layer is off.
 */
export function weekSummary({
    week,
    layers,
    off,
    money,
}: {
    week: CalendarMonth;
    layers: LayerStyle[];
    off: Off;
    money: boolean;
}): string {
    const on = layers.filter((l) => !off[l.key]);
    if (on.length === 0) return "Every layer is off";
    if (money) return "";
    return on
        .map((l) => {
            const n = week.days.reduce(
                (sum, d) => sum + (d.layers[l.key]?.count ?? 0),
                0,
            );
            return `${n} ${n === 1 ? l.one : l.many}`;
        })
        .join(" · ");
}
