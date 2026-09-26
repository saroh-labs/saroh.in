"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Block, LocalDate, Span } from "@/lib/services/diary";
import {
    blockTitle,
    clock,
    dayLabel,
    isLive,
    weekdayName,
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

import { Chip, Eyebrow } from "./parts";
import { btn } from "./quick-look-types";

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
    return `${h} ${h === 1 ? "hour" : "hours"}`;
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
        <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-[440px] gap-0 rounded-[14px] px-5 py-[18px]">
                {target ? (
                    <Form
                        key={`${target.staff.id}${target.date}${target.from}${target.mode}`}
                        target={target}
                        timezone={timezone}
                        onClose={onClose}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
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
    const dayName = weekdayName(date);

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
            ? `That overlaps ${hit.map((b) => `${blockTitle(b)} at ${clock(b.start)}`).join(", ")} — move or cancel it first.`
            : ""
        : works || (scope === "week" && weeklyClash)
          ? `${staff.name} already works part of that time — pick a closed time, or change hours on Availability.`
          : "";
    const note =
        bad ||
        (block
            ? "Customers won't be offered this time. It shows as time off on the calendar."
            : scope === "week"
              ? `Adds to ${staff.name}'s weekly hours — the same as on Availability.`
              : `A one-off. ${staff.name}'s weekly hours don't change.`);

    async function save() {
        if (bad || saving) return;
        setSaving(true);
        const range = `${clock(from)}–${clock(to)}`;
        if (block) {
            const startAt = zonedInstant(date, from, timezone).toISOString();
            const res = await addTimeOff(staff.id, {
                startAt,
                endAt: zonedInstant(date, to, timezone).toISOString(),
                reason: "Blocked from the calendar",
            });
            setSaving(false);
            if (!res.ok) return showError(res.error);
            const added = res.data.staff.timeOff.find(
                (t) => Date.parse(t.startAt) === Date.parse(startAt),
            );
            onClose();
            router.refresh();
            showUndo(
                `Blocked ${range} for ${staff.name}. Nobody can book it.`,
                () => {
                    if (!added) return;
                    void removeTimeOff(staff.id, added.id).then((back) => {
                        if (!back.ok) showError(back.error);
                        router.refresh();
                    });
                },
            );
            return;
        }
        if (scope === "week") {
            const before = staff.hours;
            const res = await replaceStaffHours(staff.id, [
                ...before,
                {
                    dayOfWeek: weekdayOf(date),
                    startMinute: from,
                    endMinute: to,
                },
            ]);
            setSaving(false);
            if (!res.ok) return showError(res.error);
            onClose();
            router.refresh();
            showUndo(
                `${staff.name} now works ${range} every ${dayName}.`,
                () => {
                    void replaceStaffHours(staff.id, before).then((back) => {
                        if (!back.ok) showError(back.error);
                        router.refresh();
                    });
                },
            );
            return;
        }
        const res = await addExtraHours(staff.id, {
            date,
            startMinute: from,
            endMinute: to,
        });
        setSaving(false);
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
            `Opened ${range} for ${staff.name} on ${dayLabel(date)} only.`,
            () => {
                if (!added) return;
                void removeExtraHours(staff.id, added.id).then((back) => {
                    if (!back.ok) showError(back.error);
                    router.refresh();
                });
            },
        );
    }

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            <DialogTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                {block ? "Block" : "Open"} {staff.name} from {clock(from)}
            </DialogTitle>
            <DialogDescription className="mb-3 mt-[3px] text-[12.5px] text-muted-foreground">
                {dayLabel(date)} · {clock(from)}–{clock(to)}
            </DialogDescription>
            <Eyebrow id="oh-for">For</Eyebrow>
            <div
                role="radiogroup"
                aria-labelledby="oh-for"
                className="mb-3 flex flex-wrap gap-1.5"
            >
                {lengths.map((m, i) => (
                    <Chip key={m} on={len === m} onClick={() => setLen(m)}>
                        {block && i === 0
                            ? `Whole gap · ${lengthLabel(m)}`
                            : lengthLabel(m)}
                    </Chip>
                ))}
            </div>
            {block ? null : (
                <>
                    <Eyebrow id="oh-repeat">Repeat</Eyebrow>
                    <div
                        role="radiogroup"
                        aria-labelledby="oh-repeat"
                        className="flex flex-wrap gap-1.5"
                    >
                        <Chip
                            on={scope === "day"}
                            onClick={() => setScope("day")}
                        >
                            Just {dayLabel(date)}
                        </Chip>
                        <Chip
                            on={scope === "week"}
                            onClick={() => setScope("week")}
                        >
                            Every {dayName}
                        </Chip>
                    </div>
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
            <div className="mt-3.5 flex justify-end gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className={btn.ghost}
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    className={btn.primary}
                    disabled={Boolean(bad) || saving}
                >
                    {saving
                        ? "Saving…"
                        : block
                          ? "Block it"
                          : "Open for bookings"}
                </Button>
            </div>
        </form>
    );
}
