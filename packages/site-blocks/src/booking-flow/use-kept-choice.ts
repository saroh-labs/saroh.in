"use client";

import { useEffect, useRef } from "react";

import { timeWords } from "../lib/clock";
import {
    clearBookingDraft,
    keptText,
    NOTE_NOT_KEPT,
    readBookingDraft,
    writeBookingDraft,
} from "./booking-draft";
import { nextChosenText, nextFreeStart } from "./flow-helpers";
import type { Phase } from "./flow-state";
import { findInitialStart, INITIAL_TIME_GONE } from "./initial-start";
import type { BookingService, BookingWhere, BookPay } from "./model";
import { dateIn, dateText } from "./model";
import type { Times } from "./use-times";

/** A booking that came back not standing: a time gone meanwhile. */
export const TIME_GONE = "That time has gone. Pick another one.";

/**
 * What the booking page brings back, and what it keeps:
 *
 * - **A time the address names** (On today's link, G18; a step's link or a
 *   reload, U9): chosen once its days arrive, if still free; gone, the page
 *   opens on the day and says so. Back and Forward name one too.
 * - **What was kept for the visit** (`booking-draft.ts`): the email code is
 *   read in another app, and a phone often loads the page again on the way
 *   back. The service, the weeks, who with, where and how they'll pay come
 *   back at once, the time when its days arrive, checked against what is
 *   free now. Read in an effect, never while drawing: the server's page and
 *   the browser's first draw are the same.
 * - **The next free time** after one that went while they signed in (A9).
 */
export function useKeptChoice({
    times,
    services,
    waitlistOn,
    setWhere,
    setPayChoice,
    say,
}: {
    times: Times;
    services: BookingService[];
    /** A full class can still be chosen, for its waitlist (A12). */
    waitlistOn: boolean;
    setWhere: (where: BookingWhere) => void;
    setPayChoice: (pay: BookPay | null) => void;
    say: {
        error: (text: string | null) => void;
        notice: (text: string) => void;
    };
}) {
    const {
        daysState,
        serviceId,
        isClass,
        service,
        setDate,
        setStart,
        loadDays,
    } = times;
    // The start that went while they signed in: the next free one after it
    // is chosen once the times are read again (A9).
    const offerAfter = useRef<string | null>(null);
    const restoring = useRef<{
        startAt: string | null;
        hadNote: boolean;
    } | null>(null);
    const { error: sayError, notice: sayNotice } = say;

    const { pending: live, setPending } = times;

    // A time the address named: chosen once its days arrive, if still free.
    useEffect(() => {
        if (!live || daysState.kind !== "ready") return;
        if (daysState.serviceId !== live.serviceId) return;
        setPending(null);
        const found = findInitialStart(
            daysState.days,
            live.date,
            live.time,
            isClass,
        );
        if (found) setStart(found);
        else sayError(INITIAL_TIME_GONE);
    }, [live, daysState, isClass, setStart, setPending, sayError]);

    // What was kept for this address, brought back once as the page opens.
    useEffect(() => {
        const kept = readBookingDraft(window.location.search);
        if (!kept) return;
        if (!services.some((s) => s.id === kept.serviceId)) {
            clearBookingDraft();
            return;
        }
        restoring.current = { startAt: kept.startAt, hadNote: kept.hadNote };
        // Brought back just after this first draw, never during it: what
        // the browser kept is not what the server drew.
        let on = true;
        void Promise.resolve().then(() => {
            if (!on) return;
            // What was chosen is later than the time the address names.
            setPending(null);
            times.setServiceId(kept.serviceId);
            times.setPerson(kept.person);
            times.setSkip(kept.skip);
            setDate(null);
            setStart(null);
            if (kept.where) setWhere(kept.where);
            if (kept.pay) setPayChoice(kept.pay);
            times.setDaysState({ kind: "loading", serviceId: kept.serviceId });
            loadDays(kept.serviceId, {
                skip: kept.skip,
                staffId: kept.person,
            });
        });
        return () => {
            on = false;
        };
        // Once, as the page opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The kept time, once its days are here: chosen again if it is still
    // free, and said. Gone, the next free one is chosen.
    useEffect(() => {
        const kept = restoring.current;
        if (!kept || daysState.kind !== "ready") return;
        if (daysState.serviceId !== serviceId) return;
        restoring.current = null;
        const note = kept.hadNote ? ` ${NOTE_NOT_KEPT}` : "";
        if (!kept.startAt) {
            if (kept.hadNote) sayNotice(NOTE_NOT_KEPT);
            return;
        }
        const tz = daysState.days.timezone;
        const found = daysState.days.days
            .flatMap((d) => d.starts)
            .find(
                (s) =>
                    s.startAt === kept.startAt &&
                    (!isClass || (s.placesLeft ?? 0) > 0 || waitlistOn),
            );
        if (found) {
            setDate(dateIn(found.startAt, tz));
            setStart(found);
            sayNotice(
                keptText({
                    serviceName: service?.name ?? "",
                    whenText: `${dateText(dateIn(found.startAt, tz), true)} at ${timeWords(found.startAt, tz)}${
                        found.staffName ? ` with ${found.staffName}` : ""
                    }`,
                    hadNote: kept.hadNote,
                }),
            );
            return;
        }
        const next = nextFreeStart(daysState.days, kept.startAt, isClass);
        if (!next) {
            sayError(`${TIME_GONE}${note}`);
            return;
        }
        setDate(dateIn(next.startAt, tz));
        setStart(next);
        sayNotice(`${nextChosenText(next, tz)}${note}`);
    }, [
        daysState,
        serviceId,
        isClass,
        waitlistOn,
        service?.name,
        setDate,
        setStart,
        sayNotice,
        sayError,
    ]);

    // After a time went while signing in: the next free one, chosen.
    useEffect(() => {
        const after = offerAfter.current;
        if (!after || daysState.kind !== "ready") return;
        if (daysState.serviceId !== serviceId) return;
        offerAfter.current = null;
        const next = nextFreeStart(daysState.days, after, isClass);
        if (!next) return;
        setDate(dateIn(next.startAt, daysState.days.timezone));
        setStart(next);
        sayNotice(nextChosenText(next, daysState.days.timezone));
    }, [daysState, serviceId, isClass, setDate, setStart, sayNotice]);

    return {
        /** Choose the next free time after this one, once times are read. */
        offerAfter,
        /** A kept booking still on its way back: not written over. */
        restoring,
    };
}

/**
 * Keep what is chosen, as it is chosen, under the address it is on; forget
 * it once it is booked. Never the note: only that one was typed. Called
 * after the step reaches the address (`useStepHistory`), so what is kept
 * is under the address a reload opens.
 */
export function useKeepDraft({
    restoring,
    phaseKind,
    times,
    where,
    pay,
    hadNote,
    address,
}: {
    restoring: React.RefObject<unknown>;
    phaseKind: Phase["kind"];
    times: Times;
    where: BookingWhere;
    pay: BookPay | null;
    hadNote: boolean;
    /** The address the page wants, so a change of it is kept again. */
    address: string;
}) {
    // The first pass is this mount's: nothing has been chosen yet, and it
    // must not write over what was kept.
    const mounted = useRef(false);
    const { serviceId, skip, person } = times;
    const startAt = times.start?.startAt ?? null;
    useEffect(() => {
        if (!mounted.current) {
            mounted.current = true;
            return;
        }
        // A kept booking still on its way back is not written over.
        if (restoring.current) return;
        if (phaseKind === "done" || phaseKind === "waitlisted") {
            clearBookingDraft();
            return;
        }
        if (phaseKind !== "choose") return;
        if (!serviceId) {
            clearBookingDraft();
            return;
        }
        writeBookingDraft({
            search: window.location.search,
            serviceId,
            skip,
            person,
            startAt,
            where,
            pay,
            hadNote,
        });
    }, [
        restoring,
        phaseKind,
        serviceId,
        skip,
        person,
        startAt,
        where,
        pay,
        hadNote,
        address,
    ]);
}
