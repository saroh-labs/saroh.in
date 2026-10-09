"use client";

import { Button } from "@saroh/ui/button";
import { Switch } from "@saroh/ui/switch";
import { formatTime, TimeSelect } from "@saroh/ui/time-select";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import { useState } from "react";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import { HOURS_FIELD_ID } from "@/lib/stores/location-readiness";
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
const DEFAULT_WEEK: OpeningHoursDay[] = DAYS.map(({ key }) => ({
    day: key,
    open: "09:00",
    close: "18:00",
    closed: key === "SUN",
}));

const SHORT: Record<Weekday, string> = {
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
    SUN: "Sun",
};

const PRESETS: { label: string; days: Weekday[] }[] = [
    { label: "Mon–Fri", days: ["MON", "TUE", "WED", "THU", "FRI"] },
    { label: "Mon–Sat", days: ["MON", "TUE", "WED", "THU", "FRI", "SAT"] },
    { label: "Every day", days: DAYS.map((d) => d.key) },
];

const sameHours = (a: OpeningHoursDay, b: OpeningHoursDay) =>
    a.closed === b.closed &&
    (a.closed || (a.open === b.open && a.close === b.close));

/**
 * "Mon–Sat 9:00 AM – 6:00 PM · Sun closed": runs of neighbouring days with
 * the same hours, the way a shop writes them on its door.
 */
function summarise(week: OpeningHoursDay[]): string {
    const runs: { from: number; to: number; day: OpeningHoursDay }[] = [];
    week.forEach((day, i) => {
        const last = runs.at(-1);
        if (last?.to === i - 1 && sameHours(last.day, day)) {
            last.to = i;
        } else {
            runs.push({ from: i, to: i, day });
        }
    });
    return runs
        .map(({ from, to, day }) => {
            const a = SHORT[week[from]?.day ?? "MON"];
            const b = SHORT[week[to]?.day ?? "MON"];
            const days = from === to ? a : `${a}–${b}`;
            return day.closed
                ? `${days} closed`
                : `${days} ${formatTime(day.open)} – ${formatTime(day.close)}`;
        })
        .join(" · ");
}

/** Every open day on the same hours — the case for almost every shop. */
function isUniform(week: OpeningHoursDay[]): boolean {
    const open = week.filter((d) => !d.closed);
    return open.every(
        (d) => d.open === open[0]?.open && d.close === open[0]?.close,
    );
}

/**
 * A shop's week, set the way a shop thinks about it: which days it opens and
 * the hours it keeps, once. Only a shop whose Saturday (say) runs short opens
 * the day-by-day list — and it starts there if its saved week already does.
 * Either way what is saved is the full seven days, so the receipt reads the
 * same.
 */
export function OpeningHours({
    saved,
    canEdit,
    pending,
    onSave,
}: {
    saved: OpeningHoursDay[] | null;
    canEdit: boolean;
    pending: boolean;
    onSave: (week: OpeningHoursDay[]) => void;
}) {
    const initial = saved ?? DEFAULT_WEEK;
    const [week, setWeek] = useState<OpeningHoursDay[]>(initial);
    const [eachDay, setEachDay] = useState(!isUniform(initial));
    const dirty = JSON.stringify(week) !== JSON.stringify(initial);
    const backwards = week.some((d) => !d.closed && d.open >= d.close);

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
        <form
            id={HOURS_FIELD_ID}
            className="grid scroll-mt-20 gap-3"
            onSubmit={(e) => {
                e.preventDefault();
                if (!backwards) onSave(week);
            }}
        >
            <div>
                <p id="storefront-hours-label" className="text-sm font-medium">
                    Opening hours
                </p>
                {/* The controls already say it in the simple case; the line
                    earns its place when the week is day-by-day, or when it
                    is all a viewer who cannot edit gets to see. */}
                {eachDay || !canEdit ? (
                    <p className="mt-0.5 text-[12.5px] tabular-nums text-muted-foreground">
                        {openDays.length === 0
                            ? "Closed every day"
                            : summarise(week)}
                    </p>
                ) : null}
            </div>

            {eachDay ? (
                <div
                    role="group"
                    aria-labelledby="storefront-hours-label"
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
                                        disabled={!canEdit}
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
                                            disabled={!canEdit}
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
                                            disabled={!canEdit}
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
                    <div className="grid gap-2">
                        {/* One control for "which days" — the same segmented
                            style as Customers visit / No counter. The chips only
                            appear for Custom, so the common answer is one
                            click and the rare one is still there. */}
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
                            disabled={!canEdit}
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
                                disabled={!canEdit}
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
                                        {SHORT[d.key]}
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
                                disabled={!canEdit}
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
                                disabled={!canEdit}
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

            {canEdit ? (
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
            ) : null}

            <Note>
                {backwards
                    ? "A day has to close after it opens."
                    : saved
                      ? "Shown on the receipt, in the location's own time."
                      : canEdit
                        ? "Not saved yet: a starting week. Save it to show it on receipts."
                        : "Not saved yet, so receipts show no hours."}
            </Note>
            {canEdit && (dirty || !saved) ? (
                <Button
                    type="submit"
                    disabled={pending || backwards}
                    className="w-fit"
                >
                    Save hours
                </Button>
            ) : null}
        </form>
    );
}
