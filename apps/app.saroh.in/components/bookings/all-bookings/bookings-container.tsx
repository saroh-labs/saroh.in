"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { Moment } from "@/components/shared/notices/moment";
import { SinceNotice } from "@/components/shared/notices/since-notice";
import { ScreenPending } from "@/components/shared/page/screen-pending";
import { bookingsAsk } from "@/lib/bookings/queries";
import {
    BookingSaveContext,
    useBookingSaveWithQuery,
    useBookingsList,
} from "@/lib/bookings/use-bookings";
import { dateRangeOn, readDateRange } from "@/lib/views/date-range";
import { viewParam } from "@/lib/views/search-params";
import { isSince, sinceParam, withoutSince } from "@/lib/views/since";

import type { AllBookingsCan } from "./bookings-view";
import { BookingsCouldntLoad, BookingsView } from "./bookings-view";

/**
 * The bookings list's saves (DEC-259), around everything on the page that
 * writes (the rows' sheets and New booking): each goes through
 * `useActionMutation` with the tab's business and reads the list again.
 */
export function BookingsListSaves({ children }: { children: ReactNode }) {
    return (
        <BookingSaveContext.Provider value={useBookingSaveWithQuery()}>
            {children}
        </BookingSaveContext.Provider>
    );
}

/**
 * All bookings on React Query (DEC-259): the address is the key. A date
 * filter changes the address in place (`ScreenPending` `inPlace`), the
 * rows are read for those days and the last ones stay, greyed, until they
 * land; Back draws a seen range from the cache. `?since=` (Home's "Last 24
 * hours") and `?cancelled=1` narrow or open what was read, in the browser.
 * The first read is the browser's too: the list's own frame (Showing,
 * search, filters) is drawn at once and works, its rows skeletons until
 * the read lands (owner, 25 Nov). The parts stay props-in.
 */
export function BookingsContainer({
    can,
    me,
    initialStaff,
    zone,
    now,
}: {
    /** The business's zone and the page's now, until the read says. */
    zone: string;
    now: number;
    can: AllBookingsCan;
    me: { id: string; name: string } | null;
    initialStaff: string | null;
}) {
    const search = useSearchParams();
    const params = Object.fromEntries(search);
    const dates = readDateRange(params);
    const dated = dateRangeOn(dates);
    const query = useBookingsList(bookingsAsk(dates));
    const data = query.data;
    // A failed first read says so in the list's place, under the header.
    if (!data && query.isError) return <BookingsCouldntLoad />;

    const since = sinceParam(params);
    // From Home's "Last 24 hours" (F6): the confirmed bookings made since
    // then, as Home counted them.
    const rows = !data
        ? null
        : since
          ? data.bookings.filter(
                (b) => b.status === "CONFIRMED" && isSince(b.createdAt, since),
            )
          : data.bookings;

    return (
        <ScreenPending inPlace={{ pending: query.isPlaceholderData }}>
            {/* Only the whole register can say it is the first. */}
            {data?.moment && !dated ? <Moment moment={data.moment} /> : null}
            {since ? (
                <SinceNotice
                    count={rows ? rows.length : null}
                    noun={{ one: "booking", other: "bookings" }}
                    verb="made"
                    clearHref={withoutSince("/bookings/all", params)}
                />
            ) : null}
            <BookingsView
                bookings={rows}
                timezone={data?.timezone ?? zone}
                now={data?.now ?? now}
                // Dated, every booking in the days unless a view is asked
                // for: those days may all be past.
                initialView={viewParam(params) ?? (dated ? "all" : undefined)}
                dates={dates}
                // Not while `?since=` narrows the list: it isn't empty.
                share={since ? null : (data?.share ?? null)}
                me={me}
                showCancelled={search.get("cancelled") === "1"}
                initialStaff={initialStaff}
                can={can}
            />
        </ScreenPending>
    );
}
