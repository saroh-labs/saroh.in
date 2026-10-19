"use client";

import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
} from "@/components/shared/form-sheet";
import { Refusal } from "@/components/shared/refusal";
import { formatClock, formatWeekday } from "@/lib/format/datetime";
import { cn } from "@saroh/ui/lib/utils";
import { showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ChipGroup, RadioCards } from "@/components/shared/choice-group";
import { runAction } from "@/lib/api/run-action";
import { firstName } from "@/lib/names";
import type { Block, LocalDate, Span } from "@/lib/services/diary";
import { weekdayOf } from "@/lib/services/diary";
import {
    addExtraHours,
    removeExtraHours,
    replaceStaffHours,
} from "@/lib/staff/actions";
import type { StaffView } from "@/lib/staff/types";

import {
    bookingsIn,
    closedRun,
    dayText,
    onTheDay,
    openLengths,
    openStart,
    rangeOf,
    withoutRange,
} from "./open-hours-words";
import { Eyebrow } from "./parts";

export interface HoursTarget {
    staff: StaffView;
    date: LocalDate;
    /** Minutes from midnight it starts at: the half hour pressed. */
    from: number;
    /** The person's working windows that day, and their blocks. */
    windows: Span[];
    blocks: Block[];
}

/**
 * Open closed time (U10, #1026; BKMOpenHours on a phone, BKDOpenHours on
 * the desk): a bottom sheet on a phone and a right-hand panel at a desk.
 * It opens from closed time — the Day's "Closed · click to open" at the
 * half hour pressed (the keyboard: the hour before opening, else when it
 * closes), the Week's and the List's "Open hours on this day" — and asks
 * how long from then, and whether just this day (extra opening hours) or
 * every such weekday (the weekly hours). One button saves, with Undo;
 * Hours and time off edits the same hours. A refusal keeps the choice and
 * says why in the sheet.
 *
 * Blocking free time is the free-time sheet's "Block this time" (U9,
 * `gap-actions.ts`): the one block path, so this sheet has no block of its
 * own. Only for someone who may change hours (`hours:write`: an owner, an
 * admin, a Member since DEC-170); the calendar never offers it to Calendar
 * only.
 */
export function OpenHoursDialog({
    target,
    today,
    onClose,
}: {
    target: HoursTarget | null;
    /** Today in the business's zone, for the toast's ", today.". */
    today: LocalDate;
    onClose: () => void;
}) {
    return (
        <FormSheet
            open={target !== null}
            bottomOnPhone
            title={
                target
                    ? `Open ${firstName(target.staff.name)}'s closed time`
                    : ""
            }
            description={
                target ? `${target.staff.name} · ${dayText(target.date)}` : ""
            }
            onClose={onClose}
        >
            {target ? (
                <Form
                    key={`${target.staff.id}${target.date}${target.from}`}
                    target={target}
                    today={today}
                    onClose={onClose}
                />
            ) : null}
        </FormSheet>
    );
}

function Form({
    target,
    today,
    onClose,
}: {
    target: HoursTarget;
    today: LocalDate;
    onClose: () => void;
}) {
    const router = useRouter();
    const ids = { len: useId(), repeat: useId() };
    const { staff, date, from, windows, blocks } = target;
    const who = firstName(staff.name);
    const lengths = openLengths(from, windows);
    const [len, setLen] = useState(() => openStart(lengths));
    const [scope, setScope] = useState<"day" | "week">("day");
    const [saving, setSaving] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);
    const to = Math.min(from + len, 1440);
    const range = rangeOf(from, len);
    const weekday = formatWeekday(date, "UTC");

    const works = closedRun(from, windows).room === 0;
    const weeklyClash =
        scope === "week" &&
        staff.hours.some(
            (h) =>
                h.dayOfWeek === weekdayOf(date) &&
                from < h.endMinute &&
                h.startMinute < to,
        );
    // What stops a save, said at once in place of the note.
    const problem = works
        ? `${who} already works at ${formatClock(from)}, so customers can book it now. Change hours on Hours and time off.`
        : weeklyClash
          ? `${who} already works part of ${range} every ${weekday}. Pick a shorter time, or change hours on Hours and time off.`
          : null;
    const booked = bookingsIn(blocks, from, to);
    const note = booked
        ? `${booked} Customers can book the rest.`
        : `Customers can book the time you open, the same as ${who}'s other hours.`;

    const choose =
        <T,>(set: (v: T) => void) =>
        (v: T) => {
            set(v);
            setRefusal(null);
        };

    async function save() {
        if (problem || saving) return;
        setRefusal(null);
        if (scope === "week") {
            const before = staff.hours;
            const res = await runAction(
                () =>
                    replaceStaffHours(staff.id, [
                        ...before,
                        {
                            dayOfWeek: weekdayOf(date),
                            startMinute: from,
                            endMinute: to,
                        },
                    ]),
                { setBusy: setSaving },
            );
            if (!res) return;
            if (!res.ok) return setRefusal(res.error);
            // The week as saved, without the range just added: Undo takes
            // back only that, never a change made to the week since the
            // sheet opened.
            const saved = res.data.staff.hours;
            onClose();
            router.refresh();
            showUndo(
                `Opened ${range} for ${who}, every ${weekday}.`,
                async () => {
                    const back = await replaceStaffHours(
                        staff.id,
                        withoutRange(saved, weekdayOf(date), from, to),
                    );
                    router.refresh();
                    return back;
                },
            );
            return;
        }
        const res = await runAction(
            () =>
                addExtraHours(staff.id, {
                    date,
                    startMinute: from,
                    endMinute: to,
                }),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok) return setRefusal(res.error);
        const added = res.data.extraHours.find(
            (x) =>
                x.date.slice(0, 10) === date &&
                x.startMinute === from &&
                x.endMinute === to,
        );
        onClose();
        router.refresh();
        showUndo(
            `Opened ${range} for ${who}${onTheDay(date, today)}`,
            async () => {
                if (!added) return false;
                const back = await removeExtraHours(staff.id, added.id);
                router.refresh();
                return back;
            },
        );
    }

    return (
        <>
            <FormSheetBody className="gap-4">
                <div className="grid gap-2">
                    <Eyebrow id={ids.len}>
                        How long, from {formatClock(from)}
                    </Eyebrow>
                    <ChipGroup
                        labelledBy={ids.len}
                        value={String(len)}
                        onChange={choose((m: string) => setLen(Number(m)))}
                        choices={lengths.map((l) => ({
                            value: String(l.minutes),
                            label: l.label,
                        }))}
                    />
                    {/* Drawn as the calendar draws free time. */}
                    <p
                        data-range=""
                        className="mt-1 rounded-[10px] border-[1.5px] border-dashed border-success/50 bg-success-subtle px-3.5 py-3 text-[15px] font-semibold tabular-nums text-foreground"
                    >
                        Open · {range}
                    </p>
                </div>
                <div className="grid gap-2">
                    <Eyebrow id={ids.repeat}>Repeat</Eyebrow>
                    <RadioCards
                        labelledBy={ids.repeat}
                        value={scope}
                        onChange={choose(setScope)}
                        options={[
                            {
                                value: "day",
                                label: `Just ${dayText(date)}`,
                                note: `${who}'s weekly hours stay the same.`,
                            },
                            {
                                value: "week",
                                label: `Every ${weekday}`,
                                note: `Adds it to ${who}'s weekly hours.`,
                            },
                        ]}
                    />
                </div>
                {/* One message at a time: a refusal, else a problem, else
                    what opening does. */}
                {refusal ? (
                    <Refusal>{refusal}</Refusal>
                ) : (
                    <p
                        role={problem ? "alert" : undefined}
                        data-ph-mask={booked && !problem ? "" : undefined}
                        className={cn(
                            "text-[12.5px] leading-[1.5]",
                            problem
                                ? "text-destructive-subtle-foreground"
                                : "text-muted-foreground",
                        )}
                    >
                        {problem ?? note}
                    </p>
                )}
            </FormSheetBody>
            <FormSheetFoot
                saveLabel={`Open ${range}`}
                savingLabel="Opening…"
                pending={saving}
                onSubmit={save}
            />
        </>
    );
}
