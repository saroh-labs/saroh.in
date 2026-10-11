"use client";

import { FormDialog, FormDialogFoot } from "@/components/shared/form-dialog";
import {
    formatClock,
    formatClockRange,
    formatDay,
    formatWeekday,
} from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Block, LocalDate, Span } from "@/lib/services/diary";
import {
    blockTitle,
    isLive,
    weekdayOf,
    zonedInstant,
} from "@/lib/services/diary";
import {
    addExtraHours,
    addTimeOff,
    removeExtraHours,
    removeTimeOff,
    replaceStaffHours,
} from "@/lib/staff/actions";
import type { StaffView } from "@/lib/staff/types";

import { ChipGroup } from "@/components/shared/choice-group";
import { runAction } from "@/lib/api/run-action";
import { Eyebrow } from "./parts";

export interface HoursTarget {
    staff: StaffView;
    date: LocalDate;
    /** Minutes from midnight it starts at. */
    from: number;
    /** Open closed time, or block free time. */
    mode: "open" | "block";
    /** For a block: how long the free gap runs. */
    room?: number;
    /** The person's working windows that day, and their blocks. */
    windows: Span[];
    blocks: Block[];
}

function lengthLabel(minutes: number): string {
    if (minutes % 60) return `${minutes} min`;
    const h = minutes / 60;
    return count(h, "hour");
}

/**
 * Open a person's closed time from the calendar (the design's "Open <person>
 * from <time>"): one to four hours, just this day (one-off extra hours) or
 * every such weekday (their weekly hours). Or block free time instead, which
 * is time off for that stretch. Both write the same hours Availability edits,
 * and both have Undo.
 */
export function OpenHoursDialog({
    target,
    timezone,
    onClose,
}: {
    target: HoursTarget | null;
    timezone: string;
    onClose: () => void;
}) {
    return (
        <FormDialog
            open={target !== null}
            size="md"
            title={
                target
                    ? `${target.mode === "block" ? "Block" : "Open"} ${target.staff.name} from ${formatClock(target.from)}`
                    : ""
            }
            description={
                target
                    ? target.mode === "block"
                        ? `On ${formatDay(target.date, { weekday: "short", year: "never" })}. Customers aren't offered the time you block.`
                        : `On ${formatDay(target.date, { weekday: "short", year: "never" })}. Customers can book the time you open.`
                    : ""
            }
            onClose={onClose}
        >
            {target ? (
                <Form
                    key={`${target.staff.id}${target.date}${target.from}${target.mode}`}
                    target={target}
                    timezone={timezone}
                    onClose={onClose}
                />
            ) : null}
        </FormDialog>
    );
}

function Form({
    target,
    timezone,
    onClose,
}: {
    target: HoursTarget;
    timezone: string;
    onClose: () => void;
}) {
    const router = useRouter();
    const { staff, date, from, mode } = target;
    const block = mode === "block";
    const room = target.room ?? 240;
    const lengths = block
        ? [room, ...[60, 120].filter((m) => m < room)]
        : [60, 120, 180, 240];
    const [len, setLen] = useState(block ? Math.min(240, room) : 120);
    const [scope, setScope] = useState<"day" | "week">("day");
    const [saving, setSaving] = useState(false);
    const to = Math.min(from + len, 1440);
    const dayName = formatWeekday(date, "UTC");

    const works = target.windows.some(([a, b]) => from < b && a < to);
    const weeklyClash = staff.hours.some(
        (h) =>
            h.dayOfWeek === weekdayOf(date) &&
            from < h.endMinute &&
            h.startMinute < to,
    );
    const hit = target.blocks.filter(
        (b) => isLive(b) && b.start < to && from < b.end,
    );
    const bad = block
        ? hit.length
            ? `That overlaps ${hit.map((b) => `${blockTitle(b)} at ${formatClock(b.start)}`).join(", ")}. Move or cancel it first.`
            : ""
        : works || (scope === "week" && weeklyClash)
          ? `${staff.name} already works part of that time. Pick a closed time, or change hours on Availability.`
          : "";
    const note =
        bad ||
        (block
            ? "Customers won't be offered this time. It shows as time off on the calendar."
            : scope === "week"
              ? `Adds to ${staff.name}'s weekly hours, the same as on Availability.`
              : `A one-off. ${staff.name}'s weekly hours don't change.`);

    async function save() {
        if (bad || saving) return;
        setSaving(true);
        const range = formatClockRange(from, to);
        if (block) {
            const startAt = zonedInstant(date, from, timezone).toISOString();
            const res = await runAction(
                () =>
                    addTimeOff(staff.id, {
                        startAt,
                        endAt: zonedInstant(date, to, timezone).toISOString(),
                        reason: "Blocked from the calendar",
                    }),
                { setBusy: setSaving },
            );
            if (!res) return;
            if (!res.ok) return showError(res.error);
            const added = res.data.staff.timeOff.find(
                (t) => Date.parse(t.startAt) === Date.parse(startAt),
            );
            onClose();
            router.refresh();
            showUndo(
                `Blocked ${range} for ${staff.name}. Nobody can book it.`,
                async () => {
                    if (!added) return false;
                    const back = await removeTimeOff(staff.id, added.id);
                    router.refresh();
                    return back;
                },
            );
            return;
        }
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
            if (!res.ok) return showError(res.error);
            onClose();
            router.refresh();
            showUndo(
                `${staff.name} now works ${range} every ${dayName}.`,
                async () => {
                    const back = await replaceStaffHours(staff.id, before);
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
        if (!res.ok) return showError(res.error);
        const added = res.data.extraHours.find(
            (x) =>
                x.date.slice(0, 10) === date &&
                x.startMinute === from &&
                x.endMinute === to,
        );
        onClose();
        router.refresh();
        showUndo(
            `Opened ${range} for ${staff.name} on ${formatDay(date, { weekday: "short", year: "never" })} only.`,
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
            <p className="mb-3 text-[12.5px] text-muted-foreground">
                {formatDay(date, { weekday: "short", year: "never" })} ·{" "}
                {formatClockRange(from, to)}
            </p>
            <Eyebrow id="oh-for">For</Eyebrow>
            <ChipGroup
                labelledBy="oh-for"
                className="mb-3"
                value={String(len)}
                onChange={(m) => setLen(Number(m))}
                choices={lengths.map((m, i) => ({
                    value: String(m),
                    label:
                        block && i === 0
                            ? `Whole gap · ${lengthLabel(m)}`
                            : lengthLabel(m),
                }))}
            />
            {block ? null : (
                <>
                    <Eyebrow id="oh-repeat">Repeat</Eyebrow>
                    <ChipGroup
                        labelledBy="oh-repeat"
                        value={scope}
                        onChange={setScope}
                        choices={[
                            {
                                value: "day",
                                label: `Just ${formatDay(date, { weekday: "short", year: "never" })}`,
                            },
                            { value: "week", label: `Every ${dayName}` },
                        ]}
                    />
                </>
            )}
            <p
                role={bad ? "alert" : undefined}
                className={
                    bad
                        ? "mt-3 text-[12.5px] leading-[1.5] text-destructive-subtle-foreground"
                        : "mt-3 text-[12.5px] leading-[1.5] text-muted-foreground"
                }
            >
                {note}
            </p>
            <FormDialogFoot
                saveLabel={block ? "Block time" : "Open time"}
                savingLabel={block ? "Blocking…" : "Opening…"}
                pending={saving}
                onSubmit={save}
            />
        </>
    );
}
