"use client";

import { showError } from "@saroh/ui/toast";
import {
    keepPreviousData,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";

import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { useOrgId } from "@/lib/query/org";
import { useActionMutation } from "@/lib/query/use-action-mutation";

import { calendarKeys } from "@/lib/calendar/queries";
import { homeKeys } from "@/lib/home/queries";
import type { BookingsAsk, DiaryAsk } from "./queries";

import {
    availabilityRead,
    bookingsKeys,
    bookingsRead,
    diaryRead,
} from "./queries";

/**
 * The bookings list for the open business (DEC-259). A new date filter
 * keeps the last rows on screen (greyed by the container) until it lands.
 */
export function useBookingsList(ask: BookingsAsk) {
    return useQuery({
        ...bookingsRead.options(useOrgId(), ask),
        placeholderData: keepPreviousData,
    });
}

/**
 * The diary for the days the address names (DEC-259). Another week keeps
 * the last one on screen (greyed by the container) until it lands.
 */
export function useBookingsDiary(ask: DiaryAsk) {
    return useQuery({
        ...diaryRead.options(useOrgId(), ask),
        placeholderData: keepPreviousData,
    });
}

/** Hours and time off (U25): read again by its own saves. */
export function useAvailability() {
    return useQuery(availabilityRead.options(useOrgId(), {}));
}

/** A booking write, given the open business's id when on React Query. */
export type BookingWrite<R> = (...orgId: [] | [string]) => Promise<R>;

type RunOptions = NonNullable<Parameters<typeof runAction>[1]>;

/**
 * How a bookings part saves, and what it does once a write worked.
 *
 * - `save`: `runAction`'s semantics (busy cleared, one sentence when it
 *   never got there, `{ ok: false }` handed back untouched).
 * - `saved`: what the screen does after: on a screen still server-rendered
 *   (the diary, a booking's page) a `router.refresh()`; on the list,
 *   nothing, since `save` has already read the list again.
 * - `refresh`: read the screen again after a write made some other way
 *   (hours, time off, a refusal that says the time went): a
 *   `router.refresh()` off React Query, else the bookings reads again.
 */
export interface BookingSave {
    save: <R>(
        write: BookingWrite<R>,
        run?: RunOptions,
    ) => Promise<R | undefined>;
    saved: () => void;
    refresh: () => void;
    /**
     * The open business, spread as a write's last argument when it is made
     * outside `save` (`...org`); empty off React Query.
     */
    org: [] | [string];
}

export const BookingSaveContext = createContext<BookingSave | null>(null);

/** How a bookings part saves: the list's, or as it did before. */
export function useBookingSave(): BookingSave {
    const router = useRouter();
    return (
        useContext(BookingSaveContext) ?? {
            save: (write, run) => runAction(() => write(), run),
            // rq-refresh-ok: a booking's page is server-rendered until U26.
            saved: () => router.refresh(),
            // rq-refresh-ok: as above.
            refresh: () => router.refresh(),
            org: [],
        }
    );
}

type Write = (orgId: string) => Promise<unknown>;
const pass = (write: Write, orgId: string) => write(orgId);

/**
 * The bookings screens' saves (DEC-259), the list's, the diary's and
 * Hours and time off's (whose read is under `bookings` too):
 * through `useActionMutation`, so the action gets the tab's business (and
 * refuses a moved tab), then what is on screen is read once (the other
 * bookings read marked stale), and Home and the Business calendar are marked stale (not mounted
 * here, so nothing else is read). A refused write invalidates nothing.
 */
export function useBookingSaveWithQuery(): BookingSave {
    const orgId = useOrgId();
    const client = useQueryClient();
    const invalidates = [
        bookingsKeys(orgId),
        homeKeys(orgId),
        calendarKeys(orgId),
    ];
    const m = useActionMutation(pass, {
        invalidates,
        // Said below, as the caller asked: per call, not per hook.
        quiet: true,
    });
    return {
        save: async <R>(write: BookingWrite<R>, run: RunOptions = {}) => {
            run.setBusy?.(true);
            try {
                const res = (await m.mutateAsync(write)) as R | undefined;
                if (res === undefined) {
                    if (!run.quiet) showError(UNREACHED);
                    run.onUnreached?.(UNREACHED);
                }
                return res;
            } finally {
                run.setBusy?.(false);
            }
        },
        // The list was read again by `save` itself.
        saved: () => undefined,
        refresh: () => {
            for (const queryKey of invalidates)
                void client.invalidateQueries({ queryKey });
        },
        org: [orgId],
    };
}
