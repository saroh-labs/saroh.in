"use client";

import { Button } from "@saroh/ui/button";
import { Switch } from "@saroh/ui/switch";
import { TimeSelect } from "@saroh/ui/time-select";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import { HOURS_FIELD_ID } from "@/lib/stores/location-readiness";
import {
    hoursBackwards,
    isUniform,
    SHORT_DAY,
    weekSummary,
} from "@/lib/stores/opening-hours-summary";
import type { OpeningHoursDay, Weekday } from "@/lib/stores/storefronts";

import { Note } from "./storefront-section";

const DAYS: { key: Weekday; label: string }[] = [
    { key: "MON", label: "Monday" },
    { key: "TUE", label: "Tuesday" },
    { key: "WED", label: "Wednesday" },
    { key: "THU", label: "Thursday" },
    { key: "FRI", label: "Friday" },
    { key: "SAT", label: "Saturday" },
    { key: "SUN", label: "Sunday" },
];

/** A week to start from when a shop has never saved one. */
export const DEFAULT_WEEK: OpeningHoursDay[] = DAYS.map(({ key }) => ({
    day: key,
    open: "09:00",
    close: "18:00",
    closed: key === "SUN",
}));

const PRESETS: { label: string; days: Weekday[] }[] = [
    { label: "Mon–Fri", days: ["MON", "TUE", "WED", "THU", "FRI"] },
    { label: "Mon–Sat", days: ["MON", "TUE", "WED", "THU", "FRI", "SAT"] },
    { label: "Every day", days: DAYS.map((d) => d.key) },
];

/**
 * A shop's week, set the way a shop thinks about it: which days it opens and
 * the hours it keeps, once. Only a shop whose Saturday (say) runs short opens
 * the day-by-day list — and it starts there if its saved week already does.
 * Either way what is saved is the full seven days, so the receipt reads the
 * same.
 *
 * The fields alone: the week is the caller's draft and so is its Save (the
 * "Opening hours" sheet's footer, in The place).
 */
export function OpeningHoursFields({
    week,
    setWeek,
    saved,
}: {
    week: OpeningHoursDay[];
    setWeek: Dispatch<SetStateAction<OpeningHoursDay[]>>;
    /** Whether a week has ever been saved, for the note under the fields. */
    saved: boolean;
}) {
    const [eachDay, setEachDay] = useState(() => !isUniform(week));
    const backwards = hoursBackwards(week);

    const openDays = week.filter((d) => !d.closed).map((d) => d.day);
    const preset = PRESETS.find(
        (p) =>
            p.days.length === openDays.length &&
            p.days.every((d) => openDays.includes(d)),
    );
    // Custom is a choice, not only a state: picking it keeps the day chips
    // open even while the days happen to match a preset.
    const [custom, setCustom] = useState(!preset);
    const daysChoice = custom || !preset ? "CUSTOM" : preset.label;
    // The hours the "same" mode edits: the first open day's, or the default.
    const shared = week.find((d) => !d.closed) ?? {
        open: "09:00",
        close: "18:00",
    };

    const setOpenDays = (days: string[]) => {
        setWeek((w) =>
            w.map((d) =>
                days.includes(d.day)
                    ? {
                          ...d,
                          closed: false,
                          open: d.closed ? shared.open : d.open,
                          close: d.closed ? shared.close : d.close,
                      }
                    : { ...d, closed: true },
            ),
        );
    };
    const setSharedHours = (patch: { open?: string; close?: string }) => {
        setWeek((w) => w.map((d) => (d.closed ? d : { ...d, ...patch })));
    };
    const setDay = (i: number, patch: Partial<OpeningHoursDay>) => {
        setWeek((w) => w.map((d, j) => (j === i ? { ...d, ...patch } : d)));
    };

    return (
        <div id={HOURS_FIELD_ID} className="grid gap-3">
            {/* The controls already say it in the simple case; the line
                earns its place when the week is day-by-day. */}
            {eachDay ? (
                <p className="text-[12.5px] tabular-nums text-muted-foreground">
                    {openDays.length === 0
                        ? "Closed every day"
                        : weekSummary(week)}
                </p>
            ) : null}

            {eachDay ? (
                <div
                    role="group"
                    aria-label="Opening hours, day by day"
                    className="overflow-hidden rounded-lg border border-border"
                >
                    {week.map((d, i) => {
                        const label = DAYS[i]?.label ?? d.day;
                        const wrong = !d.closed && d.open >= d.close;
                        return (
                            <div
                                key={d.day}
                                className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2 last:border-b-0"
                            >
                                <span className="w-24 text-[13px] font-medium">
                                    {label}
                                </span>
                                <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                                    <Switch
                                        checked={!d.closed}
                                        onCheckedChange={(isOpen) => {
                                            setDay(i, { closed: !isOpen });
                                        }}
                                        aria-label={`Open on ${label}`}
                                    />
                                    <span aria-hidden className="w-11">
                                        {d.closed ? "Closed" : "Open"}
                                    </span>
                                </span>
                                {d.closed ? null : (
                                    <span className="flex items-center gap-1.5">
                                        <TimeSelect
                                            value={d.open}
                                            aria-label={`${label} opens`}
                                            aria-invalid={wrong || undefined}
                                            onValueChange={(open) => {
                                                setDay(i, { open });
                                            }}
                                        />
                                        <span
                                            aria-hidden
                                            className="text-muted-foreground"
                                        >
                                            –
                                        </span>
                                        <TimeSelect
                                            value={d.close}
                                            aria-label={`${label} closes`}
                                            aria-invalid={wrong || undefined}
                                            onValueChange={(close) => {
                                                setDay(i, { close });
                                            }}
                                        />
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="grid grid-cols-[3.5rem_1fr] items-start gap-x-4 gap-y-3">
                    <span
                        id="storefront-open-days"
                        className="pt-1.5 text-[12.5px] text-muted-foreground"
                    >
                        Days
                    </span>
                    <div className="grid min-w-0 gap-2">
                        {/* One control for "which days" — the same segmented
                            style as Yes, they visit / No, online only. The
                            chips only appear for Custom, so the common
                            answer is one click and the rare one is still
                            there. */}
                        <ToggleGroup
                            type="single"
                            value={daysChoice}
                            onValueChange={(v) => {
                                if (!v) return;
                                if (v === "CUSTOM") {
                                    setCustom(true);
                                    return;
                                }
                                const next = PRESETS.find((p) => p.label === v);
                                if (next) {
                                    setCustom(false);
                                    setOpenDays(next.days);
                                }
                            }}
                            aria-labelledby="storefront-open-days"
                            className={SEGMENTED}
                        >
                            {PRESETS.map((p) => (
                                <ToggleGroupItem
                                    key={p.label}
                                    value={p.label}
                                    className={SEGMENT}
                                >
                                    {p.label}
                                </ToggleGroupItem>
                            ))}
                            <ToggleGroupItem value="CUSTOM" className={SEGMENT}>
                                Custom
                            </ToggleGroupItem>
                        </ToggleGroup>
                        {daysChoice === "CUSTOM" ? (
                            <ToggleGroup
                                type="multiple"
                                value={openDays}
                                onValueChange={setOpenDays}
                                aria-label="Open days"
                                className="w-fit flex-wrap justify-start gap-1"
                            >
                                {DAYS.map((d) => (
                                    <ToggleGroupItem
                                        key={d.key}
                                        value={d.key}
                                        aria-label={d.label}
                                        className="h-8 w-11 rounded-md border border-border text-[12.5px] font-medium text-muted-foreground data-[state=on]:border-foreground/50 data-[state=on]:bg-muted data-[state=on]:text-foreground coarse:h-11"
                                    >
                                        {SHORT_DAY[d.key]}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        ) : null}
                    </div>

                    <span className="pt-2.5 text-[12.5px] text-muted-foreground">
                        Hours
                    </span>
                    {openDays.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <TimeSelect
                                value={shared.open}
                                aria-label="Opens"
                                aria-invalid={backwards || undefined}
                                onValueChange={(open) => {
                                    setSharedHours({ open });
                                }}
                            />
                            <span aria-hidden className="text-muted-foreground">
                                –
                            </span>
                            <TimeSelect
                                value={shared.close}
                                aria-label="Closes"
                                aria-invalid={backwards || undefined}
                                onValueChange={(close) => {
                                    setSharedHours({ close });
                                }}
                            />
                        </div>
                    ) : (
                        <p className="pt-2.5 text-[12.5px] text-muted-foreground">
                            Closed every day. Pick the days it opens.
                        </p>
                    )}
                </div>
            )}

            <Button
                type="button"
                variant="link"
                className="h-auto w-fit p-0 text-[12.5px] font-medium text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:text-foreground hover:decoration-foreground"
                onClick={() => {
                    if (eachDay) {
                        // Back to one set of hours: every open day takes
                        // the first open day's.
                        setSharedHours({
                            open: shared.open,
                            close: shared.close,
                        });
                    }
                    setEachDay(!eachDay);
                }}
            >
                {eachDay
                    ? "Use the same hours for every open day"
                    : "Some days have different hours"}
            </Button>

            {backwards ? (
                <p
                    role="alert"
                    className="text-pretty text-[12.5px] leading-[1.5] text-destructive"
                >
                    A day has to close after it opens.
                </p>
            ) : (
                <Note>
                    {saved
                        ? "Shown on the receipt, in the location's own time."
                        : "Not saved yet: a starting week. Save it to show it on receipts."}
                </Note>
            )}
        </div>
    );
}
