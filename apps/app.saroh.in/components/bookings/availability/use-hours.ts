"use client";

import type { ToastId } from "@saroh/ui/toast";
import { dismissToast, showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { sameHours } from "@/lib/services/availability-rules";
import { replaceStaffHours } from "@/lib/staff/actions";
import type { BookingBrief, StaffView, WeeklyRange } from "@/lib/staff/types";

type Weeks = Record<string, WeeklyRange[]>;

function weeksOf(staff: readonly StaffView[]): Weeks {
    return Object.fromEntries(staff.map((p) => [p.id, p.hours]));
}

/**
 * Each person's week on Hours and time off (U17, DEC-170): every change
 * saves the person's whole week at once (`PUT staff/:id/hours`), shows it
 * straight away, and says so in a toast with Undo, which sends the week as
 * it was. There is no draft and no Save bar, so leaving never asks.
 *
 * A save that is refused puts the week back as it was saved and says
 * nothing has changed; one that got no answer puts it back too and reads
 * the page again, since it may have landed. Saves go one after another,
 * and only the latest change keeps its Undo. Bookings the new hours leave
 * outside them stay booked; the API names them, kept here by person.
 */
export function useHours(staff: readonly StaffView[]) {
    const router = useRouter();
    const [weeks, setWeeks] = useState<Weeks>(() => weeksOf(staff));
    const [seen, setSeen] = useState(staff);
    const now = useRef(weeks);
    // The page's own read takes over when it arrives.
    if (staff !== seen) {
        setSeen(staff);
        const next = weeksOf(staff);
        setWeeks(next);
    }
    // What a save starts from: the weeks as last drawn, or as a save
    // just put them.
    useEffect(() => {
        now.current = weeks;
    }, [weeks]);
    const [outside, setOutside] = useState<Record<string, BookingBrief[]>>({});
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const lastUndo = useRef<ToastId | null>(null);

    const put = useCallback((staffId: string, hours: WeeklyRange[]) => {
        now.current = { ...now.current, [staffId]: hours };
        setWeeks(now.current);
    }, []);

    /**
     * Save `next` as `staffId`'s week. `done` is the toast once it is
     * saved, `failed` the one when it isn't. Answers whether it saved.
     */
    const save = useCallback(
        (
            staffId: string,
            next: WeeklyRange[],
            words: { done: string; failed: string },
        ): Promise<boolean> => {
            const before = now.current[staffId] ?? [];
            if (sameHours(before, next)) return Promise.resolve(true);
            put(staffId, next);
            const run = queue.current.then(async () => {
                const res = await runAction(
                    () => replaceStaffHours(staffId, next),
                    { quiet: true },
                );
                if (!res?.ok) {
                    put(staffId, before);
                    if (!res) {
                        showError(UNREACHED);
                        router.refresh();
                    } else {
                        showError(words.failed, res.error);
                    }
                    return false;
                }
                setOutside((o) => ({ ...o, [staffId]: res.data.outside }));
                if (lastUndo.current !== null) dismissToast(lastUndo.current);
                lastUndo.current = showUndo(words.done, async () => {
                    const back = await replaceStaffHours(staffId, before);
                    if (!back.ok) return back;
                    put(staffId, before);
                    setOutside((o) => ({ ...o, [staffId]: back.data.outside }));
                    router.refresh();
                    return { ok: true };
                });
                router.refresh();
                return true;
            });
            queue.current = run.catch(() => undefined);
            return run;
        },
        [put, router],
    );

    return { weeks, save, outside };
}
