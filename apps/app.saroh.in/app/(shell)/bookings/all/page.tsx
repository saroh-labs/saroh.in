import { PageHeader } from "@saroh/ui/page-header";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import {
    BookingsContainer,
    BookingsListSaves,
} from "@/components/bookings/all-bookings/bookings-container";
import { BookingsCouldntLoad } from "@/components/bookings/all-bookings/bookings-view";
import { BookingsModeSwitch } from "@/components/bookings/all-bookings/bookings-view-switch";
import { ListOptions } from "@/components/bookings/all-bookings/list-options";
import {
    NewBookingButton,
    NewBookingHost,
} from "@/components/bookings/new-booking/new-booking-host";
import {
    flowServices,
    flowStaff,
} from "@/components/bookings/new-booking/setup";
import { PageContainer } from "@/components/shared/page/page-container";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { readOnlyLine } from "@/lib/access/who-can-change";
import {
    bookingsCan,
    bookingsServer,
    seesAmounts,
} from "@/lib/bookings/access";
import { bookingsAsk, bookingsRead } from "@/lib/bookings/queries";
import { canReadPacks, canUsePacksOnBookings } from "@/lib/class-packs/access";
import { packsOn } from "@/lib/class-packs/switched-on";
import { googleMeetOffered } from "@/lib/google-calendar/service";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { bookingsListMoment } from "@/lib/moments/read";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { prefetchRead } from "@/lib/query/prefetch";
import { getServerQueryClient } from "@/lib/query/server-client";
import { EVERYONE, openingPerson } from "@/lib/services/bookings-opens";
import { readBookingsOpens } from "@/lib/services/bookings-opens-read";
import { listServices, readNow } from "@/lib/services/service";
import { zoneShortName } from "@/lib/services/time-picker";
import { requireSession } from "@/lib/session";
import { BOOKINGS_FIRST_RUN, shareLink } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import { listStaff } from "@/lib/staff/service";
import { dateRangeOn, readDateRange } from "@/lib/views/date-range";
import { sinceParam } from "@/lib/views/since";

/**
 * Every booking as one list (S4-003; U11 of the bookings plan,
 * BKMAllBookings and BKDAllBookings): the register behind the calendar,
 * the List of the Calendar | List switch (the calendar's "All bookings" link
 * and "Back to the calendar" are gone; `/bookings/all` still opens it). Kept
 * whole, because its views (upcoming, waiting to be marked, awaiting
 * payment) answer questions a diary does not.
 *
 * PAST bookings are included (#241): the appointments waiting to be
 * marked have to be somewhere a merchant can find them. Every time is in
 * the business's zone, labelled (Q10, decided 19 Oct).
 *
 * `?date=` (a preset, or `custom` with `?from=`/`?to=`, Orders' params) asks
 * the API for the bookings starting on those days, however far back.
 *
 * On React Query (DEC-259): the gates and what the viewer may do are
 * decided here (`lib/bookings/access.ts`, shared with `/api/bookings`), the
 * first read is prefetched and hydrated, and the container reads every
 * later one from the address in place (`bookings-container.tsx`). A read
 * that fails says so, with Try again: an empty register would be a lie.
 */
export const metadata = { title: "All bookings" };

// Not `force-dynamic` (DEC-259 asks for a page read per request): the
// session cookie already makes it so, and `force-dynamic` turns off Next's
// fetch memo, so the shell and the module gate would each read the modules.

export default async function BookingsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await requireSession();

    const [params, services, organization, staffList, opens] =
        await Promise.all([
            searchParams,
            listServices().catch(() => []),
            resolveActiveOrganization(),
            // Who they'll see, in New booking (U8); without it, anyone.
            listStaff().catch(() => null),
            // Where Bookings opens, and for whom, for this person (DEC-170).
            readBookingsOpens(),
        ]);
    const dates = readDateRange(params);
    const dated = dateRangeOn(dates);
    const ask = bookingsAsk(dates);
    const client = getServerQueryClient();
    const [, can] = await Promise.all([
        // A date filter asks the API for those days (by start); without
        // one, the register's two years. Awaited: the first booking's
        // moment and the first-run share are said from it.
        organization
            ? prefetchRead(client, bookingsServer, organization.id, ask)
            : null,
        bookingsCan(organization),
    ]);
    const list = organization
        ? client.getQueryData(
              bookingsRead.options(organization.id, ask).queryKey,
          )
        : undefined;
    const mine = staffList?.staff.find(
        (p) =>
            p.status === "ACTIVE" && p.membership?.userId === session.user.id,
    );

    if (!organization || !list) {
        return (
            <PageContainer width="full">
                <PageHeader
                    title="All bookings"
                    holdsData={false}
                    meta={<BookingsModeSwitch current="list" />}
                />
                <BookingsCouldntLoad />
            </PageContainer>
        );
    }

    const every = list.bookings;
    const since = sinceParam(params);
    // The business's first booking (wave G), said once.
    // Only the whole register can say it is the first.
    const moment = dated ? null : await bookingsListMoment(every, organization);

    // No bookings at all yet: "Share your booking page" while it is live
    // (DEC-069, L8). Only then is the web address read, and a read that
    // fails (or a role it isn't shown to) just leaves the button out.
    const share =
        every.length === 0 && !since && !dated
            ? shareLink(await readWebAddressLinks(), BOOKINGS_FIRST_RUN)
            : null;

    const canBook = can.book;
    const me = mine ? { id: mine.id, name: mine.name } : null;
    // "Show bookings for": Just me, or the last pick, narrows the list at
    // the start; Everyone narrows nothing.
    const who = openingPerson({
        asked: undefined,
        opens,
        people: (staffList?.staff ?? [])
            .filter((p) => p.status === "ACTIVE")
            .map((p) => p.id),
        me: mine?.id ?? null,
    });
    const timezone = list.timezone;

    const page = (
        <PageContainer width="full">
            <PageHeader
                title="All bookings"
                holdsData={false}
                meta={<BookingsModeSwitch current="list" />}
                description={`Times in ${zoneName(timezone)}`}
                actions={
                    // Only someone who may book: the API refuses the save
                    // otherwise, as the diary already asks. On a phone it
                    // floats above the tab bar (BKMAllBookings).
                    <>
                        <ListOptions opens={opens} me={me} />
                        {canBook ? (
                            <NewBookingButton className="max-[759px]:fixed max-[759px]:bottom-[calc(16px+var(--tab-bar-inset,0px))] max-[759px]:right-4 max-[759px]:z-30 max-[759px]:h-14 max-[759px]:rounded-full max-[759px]:pl-4 max-[759px]:pr-5 max-[759px]:text-[15px] max-[759px]:shadow-xl min-[760px]:h-11 min-[760px]:px-[18px] min-[760px]:text-[14.5px]" />
                        ) : null}
                    </>
                }
            />
            <div className="space-y-4 max-[759px]:pb-20">
                {canBook ? null : (
                    <ReadOnlyNote className="mb-0">
                        {readOnlyLine("these bookings", true)}
                    </ReadOnlyNote>
                )}
                <BookingsContainer
                    can={can}
                    me={me}
                    initialStaff={who === EVERYONE ? null : who}
                    share={share}
                    moment={moment}
                />
            </div>
        </PageContainer>
    );
    return (
        <HydrationBoundary state={dehydrate(client)}>
            <BookingsListSaves>
                {canBook ? (
                    <NewBookingHost
                        setup={{
                            services: flowServices(services),
                            staff: flowStaff(staffList?.staff ?? null),
                            people: {
                                canSearch: can.people,
                                payLink: can.link,
                                canTakePayment: can.take,
                                onlinePay: can.onlinePay,
                            },
                            // Paying with a class pack spends one (ADR-007),
                            // while Class packs is on (E12).
                            canUsePacks:
                                canReadPacks(organization) &&
                                canUsePacksOnBookings(organization) &&
                                packsOn(await modulesOrUnknown()),
                            timezone,
                            // Prices as the API shows them (DEC-020, DEC-098).
                            showMoney: seesAmounts(organization),
                            business: organization.name,
                            meet: await googleMeetOffered(),
                            now: readNow(),
                        }}
                    >
                        {page}
                    </NewBookingHost>
                ) : (
                    page
                )}
            </BookingsListSaves>
        </HydrationBoundary>
    );
}

/** "IST": the zone's short name, as the calendar's summary says it. */
function zoneName(timezone: string): string {
    return zoneShortName(timezone, readNow()) || timezone;
}
