import { PageHeader } from "@saroh/ui/page-header";

import {
    BookingsContainer,
    BookingsListSaves,
} from "@/components/bookings/all-bookings/bookings-container";
import { BookingsCouldntLoad } from "@/components/bookings/all-bookings/bookings-view";
import { BookingsModeSwitch } from "@/components/bookings/all-bookings/bookings-view-switch";
import { ListPageHeader } from "@/components/bookings/all-bookings/list-page-header";
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
import { bookingsCan, seesAmounts } from "@/lib/bookings/access";
import { canReadPacks, canUsePacksOnBookings } from "@/lib/class-packs/access";
import { packsOn } from "@/lib/class-packs/switched-on";
import { businessZone } from "@/lib/format/business-zone";
import { googleMeetOffered } from "@/lib/google-calendar/service";
import { readNoticeReach } from "@/lib/messages/notice-reach-read";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { EVERYONE, openingPerson } from "@/lib/services/bookings-opens";
import { readBookingsOpens } from "@/lib/services/bookings-opens-read";
import { listServices, readNow } from "@/lib/services/service";
import { zoneShortName } from "@/lib/services/time-picker";
import { requireSession } from "@/lib/session";
import { getBookingRules, listStaff } from "@/lib/staff/service";

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
 * On React Query (DEC-259), loaded in the browser: the gates and what the
 * viewer may do are decided here (`lib/bookings/access.ts`, shared with
 * `/api/bookings`); the container reads the list, the first time and every
 * later one, from the address in place (`bookings-container.tsx`). A read
 * that fails says so, with Try again: an empty register would be a lie.
 */
export const metadata = { title: "All bookings" };

// Not `force-dynamic` (DEC-259 asks for a page read per request): the
// session cookie already makes it so, and `force-dynamic` turns off Next's
// fetch memo, so the shell and the module gate would each read the modules.

export default async function BookingsPage() {
    const session = await requireSession();

    // The date filter is the container's, read from the address.
    const organizationRead = resolveActiveOrganization();
    const [services, organization, staffList, opens, can, rules, notices] =
        await Promise.all([
            listServices().catch(() => []),
            organizationRead,
            // Who they'll see, in New booking (U8); without it, anyone.
            listStaff().catch(() => null),
            // Where Bookings opens, and for whom, for this person (DEC-170).
            readBookingsOpens(),
            organizationRead.then(bookingsCan),
            // A row's quick look, as on the calendar: the free-cancel window
            // and what a cancel tells the customer with (A14).
            getBookingRules().catch(() => null),
            readNoticeReach(),
        ]);
    const mine = staffList?.staff.find(
        (p) =>
            p.status === "ACTIVE" && p.membership?.userId === session.user.id,
    );

    if (!organization) {
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
    // The business's own zone, as the list reads it (Q10).
    const timezone = businessZone(organization);

    const page = (
        <PageContainer width="full">
            <ListPageHeader
                opens={opens}
                me={me}
                zone={zoneName(timezone)}
                newBooking={
                    // Only someone who may book: the API refuses the save
                    // otherwise, as the diary already asks. On a phone it
                    // floats above the tab bar (BKMAllBookings).
                    canBook ? (
                        <NewBookingButton className="max-[759px]:fixed max-[759px]:bottom-[calc(16px+var(--tab-bar-inset,0px))] max-[759px]:right-4 max-[759px]:z-30 max-[759px]:h-14 max-[759px]:rounded-full max-[759px]:pl-4 max-[759px]:pr-5 max-[759px]:text-[15px] max-[759px]:shadow-xl min-[760px]:h-11 min-[760px]:px-[18px] min-[760px]:text-[14.5px]" />
                    ) : null
                }
            />
            <div className="space-y-4 max-[759px]:pb-24">
                {canBook ? null : (
                    <ReadOnlyNote className="mb-0">
                        {readOnlyLine("these bookings", true)}
                    </ReadOnlyNote>
                )}
                <BookingsContainer
                    can={can}
                    me={me}
                    initialStaff={who === EVERYONE ? null : who}
                    zone={timezone}
                    now={readNow()}
                    rules={rules}
                    notices={notices}
                />
            </div>
        </PageContainer>
    );
    return (
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
    );
}

/** "IST": the zone's short name, as the calendar's summary says it. */
function zoneName(timezone: string): string {
    return zoneShortName(timezone, readNow()) || timezone;
}
