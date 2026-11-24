"use client";

import { showError } from "@saroh/ui/toast";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";

import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { useOrgId } from "@/lib/query/org";
import { useActionMutation } from "@/lib/query/use-action-mutation";

import { calendarKeys } from "@/lib/calendar/queries";
import { homeKeys } from "@/lib/home/queries";
import type { BookingsAsk } from "./queries";

import { bookingsKeys, bookingsRead } from "./queries";

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
 */
export interface BookingSave {
    save: <R>(
        write: BookingWrite<R>,
        run?: RunOptions,
    ) => Promise<R | undefined>;
    saved: () => void;
}

export const BookingSaveContext = createContext<BookingSave | null>(null);

/** How a bookings part saves: the list's, or as it did before. */
export function useBookingSave(): BookingSave {
    const router = useRouter();
    return (
        useContext(BookingSaveContext) ?? {
            save: (write, run) => runAction(() => write(), run),
            // rq-refresh-ok: the diary and a booking's page are server-rendered until U15/U26.
            saved: () => router.refresh(),
        }
    );
}

type Write = (orgId: string) => Promise<unknown>;
const pass = (write: Write, orgId: string) => write(orgId);

/**
 * The list's saves (DEC-259): through `useActionMutation`, so the action
 * gets the tab's business (and refuses a moved tab), then the list is read
 * once, and Home and the Business calendar are marked stale (not mounted
 * here, so nothing else is read). A refused write invalidates nothing.
 */
export function useBookingSaveWithQuery(): BookingSave {
    const orgId = useOrgId();
    const m = useActionMutation(pass, {
        invalidates: [
            bookingsKeys(orgId),
            homeKeys(orgId),
            calendarKeys(orgId),
        ],
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
    };
}
