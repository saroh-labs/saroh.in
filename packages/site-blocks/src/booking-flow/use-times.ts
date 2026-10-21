"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { DaysAsk } from "./api";
import { fetchDays } from "./api";
import type { DaysState } from "./flow-state";
import type {
    BookingDay,
    BookingDays,
    BookingService,
    BookingStart,
} from "./model";

/** A day and time named by the address, chosen once its days are read. */
export interface PendingStart {
    serviceId: string;
    date: string;
    time: string;
}

/** Class sessions shown before "Show more". */
export const SESSIONS_SHOWN = 10;

/**
 * How many sessions are on show: what "Show more" has opened, and never
 * fewer than reach the chosen one, so a session chosen by the address (a
 * waitlist claim link, #1149) is always in the list it is chosen from.
 */
export function sessionsOnShow(
    sessions: readonly { startAt: string }[],
    shown: number,
    chosenStartAt: string | null | undefined,
): number {
    const at = chosenStartAt
        ? sessions.findIndex((s) => s.startAt === chosenStartAt)
        : -1;
    return Math.max(shown, at + 1);
}

/**
 * What is being chosen on the booking page and the times it is chosen
 * from: the service, the two weeks on show and who with, the day and the
 * start, and the API's read of the free times. A late answer for another
 * service, person or two weeks is dropped.
 *
 * `onChange` is called when the choice that a booking attempt is made of
 * changes (another service, person, weeks or time): the attempt's key is
 * the flow's, and a new choice is a new attempt (#508).
 */
export function useTimes({
    apiUrl,
    services,
    first,
    initialDate,
    initialStaff = null,
    initialStart = null,
    onChange,
    fallbackZone,
}: {
    apiUrl: string;
    services: BookingService[];
    /** The service the page was opened on, if it offers it. */
    first: BookingService | null;
    initialDate: string | null;
    /** The person the address asked for (`?staff=`, U9). */
    initialStaff?: string | null;
    /** With `initialDate`, the time the address named (`?start=`). */
    initialStart?: string | null;
    onChange: () => void;
    /** The business's zone, until the times say theirs. */
    fallbackZone: string;
}) {
    const [serviceId, setServiceId] = useState<string | null>(
        first?.id ?? null,
    );
    const [daysState, setDaysState] = useState<DaysState>(
        first ? { kind: "loading", serviceId: first.id } : { kind: "idle" },
    );
    const [date, setDate] = useState<string | null>(first ? initialDate : null);
    const [start, setStart] = useState<BookingStart | null>(null);
    // "With: Anyone" or one of the people who take it, and which two
    // weeks are on show ("Show later dates").
    const [person, setPerson] = useState<string | null>(
        first ? initialStaff : null,
    );
    const [skip, setSkip] = useState(0);
    const [sessionsShown, setSessionsShown] = useState(SESSIONS_SHOWN);
    // A time the address named (On today's link, a step's link, Back and
    // Forward), chosen once its days are read (`use-kept-choice.ts`).
    const [pending, setPending] = useState<PendingStart | null>(
        first && initialDate && initialStart
            ? { serviceId: first.id, date: initialDate, time: initialStart }
            : null,
    );
    // The service, weeks and person whose days are wanted now.
    const wanted = useRef<string | null>(
        first ? `${first.id}:0:${initialStaff ?? ""}` : null,
    );

    const loadDays = useCallback(
        (id: string, ask: DaysAsk = {}) => {
            const key = `${id}:${ask.skip ?? 0}:${ask.staffId ?? ""}`;
            wanted.current = key;
            void fetchDays(apiUrl, id, ask).then((result) => {
                if (wanted.current !== key) return;
                setDaysState(
                    result.ok
                        ? { kind: "ready", serviceId: id, days: result.value }
                        : {
                              kind: "error",
                              serviceId: id,
                              message: result.message,
                              gone:
                                  result.status === 404 ||
                                  result.status === 410,
                          },
                );
            });
        },
        [apiUrl],
    );

    // The service the page was opened on (`?service=`) loads once, for
    // the person it asked for.
    const firstId = first?.id ?? null;
    const firstStaff = useRef(initialStaff);
    useEffect(() => {
        if (firstId) {
            loadDays(
                firstId,
                firstStaff.current ? { staffId: firstStaff.current } : {},
            );
        }
    }, [firstId, loadDays]);

    /** Another service: everything after it is unchosen. */
    const pickService = (id: string, ask: DaysAsk = {}) => {
        setServiceId(id);
        setDate(null);
        setStart(null);
        setPerson(ask.staffId ?? null);
        setSkip(ask.skip ?? 0);
        setSessionsShown(SESSIONS_SHOWN);
        onChange();
        setDaysState({ kind: "loading", serviceId: id });
        loadDays(id, ask);
    };

    /** The days on show, read again: the same two weeks, the same person. */
    const reloadDays = (id: string) => loadDays(id, { skip, staffId: person });

    /** "Try again", or back to choosing: the shapes while they are read. */
    const retry = (id: string) => {
        setDaysState({ kind: "loading", serviceId: id });
        reloadDays(id);
    };

    /** Another person, or other weeks: other times, so the time is unchosen. */
    const showDays = (
        id: string,
        ask: { skip: number; person: string | null },
    ) => {
        setPerson(ask.person);
        setSkip(ask.skip);
        setDate(null);
        setStart(null);
        setSessionsShown(SESSIONS_SHOWN);
        onChange();
        setDaysState({ kind: "loading", serviceId: id });
        loadDays(id, { skip: ask.skip, staffId: ask.person });
    };

    /** Nothing chosen: "Book something else". */
    const clear = () => {
        setServiceId(null);
        setDaysState({ kind: "idle" });
        setDate(null);
        setStart(null);
        setPerson(null);
        setSkip(0);
        wanted.current = null;
    };

    // ── What is chosen ──────────────────────────────────────────────────

    const service = services.find((s) => s.id === serviceId) ?? null;
    const zone =
        daysState.kind === "ready" ? daysState.days.timezone : fallbackZone;
    const days: BookingDays | null =
        daysState.kind === "ready" && daysState.serviceId === serviceId
            ? daysState.days
            : null;
    const isClass = service?.kind === "class";
    const firstOpen = days?.days.find((d) => d.starts.length > 0) ?? null;
    const day: BookingDay | null =
        days && !isClass
            ? (days.days.find((d) => d.date === date && d.starts.length > 0) ??
              firstOpen)
            : null;
    const sessions = days && isClass ? days.days.flatMap((d) => d.starts) : [];
    // A chosen start still offered; one taken meanwhile falls away.
    const chosen =
        (start &&
            (isClass ? sessions : (day?.starts ?? [])).find(
                (s) => s.startAt === start.startAt,
            )) ??
        null;

    // Named for another service than the one chosen now: nothing to choose.
    const pendingNow = pending?.serviceId === serviceId ? pending : null;

    return {
        pending: pendingNow,
        setPending,
        serviceId,
        setServiceId,
        daysState,
        setDaysState,
        date,
        setDate,
        start,
        setStart,
        person,
        setPerson,
        skip,
        setSkip,
        sessionsShown,
        setSessionsShown,
        loadDays,
        pickService,
        reloadDays,
        retry,
        showDays,
        clear,
        service,
        zone,
        days,
        isClass,
        day,
        sessions,
        chosen,
    };
}

export type Times = ReturnType<typeof useTimes>;
