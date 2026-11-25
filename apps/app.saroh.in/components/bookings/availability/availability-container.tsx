"use client";

import { FailedState } from "@saroh/ui/data-state";
import { PartialRead } from "@saroh/ui/failed-read";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { PageLoading } from "@/components/shared/page/page-loading";
import {
    BookingSaveContext,
    useAvailability,
    useBookingSaveWithQuery,
} from "@/lib/bookings/use-bookings";

import { AvailabilityEditor } from "./availability-editor";
import { HoursHeader } from "./hours-header";

/**
 * Hours and time off on React Query (U25, DEC-259): the header is drawn at
 * once from the page's gates, the editor's region is its skeleton until
 * the read lands. Every save on it (hours, time off, extra hours, rules,
 * someone added) goes through the bookings saves: this read is read once
 * again, the diary's and the list's (the same `bookings` domain) and the
 * Business calendar are marked stale.
 */
export function AvailabilityContainer({
    person,
    business,
    me,
    meId,
    canEdit,
    canManage,
    seatNote,
    limitNotice,
}: {
    person: string | null;
    business: string;
    me: string;
    meId: string | null;
    canEdit: boolean;
    canManage: boolean;
    seatNote: string | null;
    /** The plan's seat notice, drawn by the page (a server read). */
    limitNotice: ReactNode;
}) {
    const saves = useBookingSaveWithQuery();
    const { data, isError } = useAvailability();
    // One object per answer: the person rules take a new one as new data.
    const personRules = useMemo(
        () =>
            data ? { meId, requests: data.requests, mine: data.mine } : null,
        [data, meId],
    );

    if (!data || !personRules) {
        return (
            <>
                {limitNotice}
                <HoursHeader readOnly={!canEdit} />
                {isError ? (
                    <FailedState
                        title={couldntLoad("everyone's hours")}
                        retryHref="/bookings/availability"
                    />
                ) : (
                    <PageLoading
                        bare
                        shape="editor"
                        width="full"
                        label="Loading availability"
                    />
                )}
            </>
        );
    }
    return (
        <BookingSaveContext.Provider value={saves}>
            {data.kept ? null : (
                <PartialRead
                    className="mb-3"
                    things="bookings"
                    so="The hours below can't say which bookings they would leave out."
                />
            )}
            {limitNotice}
            <AvailabilityEditor
                staff={data.staff}
                closures={data.closures}
                openingHours={data.openingHours}
                rules={data.rules}
                serviceHours={data.serviceHours}
                services={data.services}
                seatNote={seatNote}
                timezone={data.timezone}
                today={data.today}
                kept={data.kept}
                bookedOn={data.bookedOn}
                person={person}
                business={business}
                me={me}
                canEdit={canEdit}
                canManage={canManage}
                onlineBlocker={data.onlineBlocker}
                personRules={personRules}
            />
        </BookingSaveContext.Provider>
    );
}
