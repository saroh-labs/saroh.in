"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Switch } from "@saroh/ui/switch";
import { Plus, X } from "lucide-react";
import { useId, useState } from "react";

import { firstName } from "@/lib/names";
import { openingNote } from "@/lib/services/in-person-hours";
import type { DayPlan, Span } from "@/lib/staff/day-plan";
import {
    dayName,
    dayWords,
    lunchFor,
    nextShift,
    planOf,
    planRefusal,
    rangesOfPlan,
    rangesOn,
    spanWords,
    withDay,
    withDays,
} from "@/lib/staff/day-plan";
import { startingDay } from "@/lib/staff/starting-week";
import type { WeeklyRange } from "@/lib/staff/types";

import { AlsoUse } from "./also-use";
import { ClockRow, FIELD_ROW } from "./clock-select";
import { PanelGroup } from "./hours-panel";

/** What a day's change saves, and what its toasts say. */
export type SaveWeek = (
    next: WeeklyRange[],
    words: { done: string; failed: string },
) => Promise<boolean>;

type PickKey =
    | "opens"
    | "closes"
    | "lunchFrom"
    | "lunchTo"
    | `shift${number}from`
    | `shift${number}to`;

/**
 * One person's day (U17, BKMHoursV2Day, BKDHours "a day: Monday"): "Open
 * on Monday", when it opens and closes, a lunch break, another shift for a
 * split day, and "Also use these hours on" for other days. Every change
 * saves the week at once with a toast and Undo (`onSave`); a time that
 * can't stand (closing before it opens, lunch outside the day) is said
 * under it and not saved until it can. A day switched off and on again
 * gets back the hours it had while the sheet is open, else the usual ones.
 */
export function DayEditor({
    person,
    day,
    hours,
    opening,
    onSave,
}: {
    person: string;
    day: number;
    /** The person's whole week as it stands. */
    hours: WeeklyRange[];
    opening: WeeklyRange[] | null;
    onSave: SaveWeek;
}) {
    const id = useId();
    const name = dayName(day);
    const who = firstName(person);
    const saved = rangesOn(hours, day);
    const [draft, setDraft] = useState<DayPlan | null>(null);
    const [pick, setPick] = useState<PickKey | null>(null);
    const [parked, setParked] = useState<Span[] | null>(null);
    const [openShift, setOpenShift] = useState<number | null>(null);
    // "Add another shift" with no room left after the day ends.
    const [noRoom, setNoRoom] = useState(false);
    const plan = draft ?? planOf(saved);
    const problem = draft ? planRefusal(draft) : null;
    const failed = dayWords.failed(name, person);

    async function change(next: DayPlan, done: string) {
        setNoRoom(false);
        setDraft(next);
        if (planRefusal(next)) return;
        await onSave(withDay(hours, day, rangesOfPlan(next)), {
            done,
            failed,
        });
        setDraft(null);
    }

    async function flipOpen(on: boolean) {
        setPick(null);
        setDraft(null);
        if (!on) {
            setParked(saved);
            await onSave(withDay(hours, day, []), {
                done: dayWords.closed(name, person),
                failed,
            });
            return;
        }
        await onSave(
            withDay(
                hours,
                day,
                parked?.length ? parked : startingDay(opening, day),
            ),
            { done: dayWords.opened(name, person), failed },
        );
    }

    const time = (
        key: PickKey,
        label: string,
        value: number,
        set: (m: number) => DayPlan,
        what: string,
        upTo = false,
        indent = false,
    ) => (
        <ClockRow
            key={key}
            label={label}
            value={value}
            open={pick === key}
            onToggle={() => setPick(pick === key ? null : key)}
            upTo={upTo}
            indent={indent}
            onPick={(m) => void change(set(m), dayWords.time(name, what, m))}
        />
    );

    const lunch = plan.lunch;
    const note = openingNote(rangesOfPlan(plan), opening, day);

    return (
        <div>
            <PanelGroup className="mt-1">
                <div className={FIELD_ROW}>
                    <span id={`${id}-open`} className="flex-1">
                        Open on {name}
                    </span>
                    <Switch
                        checked={plan.open}
                        aria-labelledby={`${id}-open`}
                        onCheckedChange={(on) => void flipOpen(on)}
                    />
                </div>
            </PanelGroup>

            {plan.open ? (
                <>
                    <PanelGroup>
                        {time(
                            "opens",
                            "Opens",
                            plan.opens,
                            (m) => ({ ...plan, opens: m }),
                            "opens",
                        )}
                        {time(
                            "closes",
                            "Closes",
                            plan.closes,
                            (m) => ({ ...plan, closes: m }),
                            "closes",
                            true,
                        )}
                    </PanelGroup>

                    <PanelGroup>
                        <div className={FIELD_ROW}>
                            <span id={`${id}-lunch`} className="flex-1">
                                Lunch break
                            </span>
                            <Switch
                                checked={Boolean(lunch)}
                                aria-labelledby={`${id}-lunch`}
                                onCheckedChange={(on) => {
                                    setPick(null);
                                    const l = lunchFor(plan);
                                    void change(
                                        { ...plan, lunch: on ? l : null },
                                        on
                                            ? dayWords.lunchOn(l.from, l.to)
                                            : dayWords.lunchOff(),
                                    );
                                }}
                            />
                        </div>
                        {lunch ? (
                            <>
                                {time(
                                    "lunchFrom",
                                    "From",
                                    lunch.from,
                                    (m) => ({
                                        ...plan,
                                        lunch: { ...lunch, from: m },
                                    }),
                                    "lunch starts",
                                    false,
                                    true,
                                )}
                                {time(
                                    "lunchTo",
                                    "To",
                                    lunch.to,
                                    (m) => ({
                                        ...plan,
                                        lunch: { ...lunch, to: m },
                                    }),
                                    "lunch ends",
                                    true,
                                    true,
                                )}
                            </>
                        ) : null}
                    </PanelGroup>

                    <PanelGroup>
                        {plan.shifts.map((s, i) => {
                            const text = spanWords(s.startMinute, s.endMinute);
                            const setShift = (
                                patch: Partial<Span>,
                            ): DayPlan => ({
                                ...plan,
                                shifts: plan.shifts.map((x, j) =>
                                    j === i ? { ...x, ...patch } : x,
                                ),
                            });
                            return (
                                <div
                                    key={`${s.startMinute}-${i}`}
                                    className="contents"
                                >
                                    <div className={cn(FIELD_ROW, "pr-1")}>
                                        <button
                                            type="button"
                                            aria-expanded={openShift === i}
                                            onClick={() =>
                                                setOpenShift(
                                                    openShift === i ? null : i,
                                                )
                                            }
                                            className="min-h-[52px] flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                        >
                                            <span className="block text-[12.5px] text-muted-foreground">
                                                Another shift
                                            </span>
                                            <span className="tabular-nums">
                                                {text}
                                            </span>
                                        </button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Remove the ${text} shift`}
                                            className="size-11"
                                            onClick={() => {
                                                setOpenShift(null);
                                                void change(
                                                    {
                                                        ...plan,
                                                        shifts: plan.shifts.filter(
                                                            (_, j) => j !== i,
                                                        ),
                                                    },
                                                    dayWords.shiftOff(),
                                                );
                                            }}
                                        >
                                            <X aria-hidden className="size-4" />
                                        </Button>
                                    </div>
                                    {openShift === i ? (
                                        <>
                                            {time(
                                                `shift${i}from`,
                                                "From",
                                                s.startMinute,
                                                (m) =>
                                                    setShift({
                                                        startMinute: m,
                                                    }),
                                                "other shift starts",
                                                false,
                                                true,
                                            )}
                                            {time(
                                                `shift${i}to`,
                                                "To",
                                                s.endMinute,
                                                (m) =>
                                                    setShift({ endMinute: m }),
                                                "other shift ends",
                                                true,
                                                true,
                                            )}
                                        </>
                                    ) : null}
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            onClick={() => {
                                const s = nextShift(plan);
                                setPick(null);
                                if (!s) {
                                    setNoRoom(true);
                                    return;
                                }
                                void change(
                                    { ...plan, shifts: [...plan.shifts, s] },
                                    dayWords.shiftOn(s),
                                );
                            }}
                            className="flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 bg-card px-3.5 text-left text-[15px] font-semibold hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                            <Plus aria-hidden className="size-[18px]" />
                            <span className="flex-1">
                                Add another shift
                                <span className="block text-[12.5px] font-normal text-muted-foreground">
                                    For a split day, like mornings and evenings
                                </span>
                            </span>
                        </button>
                    </PanelGroup>
                    {problem ? (
                        <p
                            role="alert"
                            className="mt-2 text-[12.5px] font-medium text-destructive-subtle-foreground"
                        >
                            {problem} It isn&apos;t saved yet.
                        </p>
                    ) : null}
                    {noRoom ? (
                        <p
                            role="alert"
                            className="mt-2 text-[12.5px] font-medium text-destructive-subtle-foreground"
                        >
                            There&apos;s no room for another shift after this
                            day&apos;s hours.
                        </p>
                    ) : null}
                    {note ? (
                        <p className="mt-2.5 text-pretty text-[12.5px] text-muted-foreground">
                            {note}
                        </p>
                    ) : null}
                </>
            ) : (
                <p className="mt-2.5 text-[12.5px] leading-normal text-muted-foreground">
                    Customers can&apos;t book {who} on {name}s. Turn it on to
                    set hours.
                </p>
            )}

            <AlsoUse
                day={day}
                onUse={(days) =>
                    onSave(withDays(hours, days, rangesOn(hours, day)), {
                        done: dayWords.copied(name, days.length),
                        failed,
                    })
                }
            />
            <p className="mt-3.5 text-[12.5px] leading-normal text-muted-foreground">
                Bookings already made are never moved.
            </p>
        </div>
    );
}
