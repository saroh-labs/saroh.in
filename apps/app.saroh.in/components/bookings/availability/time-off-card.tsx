"use client";

import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import type { NewOff } from "@/lib/services/availability-rules";
import type { LocalDate } from "@/lib/services/diary";
import { previewOff } from "@/lib/staff/actions";
import type { OffLine } from "@/lib/staff/time-off";
import {
    dayCount,
    offButtonLabel,
    offLineLabel,
    offLines,
    offNote,
} from "@/lib/staff/time-off";
import type { Closure, StaffView } from "@/lib/staff/types";

import { ClockSelect } from "./clock-select";

const card = "rounded-[12px] border border-border bg-card px-4 py-[13px]";
const cardTitle = "font-display text-[15px] font-semibold tracking-[-0.02em]";
const fieldLabel = "grid gap-[3px] text-[11.5px] text-muted-foreground";

/** "YYYY-MM-DD" as the picker's local Date, and back. */
function toPicker(date: LocalDate): Date {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
}
function fromPicker(date: Date): LocalDate {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Availability's Time off card (E3, the Bookings design): the person's time
 * off and the business's closures as one line each, and a form for a range
 * of days — all day or part of the day, for them or "Everyone — business
 * closed". Before adding, it asks the API what bookings fall in that time
 * and says so; they are kept. Adds and removals are part of the screen's
 * draft until "Save hours".
 */
export function TimeOffCard({
    me,
    closures,
    timezone,
    today,
    canEdit,
    offAdded,
    offRemoved,
    onAdd,
    onRemoveSaved,
    onRemoveNew,
}: {
    me: StaffView;
    closures: Closure[];
    timezone: string;
    today: LocalDate;
    canEdit: boolean;
    offAdded: NewOff[];
    offRemoved: string[];
    onAdd: (off: Omit<NewOff, "key">) => void;
    onRemoveSaved: (ids: string[]) => void;
    onRemoveNew: (key: string) => void;
}) {
    const id = useId();
    const [fromDate, setFromDate] = useState<LocalDate>(() =>
        new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
            .toISOString()
            .slice(0, 10),
    );
    const [toDateRaw, setToDate] = useState<LocalDate | null>(null);
    const [part, setPart] = useState<"day" | "hours">("day");
    const [startMinute, setStartMinute] = useState(13 * 60);
    const [endMinute, setEndMinute] = useState(17 * 60);
    const [who, setWho] = useState<"me" | "all">("me");
    const [why, setWhy] = useState("");
    const [taken, setTaken] = useState<number | null>(0);

    const lastDay = `${today.slice(0, 4)}-12-31`;
    const toDate = toDateRaw && toDateRaw >= fromDate ? toDateRaw : fromDate;
    const days = dayCount(fromDate, toDate);
    const closed = who === "all";
    const hours = part === "hours";
    const refusal =
        hours && endMinute <= startMinute
            ? "The end has to be after the start."
            : null;

    // What already falls in that time — asked of the API, a moment after
    // the form settles. Past lines are history, not something to manage.
    useEffect(() => {
        if (!canEdit || refusal) return;
        let live = true;
        const timer = setTimeout(() => {
            void previewOff({
                fromDate,
                toDate,
                ...(hours ? { startMinute, endMinute } : {}),
                ...(closed ? {} : { staffId: me.id }),
            }).then((res) => {
                if (live) setTaken(res.ok ? res.data.affected.length : null);
            });
        }, 250);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [
        canEdit,
        refusal,
        fromDate,
        toDate,
        hours,
        startMinute,
        endMinute,
        closed,
        me.id,
    ]);

    const current = (line: OffLine) =>
        line.toDate >= today && !line.ids.some((x) => offRemoved.includes(x));
    const saved = [
        ...offLines(me.timeOff, timezone, false),
        ...offLines(closures, timezone, true),
    ]
        .filter(current)
        .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
    const pending = offAdded.filter(
        (o) => o.staffId === null || o.staffId === me.id,
    );
    const note = offNote({ refusal, taken, closed });

    function add() {
        if (refusal) return;
        onAdd({
            staffId: closed ? null : me.id,
            fromDate,
            toDate,
            startMinute: hours ? startMinute : null,
            endMinute: hours ? endMinute : null,
            reason: why.trim() || (closed ? "Closed" : ""),
        });
        setWhy("");
        setToDate(null);
    }

    return (
        <section aria-labelledby={`${id}-title`} className={card}>
            <h2 id={`${id}-title`} className={cn(cardTitle, "mb-2")}>
                Time off
            </h2>
            <ul>
                {saved.map((line) => (
                    <OffRow
                        key={line.ids[0]}
                        when={offLineLabel(line)}
                        why={line.reason ?? "No reason given"}
                        canEdit={canEdit}
                        onRemove={() => onRemoveSaved(line.ids)}
                    />
                ))}
                {pending.map((o) => (
                    <OffRow
                        key={o.key}
                        when={offLineLabel({
                            fromDate: o.fromDate,
                            toDate: o.toDate,
                            days: dayCount(o.fromDate, o.toDate),
                            startMinute: o.startMinute,
                            endMinute: o.endMinute,
                            closed: o.staffId === null,
                        })}
                        why={`${o.reason === "" ? "No reason given" : o.reason} · not saved yet`}
                        canEdit={canEdit}
                        onRemove={() => onRemoveNew(o.key)}
                    />
                ))}
            </ul>
            {!saved.length && !pending.length ? (
                <p className="text-[12.5px] text-muted-foreground">
                    None booked.
                </p>
            ) : null}
            {canEdit ? (
                <>
                    <div className="mt-2.5 flex flex-wrap items-end gap-1.5">
                        <label className={fieldLabel}>
                            From
                            <DatePicker
                                aria-label="From"
                                value={toPicker(fromDate)}
                                onValueChange={(d) => {
                                    if (d) setFromDate(fromPicker(d));
                                }}
                                disabledDays={{
                                    before: toPicker(today),
                                    after: toPicker(lastDay),
                                }}
                                className="h-8 w-[9.5rem] rounded-[8px] text-[12.5px] coarse:h-11"
                            />
                        </label>
                        <label className={fieldLabel}>
                            To
                            <DatePicker
                                aria-label="To"
                                value={toPicker(toDate)}
                                onValueChange={(d) => {
                                    if (d) setToDate(fromPicker(d));
                                }}
                                disabledDays={{
                                    before: toPicker(fromDate),
                                    after: toPicker(lastDay),
                                }}
                                className="h-8 w-[9.5rem] rounded-[8px] text-[12.5px] coarse:h-11"
                            />
                        </label>
                        <label className={fieldLabel}>
                            When
                            <OptionSelect
                                aria-label="When"
                                value={part}
                                onValueChange={setPart}
                                className="h-8 w-auto rounded-[8px] text-[12.5px]"
                                options={[
                                    { value: "day", label: "All day" },
                                    {
                                        value: "hours",
                                        label: "Part of the day",
                                    },
                                ]}
                            />
                        </label>
                        {hours ? (
                            <>
                                <div className={fieldLabel}>
                                    From
                                    <ClockSelect
                                        label="From time"
                                        value={startMinute}
                                        onChange={setStartMinute}
                                    />
                                </div>
                                <div className={fieldLabel}>
                                    Until
                                    <ClockSelect
                                        label="Until"
                                        value={endMinute}
                                        onChange={setEndMinute}
                                        upTo
                                    />
                                </div>
                            </>
                        ) : null}
                        <label className={fieldLabel}>
                            Who
                            <OptionSelect
                                aria-label="Who"
                                value={who}
                                onValueChange={setWho}
                                className="h-8 w-auto rounded-[8px] text-[12.5px]"
                                options={[
                                    { value: "me", label: `Just ${me.name}` },
                                    {
                                        value: "all",
                                        label: "Everyone — business closed",
                                    },
                                ]}
                            />
                        </label>
                        <Input
                            aria-label="Reason (team only)"
                            placeholder="Reason — team only"
                            value={why}
                            onChange={(e) => setWhy(e.target.value)}
                            className="h-8 min-w-0 flex-[1_1_120px] rounded-[8px] text-[12.5px]"
                        />
                        <Button
                            variant="outline"
                            className="h-8 rounded-[8px] px-3 text-[12.5px] coarse:h-11"
                            disabled={refusal !== null}
                            onClick={add}
                        >
                            {offButtonLabel({
                                days,
                                closed,
                                partOfDay: hours,
                            })}
                        </Button>
                    </div>
                    <p
                        role={note.tone === "danger" ? "alert" : undefined}
                        className={cn(
                            "mt-[7px] text-[11.5px]",
                            note.tone === "danger"
                                ? "text-destructive-subtle-foreground"
                                : note.tone === "warn"
                                  ? "text-brand-subtle-foreground"
                                  : "text-muted-foreground",
                        )}
                    >
                        {note.text}
                    </p>
                </>
            ) : null}
        </section>
    );
}

export function OffRow({
    when,
    why,
    warn = false,
    canEdit,
    onRemove,
    removeLabel = "Remove this time off",
}: {
    when: string;
    why: string | null;
    warn?: boolean;
    canEdit: boolean;
    onRemove: () => void;
    removeLabel?: string;
}) {
    return (
        <li className="flex items-center gap-2 border-t border-border/60 py-[7px]">
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">{when}</div>
                {why ? (
                    <div
                        className={cn(
                            "text-[12px]",
                            warn
                                ? "text-brand-subtle-foreground"
                                : "text-muted-foreground",
                        )}
                    >
                        {why}
                    </div>
                ) : null}
            </div>
            {canEdit ? (
                <button
                    type="button"
                    aria-label={removeLabel}
                    onClick={onRemove}
                    className="grid size-8 place-items-center rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:size-11"
                >
                    <X aria-hidden className="size-4" />
                </button>
            ) : null}
        </li>
    );
}
