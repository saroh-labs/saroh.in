import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { PageHeader } from "@saroh/ui/page-header";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { BookingsModeSwitch } from "@/components/bookings/all-bookings/bookings-view-switch";
import { DiaryContainer } from "@/components/bookings/calendar/diary-container";
import { GoogleCalendarLine } from "@/components/bookings/calendar/google-calendar-line";
import { flowServices } from "@/components/bookings/new-booking/setup";
import { PageContainer } from "@/components/shared/page/page-container";
import { ShareLinkButton } from "@/components/shared/share-link/share-link-button";
import { rowNotice, takesOnlinePayment } from "@/lib/billing/access";
import { diaryServer } from "@/lib/bookings/access";
import type { BookingsDiary } from "@/lib/bookings/queries";
import { diaryAsk, diaryRead } from "@/lib/bookings/queries";
import { canReadPacks, canUsePacksOnBookings } from "@/lib/class-packs/access";
import { packsOn } from "@/lib/class-packs/switched-on";
import { arrivalContactId } from "@/lib/customers/prefill";
import { readCustomerPick } from "@/lib/customers/prefill-read";
import { DEFAULT_BUSINESS_ZONE } from "@/lib/format/business-zone";
import {
    googleMeetOffered,
    readGoogleCalendar,
} from "@/lib/google-calendar/service";
import { bookingsCalendarLine } from "@/lib/google-calendar/words";
import { onlinePayReady } from "@/lib/invoices/payments-on";
import { readNoticeReach } from "@/lib/messages/notice-reach-read";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { prefetchRead } from "@/lib/query/prefetch";
import { getServerQueryClient } from "@/lib/query/server-client";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { canTakeDeskPayments } from "@/lib/services/booking-money";
import {
    LAST_VIEW_COOKIE,
    openingLayout,
    opensOnList,
} from "@/lib/services/bookings-opens";
import { readBookingsOpens } from "@/lib/services/bookings-opens-read";
import { calendarHref } from "@/lib/services/calendar-href";
import type { LocalDate } from "@/lib/services/diary";
import { localDateOf } from "@/lib/services/diary";
import { listServices, readNow } from "@/lib/services/service";
import { requireSession } from "@/lib/session";
import { BOOKINGS_FIRST_RUN, shareLink } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import { getBookingRules } from "@/lib/staff/service";

/**
 * Bookings › Calendar (U15). The day by person, the week, or the Agenda (U6,
 * the first view on a phone) — each one read of the bookings (U4) over the
 * range it shows, with the staff read (U3) for hours, time off and free gaps.
 *
 * The staff read degrades on its own: without it the bookings still show
 * and the screen says free times are missing. The bookings read failing is
 * the page failing — a diary with nothing in it would be a lie.
 *
 * The register this page used to be lives on at /bookings/all, the List
 * of the header's Calendar | List switch.
 *
 * On React Query (DEC-259): the gates and what the viewer may do are
 * decided here, the first diary read (`lib/bookings/access.ts`, shared
 * with `/api/bookings/diary`) is prefetched and hydrated, and the
 * container reads every later day, week or person from the address in
 * place (`diary-container.tsx`).
 */
export const metadata = { title: "Bookings" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function BookingsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await requireSession();
    const [params, organization, rules, services, notices, opens, jar] =
        await Promise.all([
            searchParams,
            resolveActiveOrganization(),
            getBookingRules().catch(() => null),
            listServices(),
            // What a cancelled class tells everyone on it (A14).
            readNoticeReach(),
            // Where Bookings opens for this person (DEC-170).
            readBookingsOpens(),
            cookies(),
        ]);
    const lastUsed = jar.get(LAST_VIEW_COOKIE)?.value ?? null;

    // "Where I left it" was the List: `/bookings` opens it there (BKVKept).
    if (opensOnList({ params, start: opens.start, lastUsed })) {
        redirect("/bookings/all");
    }

    const may = permitsFor(organization);
    // New booking finds the customer by search (E4, `contact:read`) and can
    // send a payment link when the viewer may issue the invoice, the plan takes
    // online payment and a provider is connected to take the money. On a
    // plan without online payments it starts on "Pays at the visit" (R33).
    // Someone who can't take payment (the front desk) sees Paid now and the
    // link locked, saying why (U8).
    const online = await onlinePayReady();
    const people = {
        canSearch: may("contact:read"),
        payLink: may("booking:write") && may("invoice:write") && online,
        canTakePayment: canTakeDeskPayments(organization),
        onlinePay: online,
    };
    const now = readNow();
    const layout = openingLayout({
        asked: params.layout,
        start: opens.start,
        lastUsed,
    });
    const asked =
        typeof params.date === "string" && DATE.test(params.date)
            ? params.date
            : null;

    // The diary for the day's week and month, in the business's zone: the
    // first read names it, and on the rare hour today there is another day
    // than in the zone guessed, today's is read instead.
    const client = getServerQueryClient();
    const readFor = async (date: LocalDate) => {
        if (!organization) return undefined;
        const ask = diaryAsk(date);
        await prefetchRead(client, diaryServer, organization.id, ask);
        return client.getQueryData<BookingsDiary>(
            diaryRead.key(organization.id, ask),
        );
    };
    const guess = localDateOf(new Date(now), DEFAULT_BUSINESS_ZONE);
    let diary = await readFor(asked ?? guess);
    let zone = diary?.zone ?? DEFAULT_BUSINESS_ZONE;
    if (diary && !asked && localDateOf(new Date(now), zone) !== guess) {
        diary = await readFor(localDateOf(new Date(now), zone));
    }
    zone = diary?.zone ?? zone;
    const date = asked ?? localDateOf(new Date(now), zone);

    if (!organization || !diary) {
        return (
            <PageContainer width="full">
                <PageHeader
                    title="Bookings"
                    holdsData={false}
                    meta={<BookingsModeSwitch current="calendar" />}
                />
                <div>
                    <FailedState
                        title={couldntLoad("the calendar")}
                        retryHref={calendarHref(layout, date)}
                    />
                </div>
            </PageContainer>
        );
    }

    // Opened from a person's page (#247, `?new=1&contactId=`): New booking
    // arrives open with them chosen, read only for someone who may book
    // and search. From the Calendar's "Book on this day" (`?date=…&new=1`)
    // it opens on that day (U8). With no service yet it says how to add one.
    const canBook = may("booking:write");
    const arriving = params.new === "1" && canBook;
    const forContact = arriving ? arrivalContactId(params) : null;
    const initialWho =
        forContact && people.canSearch
            ? await readCustomerPick(forContact)
            : null;
    // A quiet day on Agenda offers "Share your booking page" while it is
    // live (DEC-069, L8), for someone who may book; the layout changes in
    // place, so it is read on whichever view opens. A read that fails
    // leaves it out.
    const [calendarRead, access, modules, meet, links] = await Promise.all([
        readGoogleCalendar(),
        billingAccessOrNull(),
        modulesOrUnknown(),
        canBook ? googleMeetOffered() : false,
        canBook ? readWebAddressLinks() : null,
    ]);
    const share = links ? shareLink(links, BOOKINGS_FIRST_RUN) : null;
    // The person's own Google Calendar: Connect, or a lapsed account,
    // held back while the plan's bookings notice is up (one at a time).
    const gcLine = rowNotice(access, "bookings").on
        ? null
        : bookingsCalendarLine(calendarRead);

    return (
        <PageContainer width="full">
            <HydrationBoundary state={dehydrate(client)}>
                <DiaryContainer
                    zone={zone}
                    now={now}
                    userId={session.user.id}
                    opens={opens}
                    lastUsed={lastUsed}
                    services={services}
                    rules={rules}
                    notices={notices}
                    limitNotice={<PlanLimitNotice moduleId="bookings" />}
                    calendarLine={
                        gcLine ? (
                            <GoogleCalendarLine
                                line={gcLine}
                                userId={session.user.id}
                            />
                        ) : null
                    }
                    share={
                        share ? (
                            <ShareLinkButton link={share} className="mt-0" />
                        ) : null
                    }
                    // A booked message names the business (U9, Q12).
                    business={organization.name}
                    people={people}
                    can={{
                        book: canBook,
                        // Open or block time: a Member keeps anyone's hours
                        // (DEC-170, Q13); adding people stays `service:write`.
                        hours: may("hours:write"),
                        addPeople: may("service:write"),
                        order: may("order:read"),
                        // Refund what a late cancel keeps, or keep what the
                        // policy returns (DEC-170, Q14).
                        refund: may("payment:manage"),
                        // "Take ₹X" (P2): the pair a payment link needs, and the
                        // link itself only where the plan and a provider take it.
                        desk: {
                            canTake: canTakeDeskPayments(organization),
                            canLink: people.payLink,
                            online: takesOnlinePayment(access),
                        },
                    }}
                    setup={
                        canBook
                            ? {
                                  services: flowServices(services),
                                  people,
                                  // Paying with a class pack spends one
                                  // (ADR-007), while Class packs is on (E12).
                                  canUsePacks:
                                      canReadPacks(organization) &&
                                      canUsePacksOnBookings(organization) &&
                                      packsOn(modules),
                                  business: organization.name,
                                  meet,
                                  now,
                              }
                            : null
                    }
                    arrival={arriving ? { who: initialWho, date: asked } : null}
                />
            </HydrationBoundary>
        </PageContainer>
    );
}
