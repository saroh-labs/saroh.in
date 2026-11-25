"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { bookingsKeys } from "@/lib/bookings/queries";
import { calendarKeys } from "@/lib/calendar/queries";
import { homeKeys } from "@/lib/home/queries";
import { useOrgId } from "@/lib/query/org";

import type { ServiceAsk } from "./queries";
import {
    serviceEditorRead,
    serviceRead,
    servicesKeys,
    servicesListRead,
} from "./queries";

/** Bookings › Services for the open business (DEC-259). */
export function useServicesList() {
    return useQuery(servicesListRead.options(useOrgId(), {}));
}

/** New service's context. */
export function useServiceEditor() {
    return useQuery(serviceEditorRead.options(useOrgId(), {}));
}

/** One service's page. */
export function useService(ask: ServiceAsk) {
    return useQuery(serviceRead.options(useOrgId(), ask));
}

/**
 * After a service write landed: what Services has on screen is read again
 * (resolving once it is back, so a busy state lasts until the screen has
 * changed). The diary, the bookings list and their availability, the
 * Business calendar and Home name services, so they are marked stale for
 * their next visit. `read: false` marks Services stale too, for a save
 * that leaves the screen (a new service goes to its own page). Never throws: a read that fails is the screen's failed
 * state.
 */
export function servicesSaved(
    qc: QueryClient,
    orgId: string,
    { read = true }: { read?: boolean } = {},
): Promise<void> {
    const stale = { refetchType: "none" } as const;
    return Promise.all([
        qc.invalidateQueries({
            queryKey: servicesKeys(orgId),
            ...(read ? {} : stale),
        }),
        qc.invalidateQueries({ queryKey: bookingsKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: calendarKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: homeKeys(orgId), ...stale }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How a Services part saves: `orgId` goes last to each write (the action
 * runs it through `writeAsOrg`, refusing a moved tab and revalidating
 * nothing), and `saved()` once it landed. A refused write calls nothing.
 */
export interface ServiceSave {
    orgId: string;
    saved: (options?: { read?: boolean }) => Promise<void>;
}

export function useServiceSave(): ServiceSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({
            orgId,
            saved: (options) => servicesSaved(qc, orgId, options),
        }),
        [qc, orgId],
    );
}
