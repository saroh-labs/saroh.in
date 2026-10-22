import { PageHeader } from "@saroh/ui/page-header";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import {
    BookingsCouldntLoad,
    BookingsView,
} from "@/components/bookings/all-bookings/bookings-view";
import {
    NewBookingButton,
    NewBookingHost,
} from "@/components/bookings/new-booking/new-booking-host";
import {
    flowServices,
    flowStaff,
} from "@/components/bookings/new-booking/setup";
import { Moment } from "@/components/shared/notices/moment";
import { SinceNotice } from "@/components/shared/notices/since-notice";
import { PageContainer } from "@/components/shared/page/page-container";
import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { readOnlyLine } from "@/lib/access/who-can-change";
import { takesOnlinePayment } from "@/lib/billing/access";
import { canReadPacks, canUsePacksOnBookings } from "@/lib/class-packs/access";
import { packsOn } from "@/lib/class-packs/switched-on";
import { onlinePayReady } from "@/lib/invoices/payments-on";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { bookingsListMoment } from "@/lib/moments/read";
import { permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { canTakeDeskPayments } from "@/lib/services/booking-money";
import {
    flattenCalendar,
    listServices,
    readBookingsRegister,
    readNow,
} from "@/lib/services/service";
import { zoneShortName } from "@/lib/services/time-picker";
import { requireSession } from "@/lib/session";
import { BOOKINGS_FIRST_RUN, shareLink } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import { listStaff } from "@/lib/staff/service";
import { viewParam } from "@/lib/views/search-params";
import { isSince, sinceParam, withoutSince } from "@/lib/views/since";

/**
 * Every booking as one list (S4-003; U11 of the bookings plan,
 * BKMAllBookings and BKDAllBookings): the register behind the calendar,
 * one press from its "…" options and back by "Back to the calendar". Kept
 * whole, because its views (upcoming, waiting to be marked, awaiting
 * payment) answer questions a diary does not.
 *
 * PAST bookings are included (#241): the appointments waiting to be
 * marked have to be somewhere a merchant can find them. Every time is in
 * the business's zone, labelled (Q10, decided 19 Oct).
 *
 * The page reads and decides what the viewer may do; `BookingsView` draws.
 * A read that fails says so, with Try again: an empty register would be a
 * lie.
 */
export const metadata = { title: "All bookings" };

const BACK = (
    <Link
        href="/bookings"
        className="mb-2 inline-flex items-center gap-1 rounded-sm text-[12.5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to the calendar
    </Link>
);

export default async function BookingsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();

    const [calendar, params, services, organization, staffList] =
        await Promise.all([
            readBookingsRegister(),
            searchParams,
            listServices().catch(() => []),
            resolveActiveOrganization(),
            // Who they'll see, in New booking (U8); without it, anyone.
            listStaff().catch(() => null),
        ]);
    const may = permitsFor(organization);

    if (!calendar) {
        return (
            <PageContainer width="full">
                {BACK}
                <PageHeader title="All bookings" />
                <BookingsCouldntLoad />
            </PageContainer>
        );
    }

    const every = flattenCalendar(calendar);
    // New booking finds the customer by search (E4) and can send a payment
    // link; someone who can't take payment sees it locked, saying why (U8).
    const online = await onlinePayReady();
    const people = {
        canSearch: may("contact:read"),
        payLink: may("booking:write") && may("invoice:write") && online,
        canTakePayment: canTakeDeskPayments(organization),
        onlinePay: online,
    };

    // From Home's "Last 24 hours" (F6): the confirmed bookings made since
    // then, as Home counted them.
    const since = sinceParam(params);
    const rows = since
        ? every.filter(
              (b) => b.status === "CONFIRMED" && isSince(b.createdAt, since),
          )
        : every;

    // The business's first booking (wave G), said once.
    const moment = await bookingsListMoment(every, organization);

    // No bookings at all yet: "Share your booking page" while it is live
    // (DEC-069, L8). Only then is the web address read, and a read that
    // fails (or a role it isn't shown to) just leaves the button out.
    const share =
        every.length === 0 && !since
            ? shareLink(await readWebAddressLinks(), BOOKINGS_FIRST_RUN)
            : null;

    const canBook = may("booking:write");
    const timezone = calendar.timezone || "Asia/Kolkata";

    const page = (
        <PageContainer width="full">
            {BACK}
            <PageHeader
                title="All bookings"
                holdsData={false}
                count={rows.length > 0 ? `${rows.length} in all` : null}
                description={`Times in ${zoneName(timezone)}, your business's time zone.`}
                actions={
                    // Only someone who may book: the API refuses the save
                    // otherwise, as the diary already asks. On a phone it
                    // floats above the tab bar (BKMAllBookings).
                    canBook ? (
                        <NewBookingButton className="max-[759px]:fixed max-[759px]:bottom-[calc(16px+var(--tab-bar-inset,0px))] max-[759px]:right-4 max-[759px]:z-30 max-[759px]:h-14 max-[759px]:rounded-full max-[759px]:pl-4 max-[759px]:pr-5 max-[759px]:text-[15px] max-[759px]:shadow-xl min-[760px]:h-11 min-[760px]:px-[18px] min-[760px]:text-[14.5px]" />
                    ) : null
                }
            />
            <div className="space-y-4 max-[759px]:pb-20">
                {canBook ? null : (
                    <ReadOnlyNote className="mb-0">
                        {readOnlyLine("these bookings", true)}
                    </ReadOnlyNote>
                )}
                {moment ? <Moment moment={moment} /> : null}
                {since ? (
                    <SinceNotice
                        count={rows.length}
                        noun={{ one: "booking", other: "bookings" }}
                        verb="made"
                        clearHref={withoutSince("/bookings/all", params)}
                    />
                ) : null}
                <BookingsView
                    bookings={rows}
                    timezone={timezone}
                    now={readNow()}
                    initialView={viewParam(params)}
                    share={share}
                    can={{
                        book: canBook,
                        // "Take ₹X" (P2): the pair a payment link needs.
                        take: canTakeDeskPayments(organization),
                        people: may("contact:read"),
                        refund: may("payment:manage"),
                        readOrder: may("order:read"),
                        link: people.payLink,
                        online: takesOnlinePayment(await billingAccessOrNull()),
                    }}
                />
            </div>
        </PageContainer>
    );
    if (!canBook) return page;
    return (
        <NewBookingHost
            setup={{
                services: flowServices(services),
                staff: flowStaff(staffList?.staff ?? null),
                people,
                // Paying with a class pack spends one (ADR-007), while Class
                // packs is on (E12).
                canUsePacks:
                    canReadPacks(organization) &&
                    canUsePacksOnBookings(organization) &&
                    packsOn(await modulesOrUnknown()),
                timezone,
                // Prices as the API shows them (DEC-020, DEC-098).
                showMoney:
                    may("payment:read") || canTakeDeskPayments(organization),
                business: organization?.name ?? null,
                now: readNow(),
            }}
        >
            {page}
        </NewBookingHost>
    );
}

/** "IST": the zone's short name, as the calendar's summary says it. */
function zoneName(timezone: string): string {
    return zoneShortName(timezone, readNow()) || timezone;
}
