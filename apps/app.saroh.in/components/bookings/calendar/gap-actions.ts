"use client";

import { showError, showUndo } from "@saroh/ui/toast";
import { useEffect, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { formatClockRange } from "@/lib/format/datetime";
import { firstName } from "@/lib/names";
import { listAvailability } from "@/lib/services/actions";
import { dayBounds, firstStartIn, zonedInstant } from "@/lib/services/diary";
import { gapDay } from "@/lib/services/free-time";
import type { Service } from "@/lib/services/service";
import {
    addExtraHours,
    addTimeOff,
    removeExtraHours,
    removeTimeOff,
} from "@/lib/staff/actions";
import type { ExtraHours } from "@/lib/staff/types";

import type { GapTarget } from "./gap-types";

/** What the sheet does once the hours changed: close, and read again. */
interface After {
    onClose: () => void;
    refresh: () => void;
}

/**
 * Block this time (U9, Q11): time off for that stretch from the start of
 * the free time, as Hours and time off writes it, with Undo.
 */
export async function blockGapTime(
    {
        target,
        minutes,
        timezone,
        setBusy,
    }: {
        target: GapTarget;
        minutes: number;
        timezone: string;
        setBusy: (busy: boolean) => void;
    },
    { onClose, refresh }: After,
) {
    const { staff, date, free } = target;
    const to = Math.min(free[0] + minutes, 1440);
    const startAt = zonedInstant(date, free[0], timezone).toISOString();
    // What they had before: the new time off is the one not among these,
    // even when another already starts at the same minute.
    const known = new Set(staff.timeOff.map((t) => t.id));
    const res = await runAction(
        () =>
            addTimeOff(staff.id, {
                startAt,
                endAt: zonedInstant(date, to, timezone).toISOString(),
                reason: "Blocked from the calendar",
            }),
        { setBusy },
    );
    if (!res) return;
    if (!res.ok) return showError(res.error);
    const added = res.data.staff.timeOff.find(
        (t) =>
            !known.has(t.id) && Date.parse(t.startAt) === Date.parse(startAt),
    );
    onClose();
    refresh();
    showUndo(
        `Blocked ${formatClockRange(free[0], to)} for ${firstName(staff.name)}. Customers won’t be offered it.`,
        async () => {
            if (!added) return false;
            const back = await removeTimeOff(staff.id, added.id);
            refresh();
            return back;
        },
    );
}

/**
 * Close these extra hours (U9, Q11): the one-off extra opening hours the
 * free time is in, with Undo. Bookings already in them are kept (the API
 * keeps and lists them).
 */
export async function closeExtraHours(
    {
        target,
        extra,
        today,
    }: { target: GapTarget; extra: ExtraHours; today: string },
    { onClose, refresh }: After,
) {
    const { staff, date } = target;
    const res = await runAction(() => removeExtraHours(staff.id, extra.id));
    if (!res) return;
    if (!res.ok) return showError(res.error);
    onClose();
    refresh();
    showUndo(
        `Closed ${firstName(staff.name)}’s extra hours ${gapDay(date, today)}, ${formatClockRange(extra.startMinute, extra.endMinute)}. Bookings already in them are kept.`,
        async () => {
            const back = await addExtraHours(staff.id, {
                date,
                startMinute: extra.startMinute,
                endMinute: extra.endMinute,
            });
            refresh();
            return back;
        },
    );
}

/** A service's first start in the gap: null can't, undefined not known. */
export type GapStarts = Record<string, number | null | undefined>;

/**
 * Where each offered service can start in this free time with this
 * person, as the API works it out (their hours and the service's own
 * rules both): null while it is read; a service missing from it can't.
 * A service whose read failed is there as `undefined`: not known, so it
 * stays offered from the gap's start and the API decides at Book, rather
 * than calling the time one it can't start in.
 */
export function useGapStarts(
    offered: readonly Service[],
    target: GapTarget,
    timezone: string,
): GapStarts | null {
    const [starts, setStarts] = useState<GapStarts | null>(null);
    const { staff, date, free } = target;
    const key = offered.map((s) => `${s.id}:${s.durationMinutes}`).join(",");
    useEffect(() => {
        let live = true;
        const { from, to } = dayBounds(date, timezone);
        const ids = key ? key.split(",") : [];
        void Promise.all(
            ids.map(async (pair) => {
                const [id = "", minutes] = pair.split(":");
                const slots = await listAvailability(
                    id,
                    from.toISOString(),
                    to.toISOString(),
                    staff.id,
                ).catch(() => null);
                return [
                    id,
                    slots === null
                        ? undefined
                        : firstStartIn(
                              slots,
                              free,
                              Number(minutes),
                              date,
                              timezone,
                          ),
                ] as const;
            }),
        ).then((pairs) => {
            if (live) setStarts(Object.fromEntries(pairs));
        });
        return () => {
            live = false;
        };
    }, [key, date, timezone, staff.id, free]);
    return starts;
}
