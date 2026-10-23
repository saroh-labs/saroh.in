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
 * Saves, and their Undos, go one after another through one queue, and only
 * the latest change keeps its Undo. While any is queued the page's own
 * read is not taken in (it would draw a week from before the queued
 * saves); the page is read again once, when the queue empties.
 *
 * A save that is refused, or got no answer, puts the person's week back
 * as the server last accepted it, and the changes queued after it for
 * that person (each built on the refused one) are dropped with it.
 * Bookings the new hours leave outside them stay booked; the API names
 * them, kept here by person.
 */
export function useHours(staff: readonly StaffView[]) {
    const router = useRouter();
    const [weeks, setWeeks] = useState<Weeks>(() => weeksOf(staff));
    const [seen, setSeen] = useState(staff);
    // Saves queued or on their way; the read waits for none.
    const [busy, setBusy] = useState(0);
    const [adopted, setAdopted] = useState(staff);
    if (staff !== seen) {
        setSeen(staff);
        if (busy === 0) {
            setAdopted(staff);
            setWeeks(weeksOf(staff));
        }
    }
    // What a save starts from: the weeks as last drawn, or as a save
    // just put them.
    const now = useRef(weeks);
    useEffect(() => {
        now.current = weeks;
    }, [weeks]);
    // The weeks as the server last accepted them: what a refusal puts back.
    const confirmed = useRef<Weeks>(weeksOf(staff));
    useEffect(() => {
        confirmed.current = weeksOf(adopted);
    }, [adopted]);
    const [outside, setOutside] = useState<Record<string, BookingBrief[]>>({});
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const queued = useRef(0);
    // Bumped for a person when one of their saves is refused: the saves
    // queued behind it for them are dropped.
    const epoch = useRef<Record<string, number>>({});
    const lastUndo = useRef<ToastId | null>(null);

    const put = useCallback((staffId: string, hours: WeeklyRange[]) => {
        now.current = { ...now.current, [staffId]: hours };
        setWeeks(now.current);
    }, []);

    const accept = useCallback((staffId: string, hours: WeeklyRange[]) => {
        confirmed.current = { ...confirmed.current, [staffId]: hours };
    }, []);

    /** Run `job` after everything queued; one read again once all ran. */
    const enqueue = useCallback(
        <T>(job: () => Promise<T>): Promise<T> => {
            queued.current += 1;
            setBusy(queued.current);
            const run = queue.current.then(job).finally(() => {
                queued.current -= 1;
                setBusy(queued.current);
                if (queued.current === 0) router.refresh();
            });
            queue.current = run.catch(() => undefined);
            return run;
        },
        [router],
    );

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
            const mine = epoch.current[staffId] ?? 0;
            return enqueue(async () => {
                // An earlier change for them was refused: this one was
                // built on it, and goes with it.
                if ((epoch.current[staffId] ?? 0) !== mine) return false;
                const prior = confirmed.current[staffId] ?? [];
                const res = await runAction(
                    () => replaceStaffHours(staffId, next),
                    { quiet: true },
                );
                if (!res?.ok) {
                    epoch.current = { ...epoch.current, [staffId]: mine + 1 };
                    put(staffId, confirmed.current[staffId] ?? []);
                    if (!res) showError(UNREACHED);
                    else showError(words.failed, res.error);
                    return false;
                }
                accept(staffId, next);
                setOutside((o) => ({ ...o, [staffId]: res.data.outside }));
                if (lastUndo.current !== null) dismissToast(lastUndo.current);
                lastUndo.current = showUndo(words.done, () =>
                    enqueue(async () => {
                        const back = await runAction(
                            () => replaceStaffHours(staffId, prior),
                            { quiet: true },
                        );
                        if (!back) return { ok: false, error: UNREACHED };
                        if (!back.ok) return back;
                        accept(staffId, prior);
                        put(staffId, prior);
                        setOutside((o) => ({
                            ...o,
                            [staffId]: back.data.outside,
                        }));
                        return { ok: true };
                    }),
                );
                return true;
            });
        },
        [accept, enqueue, put],
    );

    return { weeks, save, outside };
}
