import { FailedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { cookies } from "next/headers";

import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { BookingsViewSwitch } from "@/components/bookings/bookings-view-switch";
import { CalendarScreen } from "@/components/bookings/calendar/calendar-screen";
import {
    NewBookingButton,
    NewBookingHost,
} from "@/components/bookings/new-booking/new-booking-host";
import {
    flowServices,
    flowStaff,
} from "@/components/bookings/new-booking/setup";
import { PageContainer } from "@/components/shared/page-container";
import { ShareLinkButton } from "@/components/sites/share-link-button";
import { takesOnlinePayment } from "@/lib/billing/access";
import { canReadPacks, canUsePacksOnBookings } from "@/lib/class-packs/access";
import { packsOn } from "@/lib/class-packs/switched-on";
import { arrivalContactId } from "@/lib/customers/prefill";
import { readCustomerPick } from "@/lib/customers/prefill-read";
import { onlinePayReady } from "@/lib/invoices/payments-on";
import { readNoticeReach } from "@/lib/messages/notice-reach-read";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { canTakeDeskPayments } from "@/lib/services/booking-money";
import {
    LAST_VIEW_COOKIE,
    nothingChoseView,
    openingLayout,
    openingPerson,
} from "@/lib/services/bookings-opens";
import { readBookingsOpens } from "@/lib/services/bookings-opens-read";
import { calendarHref } from "@/lib/services/calendar-href";
import type { LocalDate } from "@/lib/services/diary";
import {
    addDays,
    dayBounds,
    localDateOf,
    monthDays,
    weekStartOf,
} from "@/lib/services/diary";
import {
    listServices,
    readBookingsCalendar,
    readNow,
} from "@/lib/services/service";
import { readServiceHours } from "@/lib/services/service-hours-read";
import { requireSession } from "@/lib/session";
import { BOOKINGS_FIRST_RUN, shareLink } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import type { StaffList } from "@/lib/staff/service";
import { getBookingRules, listStaff } from "@/lib/staff/service";
import { withClosures } from "@/lib/staff/time-off";
import { couldntLoad } from "@saroh/ui/lib/state-copy";

/**
 * Bookings › Calendar (U15). The day by person, the week, or the List (U6,
 * the first view on a phone) — each one read of the bookings (U4) over the
 * range it shows, with the staff read (U3) for hours, time off and free gaps.
 *
 * The staff read degrades on its own: without it the bookings still show
 * and the screen says free times are missing. The bookings read failing is
 * the page failing — a diary with nothing in it would be a lie.
 *
 * The register this page used to be lives on at /bookings/all, the List
 * view of the header's one view switch.
 */
export const metadata = { title: "Bookings" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The people, with the business's closures as everyone's time off (E3), so
 * the calendar offers no free time while the business is closed.
 */
async function readStaff(): Promise<StaffList | null> {
    try {
        const list = await listStaff();
        return list ? withClosures(list) : null;
    } catch {
        return null;
    }
}

export default async function BookingsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await requireSession();
    const [
        params,
        organization,
        staffList,
        rules,
        services,
        notices,
        opens,
        jar,
    ] = await Promise.all([
        searchParams,
        resolveActiveOrganization(),
        readStaff(),
        getBookingRules().catch(() => null),
        listServices(),
        // What a cancelled class tells everyone on it (A14).
        readNoticeReach(),
        // Where Bookings opens for this person (DEC-170).
        readBookingsOpens(),
        cookies(),
    ]);

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
    const timezone = staffList?.timezone ?? "Asia/Kolkata";
    const now = readNow();
    const today = localDateOf(new Date(now), timezone);
    // The view the address names; else the person's "Start Bookings on";
    // else the one last used on this device (Q15, option C).
    const chosen = {
        asked: params.layout,
        start: opens.start,
        lastUsed: jar.get(LAST_VIEW_COOKIE)?.value,
    };
    const layout = openingLayout(chosen);
    // Whose bookings: the address's; else "Show bookings for" (DEC-170).
    const active = (staffList?.staff ?? []).filter(
        (p) => p.status === "ACTIVE",
    );
    const mine = active.find((p) => p.membership?.userId === session.user.id);
    const person = openingPerson({
        asked: params.person,
        opens,
        people: active.map((p) => p.id),
        me: mine?.id ?? null,
    });
    const date: LocalDate =
        typeof params.date === "string" && DATE.test(params.date)
            ? params.date
            : today;

    // The day's week and its month, whatever the layout: the view draws its
    // day or week, and the date sheet counts each day of both (U2).
    const { days } = monthDays(date);
    const weekFirst = weekStartOf(date);
    const weekLast = addDays(weekFirst, 6);
    const monthFirst = days[0] ?? date;
    const monthLast = days.at(-1) ?? date;
    const first = weekFirst < monthFirst ? weekFirst : monthFirst;
    const last = weekLast > monthLast ? weekLast : monthLast;
    const [calendar, serviceHours] = await Promise.all([
        readBookingsCalendar(
            dayBounds(first, timezone).from.toISOString(),
            dayBounds(last, timezone).to.toISOString(),
        ),
        // With nobody on the diary, customers book each service in its own
        // hours: the calendar draws them, as the booking page offers them
        // (UX-023).
        readServiceHours(services, staffList),
    ]);

    if (!calendar) {
        return (
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Bookings", "Calendar"]}
                    title="Calendar"
                    meta={<BookingsViewSwitch current={layout} date={date} />}
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
    const arriving = params.new === "1" && may("booking:write");
    const forContact = arriving ? arrivalContactId(params) : null;
    const initialWho =
        forContact && people.canSearch
            ? await readCustomerPick(forContact)
            : null;
    // A quiet day on List offers "Share your booking page" while it is
    // live (DEC-069, L8). Read only for List, for someone who may book; a
    // read that fails, or a role it isn't shown to, leaves it out.
    const share =
        layout === "agenda" && may("booking:write")
            ? shareLink(await readWebAddressLinks(), BOOKINGS_FIRST_RUN)
            : null;
    const canUsePacks =
        canReadPacks(organization) &&
        canUsePacksOnBookings(organization) &&
        packsOn(await modulesOrUnknown());
    const screen = (
        <CalendarScreen
            layout={layout}
            date={date}
            today={today}
            now={now}
            timezone={calendar.timezone || timezone}
            calendar={calendar}
            staff={staffList?.staff ?? null}
            services={services}
            rules={rules}
            notices={notices}
            limitNotice={<PlanLimitNotice moduleId="bookings" />}
            serviceHours={serviceHours}
            // Cancelled bookings stay off the diary unless the address
            // asks for them, so a reload keeps the choice.
            showCancelled={params.cancelled === "1"}
            person={person}
            opens={opens}
            me={mine ? { id: mine.id, name: mine.name } : null}
            share={
                share ? <ShareLinkButton link={share} className="mt-0" /> : null
            }
            // Nothing chose the view: a phone moves to List (Q4, U6).
            listFirst={nothingChoseView(chosen)}
            people={people}
            can={{
                book: may("booking:write"),
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
                    online: takesOnlinePayment(await billingAccessOrNull()),
                },
            }}
            newBooking={
                may("booking:write") ? (
                    <NewBookingButton
                        // Keyed: it renders among the screen's own children.
                        key="new-booking"
                        // Beside "…" on the desk; on a phone it floats
                        // over the calendar, above the tab bar (U2).
                        className="max-[759px]:fixed max-[759px]:bottom-[calc(16px+var(--tab-bar-inset,0px))] max-[759px]:right-4 max-[759px]:z-30 max-[759px]:h-14 max-[759px]:rounded-full max-[759px]:pl-4 max-[759px]:pr-5 max-[759px]:text-[15px] max-[759px]:shadow-xl min-[760px]:h-11 min-[760px]:px-[18px] min-[760px]:text-[14.5px]"
                        date={params.date === undefined ? null : date}
                    />
                ) : null
            }
        />
    );
    return (
        <PageContainer width="full">
            {may("booking:write") ? (
                <NewBookingHost
                    setup={{
                        services: flowServices(services),
                        staff: flowStaff(staffList?.staff ?? null),
                        people,
                        // Paying with a class pack spends one (ADR-007),
                        // while Class packs is on (E12).
                        canUsePacks,
                        timezone: calendar.timezone || timezone,
                        showMoney: calendar.money,
                        business: organization?.name ?? null,
                        now,
                    }}
                    arrival={
                        arriving
                            ? {
                                  who: initialWho,
                                  date:
                                      typeof params.date === "string" &&
                                      DATE.test(params.date)
                                          ? params.date
                                          : null,
                              }
                            : null
                    }
                >
                    {screen}
                </NewBookingHost>
            ) : (
                screen
            )}
        </PageContainer>
    );
}
