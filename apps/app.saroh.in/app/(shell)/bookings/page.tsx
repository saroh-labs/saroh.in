import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import Link from "next/link";

import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { CalendarScreen } from "@/components/bookings/calendar/calendar-screen";
import { BARE, BookingsTopBar } from "@/components/bookings/calendar/parts";
import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { PageContainer } from "@/components/shared/page-container";
import { takesOnlinePayment } from "@/lib/billing/access";
import { canReadPacks, canUsePacksOnBookings } from "@/lib/class-packs/access";
import { packsOn } from "@/lib/class-packs/switched-on";
import { onlinePayReady } from "@/lib/invoices/payments-on";
import { readNoticeReach } from "@/lib/messages/notice-reach-read";
import { modulesOrUnknown } from "@/lib/modules/guard";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import type { CalendarLayout } from "@/lib/services/calendar-href";
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
import type { StaffList } from "@/lib/staff/service";
import { getBookingRules, listStaff } from "@/lib/staff/service";
import { withClosures } from "@/lib/staff/time-off";

/**
 * Bookings › Calendar (U15). The day by person by default, the week, or the
 * agenda with its month — each one read of the bookings (U4) over the range
 * it shows, with the staff read (U3) for hours, time off and free gaps.
 *
 * The staff read degrades on its own: without it the bookings still show
 * and the screen says free times are missing. The bookings read failing is
 * the page failing — a diary with nothing in it would be a lie.
 *
 * The register this page used to be lives on at /bookings/all.
 */
export const metadata = { title: "Bookings" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function layoutOf(value: unknown): CalendarLayout {
    return value === "week" || value === "agenda" ? value : "day";
}

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
    await requireSession();
    const [params, organization, staffList, rules, services, notices] =
        await Promise.all([
            searchParams,
            resolveActiveOrganization(),
            readStaff(),
            getBookingRules().catch(() => null),
            listServices(),
            // What a cancelled class tells everyone on it (A14).
            readNoticeReach(),
        ]);

    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    // New booking finds the customer by search (E4, `contact:read`) and can
    // send a pay link when the viewer may issue the invoice, the plan takes
    // online payment and a provider is connected to take the money. On a
    // plan without online payments it starts on "Pays at the session" (R33).
    const people = {
        canSearch: may("contact:read"),
        payLink:
            may("booking:write") &&
            may("invoice:write") &&
            (await onlinePayReady()),
    };
    const timezone = staffList?.timezone ?? "Asia/Kolkata";
    const now = readNow();
    const today = localDateOf(new Date(now), timezone);
    const layout = layoutOf(params.layout);
    const date: LocalDate =
        typeof params.date === "string" && DATE.test(params.date)
            ? params.date
            : today;

    // The range the layout shows: the day, its week, or its month.
    const [first, last] =
        layout === "week"
            ? [weekStartOf(date), addDays(weekStartOf(date), 6)]
            : layout === "agenda"
              ? (() => {
                    const { days } = monthDays(date);
                    return [days[0] ?? date, days.at(-1) ?? date];
                })()
              : [date, date];
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
            <PageContainer width="full" className={BARE}>
                <BookingsTopBar page="Calendar" />
                <div className="px-[22px] pb-6 pt-[18px]">
                    <FailedState
                        title="Couldn't load the calendar"
                        description="Nothing has been changed. Try again in a moment."
                        action={
                            <Button asChild variant="outline">
                                <Link href={calendarHref(layout, date)}>
                                    Try again
                                </Link>
                            </Button>
                        }
                    />
                </div>
            </PageContainer>
        );
    }

    const active = services.filter((s) => s.status === "ACTIVE");
    return (
        <PageContainer width="full" className={BARE}>
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
                people={people}
                can={{
                    book: may("booking:write"),
                    hours: may("service:write"),
                    order: may("order:read"),
                    // "Take ₹X" (P2): the pair a pay link needs, and the
                    // link itself only where the plan and a provider take it.
                    desk: {
                        canTake: may("booking:write") && may("invoice:write"),
                        canLink: people.payLink,
                        online: takesOnlinePayment(await billingAccessOrNull()),
                    },
                }}
                newBooking={
                    may("booking:write") ? (
                        <NewBookingDialog
                            // Keyed: it renders among the screen's own children.
                            key="new-booking"
                            plainTrigger
                            triggerClassName="h-[38px] rounded-[9px] px-4 text-[13px]"
                            services={active.map((s) => ({
                                id: s.id,
                                name: s.name,
                                timezone: s.timezone,
                                minutes: s.durationMinutes,
                                priceCents: s.priceCents,
                            }))}
                            people={people}
                            // Paying with a class pack spends one (ADR-007),
                            // while Class packs is on (E12).
                            canUsePacks={
                                canReadPacks(organization) &&
                                canUsePacksOnBookings(organization) &&
                                packsOn(await modulesOrUnknown())
                            }
                        />
                    ) : null
                }
            />
        </PageContainer>
    );
}
