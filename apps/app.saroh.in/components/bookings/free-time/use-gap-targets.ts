"use client";

import { showInfo } from "@saroh/ui/toast";
import { useState } from "react";

import { diaryPausedWords } from "@/lib/billing/paused";
import type { Column, LocalDate, Span } from "@/lib/services/diary";
import { UNASSIGNED } from "@/lib/services/diary";
import type { StaffView } from "@/lib/staff/types";

import type { GapTarget } from "./gap-types";
import type { HoursTarget } from "./open-hours-dialog";

/**
 * The calendar's free and closed time (U9, U5): which free time the book
 * or block sheet is open on, and which closed time the open-hours sheet
 * is. A free time books with its person; closed time opens their hours.
 */
export function useGapTargets({
    date,
    person,
    me,
    staff,
    staffById,
}: {
    date: LocalDate;
    /** Whose bookings are shown: a staff id, or everyone. */
    person: string;
    me: { id: string } | null;
    staff: StaffView[] | null;
    staffById: ReadonlyMap<string, StaffView>;
}) {
    const [gap, setGap] = useState<GapTarget | null>(null);
    const [hours, setHours] = useState<HoursTarget | null>(null);

    function bookGap(column: Column, free: Span, on: LocalDate = date) {
        const who = staffById.get(column.key);
        if (!who) return;
        // Past the plan's team limit (#800): no new bookings with them, and
        // why, rather than a form the API would refuse.
        if (who.paused) {
            showInfo(diaryPausedWords([who.name]));
            return;
        }
        setGap({ staff: who, date: on, free });
    }

    // A day nobody works, from the week (U5): open hours for whoever is
    // picked, else the viewer when they take bookings, else the first
    // person on the diary, from when they usually start.
    function openDay(on: LocalDate) {
        const who =
            staffById.get(person) ??
            (me ? staffById.get(me.id) : undefined) ??
            (staff ?? []).find((p) => p.status === "ACTIVE");
        if (!who) return;
        const starts = who.hours.map((h) => h.startMinute);
        setHours({
            staff: who,
            date: on,
            from: starts.length ? Math.min(...starts) : 540,
            windows: [],
            blocks: [],
        });
    }

    const offersFree = (c: Column) => {
        const p = staffById.get(c.key);
        return c.key !== UNASSIGNED && p !== undefined && !p.paused;
    };

    function openClosed(column: Column, minute: number) {
        const who = staffById.get(column.key);
        if (!who) return;
        setHours({
            staff: who,
            date,
            from: minute,
            windows: column.day?.windows ?? [],
            blocks: column.blocks,
        });
    }

    return {
        gap,
        hours,
        closeGap: () => setGap(null),
        closeHours: () => setHours(null),
        bookGap,
        openDay,
        offersFree,
        openClosed,
    };
}
