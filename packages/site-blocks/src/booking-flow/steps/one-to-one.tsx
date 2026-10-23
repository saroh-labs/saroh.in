import type { LookId } from "@saroh/block-contract";

import { timeWords } from "../../lib/clock";
import { cn } from "../../lib/utils";
import type { BusinessReach } from "../../reach-links";
import { ReachLinks } from "../../reach-links";
import type {
    BookingDay,
    BookingDays,
    BookingPerson,
    BookingStart,
} from "../model";
import {
    dateText,
    dayAria,
    dayCountLabel,
    dayHeading,
    dayParts,
    groupStarts,
} from "../model";
import { focusRing, quietFill } from "../styles";
import type { Weeks } from "./weeks";
import { THESE_WEEKS, WeeksButtons } from "./weeks";

/**
 * A look's day strip and time chips, as its board draws them (DEC-172,
 * wave 4): Quiet's pill columns and pill chips (VD08c), Folio's square
 * edged days with a light serif date (VA08c), Live's 16px cards with a
 * condensed number (VB `.chip`). Classic has none and keeps its own.
 */
const WHEN_LOOK: Record<
    LookId,
    {
        day: string;
        dayOn: string;
        dayFree: string;
        dayOff: string;
        num: string;
        chip: string;
        chipOn: string;
        chipOff: string;
    }
> = {
    quiet: {
        day: "min-h-[76px] rounded-[40px] border border-transparent px-1 py-3 text-[13px]",
        dayOn: "bg-site-fg text-site-bg cursor-pointer",
        dayFree:
            "bg-transparent text-site-fg hover:border-site-rule cursor-pointer",
        dayOff: "bg-transparent text-site-muted cursor-not-allowed opacity-55",
        num: "font-site-heading mt-0.5 block text-[28px] font-normal leading-none [font-variant-numeric:lining-nums]",
        chip: "min-h-12 min-w-24 rounded-full border px-5 text-[15px] font-normal",
        chipOn: "border-site-fg bg-site-fg text-site-bg",
        chipOff:
            "border-site-rule bg-transparent text-site-fg hover:border-site-fg",
    },
    folio: {
        day: "min-h-16 rounded-none border px-1 py-2.5 text-xs",
        dayOn: "border-site-fg bg-site-fg text-site-bg cursor-pointer",
        dayFree:
            "border-site-rule bg-transparent text-site-fg hover:border-site-fg cursor-pointer",
        dayOff: "border-site-rule text-site-muted cursor-not-allowed border-dashed bg-transparent",
        num: "font-site-heading mt-0.5 block text-2xl font-light leading-none",
        chip: "min-h-11 min-w-[88px] rounded-none border px-4 text-[15px] font-normal",
        chipOn: "border-site-fg bg-site-fg text-site-bg",
        chipOff:
            "border-site-rule bg-transparent text-site-fg hover:border-site-fg",
    },
    live: {
        day: "min-h-14 rounded-2xl border-0 px-1 py-2 text-xs font-bold",
        dayOn: "bg-site-fg text-site-bg cursor-pointer",
        dayFree:
            "bg-site-surface text-site-fg shadow-[inset_0_0_0_1.5px_hsl(var(--site-border))] hover:shadow-[inset_0_0_0_1.5px_hsl(var(--site-fg))] cursor-pointer",
        dayOff: cn("text-site-muted cursor-not-allowed", quietFill),
        num: "font-site-heading mt-0.5 block text-[22px] font-extrabold leading-none tracking-[-0.02em] [font-stretch:80%]",
        chip: "font-site-heading min-h-14 min-w-24 rounded-2xl border-0 px-3.5 text-[22px] font-extrabold tracking-[-0.02em] [font-stretch:80%]",
        chipOn: "bg-site-fg text-site-bg",
        chipOff:
            "bg-site-surface text-site-fg shadow-[inset_0_0_0_1.5px_hsl(var(--site-border))] hover:shadow-[inset_0_0_0_1.5px_hsl(var(--site-fg))]",
    },
};

/**
 * The two weeks' day strip and the chosen day's free times: the booking
 * page's, and the account's Move sheet's (UX-055).
 *
 * Where more than one person takes the service and each has their own
 * times, "With" offers Anyone or one of them (`people`), and the days are
 * read again for whoever is asked for. `weeks` is which two weeks are on
 * show, and the way to later ones. With nothing free, the page offers a
 * call and a message (`reach`) beside those.
 */
export function OneToOne({
    days,
    day,
    zone,
    compact = false,
    staff,
    chosen,
    onDay,
    onStart,
    business,
    people = [],
    person = null,
    onPerson,
    weeks = THESE_WEEKS,
    reach = null,
    look,
}: {
    days: BookingDays;
    day: BookingDay | null;
    zone: string;
    /**
     * Always the narrow layout (a sheet is narrow on any screen). Left
     * out, CSS chooses: narrow under 700px, never a script's guess.
     */
    compact?: boolean;
    /** Who takes it, by name: one is named beside the count. */
    staff: string[];
    chosen: BookingStart | null;
    onDay: (date: string) => void;
    onStart: (start: BookingStart) => void;
    business: string;
    /** Who takes it, each with their own times; a choice with two or more. */
    people?: BookingPerson[];
    /** The person asked for; null for anyone. */
    person?: string | null;
    onPerson?: (id: string | null) => void;
    weeks?: Weeks;
    /** A call and a message, offered when nothing is free. */
    reach?: BusinessReach | null;
    /** The look's own days and chips; absent, Classic's. */
    look?: LookId;
}) {
    const lk = look ? WHEN_LOOK[look] : null;
    const list = days.days;
    const firstDay = list.at(0);
    const lastDay = list.at(-1);
    const count = day?.starts.length ?? 0;
    const onlyOne = staff.length === 1 ? staff[0] : null;
    const choosesWho = people.length > 1 && onPerson !== undefined;
    const asked = people.find((p) => p.id === person) ?? null;
    const whoChip = (on: boolean) =>
        cn(
            "coarse:min-h-11 min-h-9 cursor-pointer rounded-full border px-3.5 text-sm font-semibold transition-[color,background-color,border-color,transform] duration-100 ease-out active:scale-[0.97]",
            focusRing,
            on
                ? "border-site-fg bg-site-fg text-site-bg"
                : "border-site-border bg-site-surface text-site-fg hover:border-site-fg",
        );
    return (
        <>
            {choosesWho ? (
                <div className="mb-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
                    <span
                        aria-hidden="true"
                        className="text-site-fg text-[13px] font-semibold"
                    >
                        With
                    </span>
                    <div
                        role="radiogroup"
                        aria-label="With"
                        className="flex flex-wrap gap-2"
                    >
                        <button
                            type="button"
                            role="radio"
                            aria-checked={asked === null}
                            onClick={() => onPerson(null)}
                            className={whoChip(asked === null)}
                        >
                            Anyone
                        </button>
                        {people.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                role="radio"
                                aria-checked={asked?.id === p.id}
                                onClick={() => onPerson(p.id)}
                                className={whoChip(asked?.id === p.id)}
                            >
                                {p.name}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
            <div className="mb-2 flex items-baseline gap-2">
                <span className="text-site-fg text-[13px] font-semibold">
                    {weeks.skip > 0 ? "Later dates" : "Next two weeks"}
                </span>
                {firstDay && lastDay ? (
                    <span className="text-site-muted text-[12.5px]">
                        {dateText(firstDay.date)} to {dateText(lastDay.date)}
                    </span>
                ) : null}
            </div>
            <div
                role="radiogroup"
                aria-label="Day"
                // Seven across, a week a row. Under a finger each day is at
                // least 44px wide, so a narrow phone wraps to more rows.
                className="coarse:grid-cols-[repeat(auto-fill,minmax(44px,1fr))] grid grid-cols-7 gap-1.5"
            >
                {list.map((d) => {
                    const on = d.date === day?.date;
                    const free = d.starts.length > 0;
                    const { dow, n } = dayParts(d.date);
                    return (
                        <button
                            key={d.date}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            aria-label={dayAria(d)}
                            disabled={!free}
                            onClick={() => onDay(d.date)}
                            className={
                                lk
                                    ? cn(
                                          "coarse:min-h-11 min-w-0 text-center transition-[color,background-color,border-color,box-shadow] duration-100 ease-out",
                                          focusRing,
                                          lk.day,
                                          on
                                              ? lk.dayOn
                                              : free
                                                ? lk.dayFree
                                                : lk.dayOff,
                                      )
                                    : cn(
                                          "coarse:min-h-11 min-w-0 border text-center transition-[color,background-color,border-color,transform] duration-100 ease-out",
                                          focusRing,
                                          compact
                                              ? "rounded-[calc(var(--site-radius)+10px)] py-2"
                                              : "rounded-[calc(var(--site-radius)+12px)] px-0.5 py-[9px] max-[699px]:rounded-[calc(var(--site-radius)+10px)] max-[699px]:px-0 max-[699px]:py-2",
                                          on
                                              ? "border-site-fg bg-site-fg text-site-bg cursor-pointer"
                                              : free
                                                ? "border-site-border bg-site-surface text-site-fg hover:border-site-fg cursor-pointer active:scale-[0.96]"
                                                : cn(
                                                      // Nothing free: quiet and dashed,
                                                      // told from a free day by its
                                                      // shape as well as its colour.
                                                      "border-site-border text-site-muted cursor-not-allowed border-dashed",
                                                      quietFill,
                                                  ),
                                      )
                            }
                        >
                            <span className="block text-xs">{dow}</span>
                            <span
                                className={
                                    lk?.num ??
                                    "mt-0.5 block text-[17px] font-bold"
                                }
                            >
                                {n}
                            </span>
                            {/* "3" where it is narrow, "3 free" where
                                there is room: both drawn, one shown. The
                                button's name is its aria-label. */}
                            {compact ? null : (
                                <span className="mt-0.5 block text-[11px] max-[699px]:hidden">
                                    {dayCountLabel(d, false)}
                                </span>
                            )}
                            <span
                                className={cn(
                                    "mt-0.5 block text-[11px]",
                                    !compact && "min-[700px]:hidden",
                                )}
                            >
                                {dayCountLabel(d, true)}
                            </span>
                        </button>
                    );
                })}
            </div>
            {!day ? (
                <div className="mt-3">
                    <p className="text-site-body text-sm">
                        {asked
                            ? `Nothing free with ${asked.name} in these two weeks. `
                            : weeks.skip > 0
                              ? "Nothing free in these two weeks. "
                              : "Nothing free in the next two weeks. "}
                        Get in touch with {business} and they&apos;ll fit you
                        in.
                    </p>
                    <ReachLinks reach={reach} className="mt-1" />
                </div>
            ) : (
                <div className="border-site-border mt-[18px] border-t pt-4">
                    <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="font-site-heading text-site-fg text-base font-semibold tracking-[-0.01em]">
                            {dayHeading(day.date)}
                        </h3>
                        <span className="text-site-muted text-[12.5px]">
                            {count} {count === 1 ? "time" : "times"} free
                            {onlyOne ? ` with ${onlyOne}` : ""}
                        </span>
                    </div>
                    <div className="mt-3 grid gap-3.5">
                        {groupStarts(day.starts, zone).map((g) => (
                            <div
                                key={g.label}
                                role="radiogroup"
                                aria-label={g.label}
                                className="flex flex-wrap items-baseline gap-x-2.5 gap-y-2"
                            >
                                <span className="text-site-body flex-[0_0_84px] text-[13px] font-semibold max-[699px]:flex-[1_0_100%]">
                                    {g.label}
                                </span>
                                <div className="grid min-w-0 flex-[1_1_240px] grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
                                    {g.starts.map((s) => {
                                        const on =
                                            chosen?.startAt === s.startAt;
                                        const t = timeWords(s.startAt, zone);
                                        return (
                                            <button
                                                key={s.startAt}
                                                type="button"
                                                role="radio"
                                                aria-checked={on}
                                                aria-label={
                                                    s.staffName
                                                        ? `${t} with ${s.staffName}`
                                                        : t
                                                }
                                                onClick={() => onStart(s)}
                                                className={
                                                    lk
                                                        ? cn(
                                                              "cursor-pointer whitespace-nowrap tabular-nums transition-[color,background-color,border-color,box-shadow] duration-100 ease-out",
                                                              focusRing,
                                                              lk.chip,
                                                              on
                                                                  ? lk.chipOn
                                                                  : lk.chipOff,
                                                          )
                                                        : cn(
                                                              "h-[45px] cursor-pointer whitespace-nowrap rounded-[calc(var(--site-radius)+7px)] border text-[15px] font-semibold tabular-nums transition-[color,background-color,border-color,transform] duration-100 ease-out active:scale-[0.97]",
                                                              focusRing,
                                                              on
                                                                  ? "border-site-fg bg-site-fg text-site-bg"
                                                                  : "border-site-border bg-site-surface text-site-fg hover:border-site-fg",
                                                          )
                                                }
                                            >
                                                {t}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {staff.length > 1 && !asked ? (
                <p className="text-site-body mt-2.5 text-sm">
                    Times are with whoever is free. You&apos;ll see who before
                    you confirm.
                </p>
            ) : null}
            <WeeksButtons weeks={weeks} className="mt-3" />
        </>
    );
}
