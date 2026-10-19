"use client";

import { Chip } from "@saroh/ui/chip";
import { Segmented } from "@saroh/ui/segmented";
import { Switch } from "@saroh/ui/switch";
import { useId, useState } from "react";

import { FormSheet } from "@/components/shared/form-sheet";
import { count } from "@/lib/format/plural";
import type { DayPlan, SeveralChoice } from "@/lib/staff/day-plan";
import { DAYS, lunchFor, planRefusal, shortDays } from "@/lib/staff/day-plan";

import { CIRCLE } from "./also-use";
import { ClockRow, FIELD_ROW } from "./clock-select";
import { PanelGroup, PanelLabel } from "./hours-panel";

type PickKey = "opens" | "closes" | "lunchFrom" | "lunchTo";

/**
 * "Change several days" (U17, BKMHoursV2Several, DEC-170 Q8 — with "Also
 * use these hours on", it replaces Copy Monday): pick the days, open or
 * closed, when they open and close, and a lunch break, then "Apply to 5
 * days" sets them all in one save with one toast and Undo. It opens from
 * the chips over the week (Mon to Fri, Sat and Sun, Choose days) and from
 * the first-time card's "Choose different hours". Nothing is saved until
 * its button; Cancel, Escape and ✕ drop it. Pressed with no day picked,
 * or with a time that can't stand, it says so and stays open.
 */
export function SeveralDaysSheet({
    open,
    onClose,
    who,
    days: startDays,
    start,
    onApply,
}: {
    open: boolean;
    onClose: () => void;
    /** Whose days, for the line under the title. */
    who: string;
    days: number[];
    /** What the times start as: the person's usual day. */
    start: SeveralChoice;
    /** Save it; answers whether it saved. */
    onApply: (days: number[], choice: SeveralChoice) => Promise<boolean>;
}) {
    const id = useId();
    const [days, setDays] = useState<number[]>(startDays);
    const [choice, setChoice] = useState<SeveralChoice>(start);
    const [pick, setPick] = useState<PickKey | null>(null);
    const [tried, setTried] = useState(false);
    const [pending, setPending] = useState(false);

    const plan: DayPlan = { ...choice, shifts: [] };
    const refusal = planRefusal(plan);
    const problem = !days.length ? "Pick at least one day." : refusal;
    const n = days.length;

    const row = (
        key: PickKey,
        label: string,
        value: number,
        set: (m: number) => SeveralChoice,
        upTo = false,
        indent = false,
    ) => (
        <ClockRow
            key={key}
            label={label}
            value={value}
            open={pick === key}
            onToggle={() => setPick(pick === key ? null : key)}
            onPick={(m) => setChoice(set(m))}
            upTo={upTo}
            indent={indent}
        />
    );

    return (
        <FormSheet
            open={open}
            bottomOnPhone
            title="Change several days"
            description={`Same hours on every day you pick, for ${who}.`}
            pending={pending}
            dirty={
                JSON.stringify([days, choice]) !==
                JSON.stringify([startDays, start])
            }
            saveLabel={n ? `Apply to ${count(n, "day")}` : "Apply"}
            savingLabel="Applying…"
            onClose={onClose}
            onSubmit={async (e) => {
                e.preventDefault();
                setTried(true);
                if (problem) return;
                setPending(true);
                try {
                    if (await onApply(days, choice)) onClose();
                } finally {
                    setPending(false);
                }
            }}
        >
            <PanelLabel id={`${id}-days`} className="mt-1">
                Days
            </PanelLabel>
            <div
                role="group"
                aria-labelledby={`${id}-days`}
                className="flex justify-between gap-1"
            >
                {DAYS.map((d) => {
                    const on = days.includes(d.day);
                    return (
                        <Chip
                            key={d.day}
                            as="toggle"
                            on={on}
                            aria-label={d.name}
                            className={CIRCLE}
                            onClick={() =>
                                setDays((x) =>
                                    on
                                        ? x.filter((y) => y !== d.day)
                                        : [...x, d.day],
                                )
                            }
                        >
                            {d.letter}
                        </Chip>
                    );
                })}
            </div>
            <Segmented
                label="Open or closed"
                block
                size="md"
                className="mt-4"
                value={choice.open ? "open" : "closed"}
                onValueChange={(v) => {
                    setPick(null);
                    setChoice({ ...choice, open: v === "open" });
                }}
                options={[
                    { value: "open", label: "Open" },
                    { value: "closed", label: "Closed" },
                ]}
            />
            {choice.open ? (
                <>
                    <PanelGroup>
                        {row("opens", "Opens", choice.opens, (m) => ({
                            ...choice,
                            opens: m,
                        }))}
                        {row(
                            "closes",
                            "Closes",
                            choice.closes,
                            (m) => ({ ...choice, closes: m }),
                            true,
                        )}
                    </PanelGroup>
                    <PanelGroup>
                        <div className={FIELD_ROW}>
                            <span id={`${id}-lunch`} className="flex-1">
                                Lunch break
                            </span>
                            <Switch
                                checked={Boolean(choice.lunch)}
                                aria-labelledby={`${id}-lunch`}
                                onCheckedChange={(on) => {
                                    setPick(null);
                                    setChoice({
                                        ...choice,
                                        lunch: on ? lunchFor(choice) : null,
                                    });
                                }}
                            />
                        </div>
                        {choice.lunch
                            ? (() => {
                                  const lunch = choice.lunch;
                                  return (
                                      <>
                                          {row(
                                              "lunchFrom",
                                              "From",
                                              lunch.from,
                                              (m) => ({
                                                  ...choice,
                                                  lunch: { ...lunch, from: m },
                                              }),
                                              false,
                                              true,
                                          )}
                                          {row(
                                              "lunchTo",
                                              "To",
                                              lunch.to,
                                              (m) => ({
                                                  ...choice,
                                                  lunch: { ...lunch, to: m },
                                              }),
                                              true,
                                              true,
                                          )}
                                      </>
                                  );
                              })()
                            : null}
                    </PanelGroup>
                </>
            ) : null}
            {tried && problem ? (
                <p
                    role="alert"
                    className="mt-3 text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    {problem}
                </p>
            ) : null}
            <p className="mt-3.5 text-pretty text-[12.5px] leading-normal text-muted-foreground">
                {n
                    ? `This replaces the hours on ${shortDays(days)}.`
                    : "Pick the days to change."}{" "}
                Bookings already made are never moved.
            </p>
        </FormSheet>
    );
}
