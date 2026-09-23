import { cn } from "@saroh/ui/lib/utils";

import type { LayerStyle, Off } from "@/lib/calendar/layers";
import {
    actOnCount,
    dayChips,
    dayCount,
    dayTakings,
    dayTitle,
    leadingBlanks,
} from "@/lib/calendar/layers";
import { shortMoney, wholeMoney } from "@/lib/calendar/money";
import type { CalendarDay } from "@/lib/calendar/types";

import { TONE_FILL } from "./tones";

const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Chips a desk cell holds before it is full; dots a phone cell holds. */
const DESK_CHIPS = 3;
const PHONE_DOTS = 5;

const cellEdge = "border-b border-r border-foreground/10";

/**
 * The month: a week a row from Monday, each day a button with its chips —
 * what needs acting on first, then a count per layer — and, for a role that
 * reads money, what was taken that day as a bar scaled to the busiest day.
 * Below 760px each chip is a dot per layer, red when something needs acting
 * on, and the tapped day is listed under the month.
 */
export function MonthGrid({
    month,
    days,
    layers,
    off,
    today,
    selected,
    currency,
    showTakings,
    onPick,
}: {
    month: string;
    days: CalendarDay[];
    layers: LayerStyle[];
    off: Off;
    today: string;
    selected: string;
    currency: string | null;
    /** The lead layer is on and this person reads money. */
    showTakings: boolean;
    onPick: (date: string) => void;
}) {
    const lead = layers.at(0);
    const takings = days.map((d) =>
        showTakings ? dayTakings(d, currency) : 0,
    );
    const busiest = Math.max(1, ...takings);
    const blanks = leadingBlanks(month);
    const trailing = (7 - ((blanks + days.length) % 7)) % 7;

    const blank = (key: string) => (
        <div
            key={key}
            aria-hidden
            className={cn(
                cellEdge,
                "min-h-[54px] bg-neutral-50 dark:bg-muted min-[760px]:min-h-[92px]",
            )}
        />
    );

    return (
        <div className="min-w-0 flex-[3_1_460px] overflow-hidden rounded-xl border border-border bg-card">
            <div
                aria-hidden
                className="grid grid-cols-7 border-b border-border"
            >
                {DOWS.map((d) => (
                    <div
                        key={d}
                        className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                    >
                        <span className="min-[760px]:hidden">{d[0]}</span>
                        <span className="max-[759px]:hidden">{d}</span>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7">
                {Array.from({ length: blanks }, (_, i) => blank(`b${i}`))}
                {days.map((day, i) => {
                    const past = day.date < today;
                    const isToday = day.date === today;
                    const on = day.date === selected;
                    const chips = dayChips(day, layers, off);
                    const taken = takings[i];
                    const n = dayCount(day, layers, off);
                    const act = actOnCount(day, off);
                    const label = [
                        `${dayTitle(day.date, today)}${isToday ? ", today" : ""}: ${
                            n
                                ? `${n} ${n === 1 ? "thing" : "things"}`
                                : "nothing"
                        }`,
                        act ? `${act} to act on` : null,
                        taken > 0 && currency
                            ? `${wholeMoney(taken, currency)} taken`
                            : null,
                    ]
                        .filter(Boolean)
                        .join(", ");
                    return (
                        <button
                            key={day.date}
                            type="button"
                            onClick={() => onPick(day.date)}
                            aria-label={label}
                            aria-pressed={on}
                            aria-current={isToday ? "date" : undefined}
                            className={cn(
                                cellEdge,
                                "block min-h-[54px] w-full min-w-0 px-[5px] py-1.5 text-left align-top font-sans min-[760px]:min-h-[92px] min-[760px]:px-2 min-[760px]:py-[7px]",
                                on
                                    ? "bg-brand-subtle ring-2 ring-inset ring-highlight"
                                    : "bg-card hover:bg-muted",
                            )}
                        >
                            <span className="flex items-baseline gap-1.5">
                                <span
                                    className={cn(
                                        "text-[13px]",
                                        isToday
                                            ? "font-bold text-brand"
                                            : past
                                              ? "font-medium text-muted-foreground"
                                              : "font-medium text-foreground",
                                    )}
                                >
                                    {Number(day.date.slice(8))}
                                </span>
                                <span className="flex-1" />
                                {taken > 0 && currency ? (
                                    <span className="text-[11px] font-semibold tabular-nums text-neutral-600 dark:text-muted-foreground max-[759px]:hidden">
                                        {shortMoney(taken, currency)}
                                    </span>
                                ) : null}
                            </span>
                            {taken > 0 && lead ? (
                                <span
                                    aria-hidden
                                    className="mb-1 mt-[5px] block h-1 overflow-hidden rounded-full bg-muted max-[759px]:hidden"
                                >
                                    <span
                                        className={cn(
                                            "block h-full rounded-full",
                                            TONE_FILL[lead.tone],
                                        )}
                                        style={{
                                            width: `${(taken / busiest) * 100}%`,
                                        }}
                                    />
                                </span>
                            ) : null}
                            {/* Desk: chips in words. */}
                            <span
                                aria-hidden
                                className="mt-[3px] flex flex-col gap-0.5 max-[759px]:hidden"
                            >
                                {chips.slice(0, DESK_CHIPS).map((chip) => (
                                    <span
                                        key={chip.key}
                                        className={cn(
                                            "block truncate rounded-[4px] px-[5px] py-px text-[11px]",
                                            chip.tone === "act"
                                                ? "bg-destructive-subtle font-bold text-destructive-subtle-foreground"
                                                : cn(
                                                      "font-semibold text-layer-foreground",
                                                      TONE_FILL[chip.tone],
                                                      past && "opacity-80",
                                                  ),
                                        )}
                                    >
                                        {chip.text}
                                    </span>
                                ))}
                            </span>
                            {/* Phone: a dot per layer, red first when
                                something needs acting on. */}
                            <span
                                aria-hidden
                                className="mt-1.5 flex flex-wrap gap-[3px] min-[760px]:hidden"
                            >
                                {chips.slice(0, PHONE_DOTS).map((chip) => (
                                    <span
                                        key={chip.key}
                                        className={cn(
                                            "block size-[7px] rounded-full",
                                            chip.tone === "act"
                                                ? "bg-destructive-subtle-foreground ring-2 ring-destructive-subtle"
                                                : cn(
                                                      TONE_FILL[chip.tone],
                                                      past && "opacity-70",
                                                  ),
                                        )}
                                    />
                                ))}
                            </span>
                        </button>
                    );
                })}
                {Array.from({ length: trailing }, (_, i) => blank(`t${i}`))}
            </div>
        </div>
    );
}
