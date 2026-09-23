import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import Link from "next/link";

import type { CalendarLayout } from "@/components/bookings/calendar/calendar-screen";
import {
    calendarHref,
    CalendarScreen,
} from "@/components/bookings/calendar/calendar-screen";
import { BARE, BookingsTopBar } from "@/components/bookings/calendar/parts";
import { NewBookingDialog } from "@/components/bookings/new-booking-dialog";
import { PageContainer } from "@/components/shared/page-container";
import { canReadPacks, canWritePacks } from "@/lib/class-packs/access";
import { listContacts } from "@/lib/contacts/service";
import { contactName } from "@/lib/crm/format";
import { resolveActiveOrganization } from "@/lib/organizations/service";
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
import { requireSession } from "@/lib/session";
import type { StaffList } from "@/lib/staff/service";
import { getBookingRules, listStaff } from "@/lib/staff/service";

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

async function readStaff(): Promise<StaffList | null> {
    try {
        return await listStaff();
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
    const [params, organization, staffList, rules, services, contacts] =
        await Promise.all([
            searchParams,
            resolveActiveOrganization(),
            readStaff(),
            getBookingRules().catch(() => null),
            listServices(),
            // Contacts belong to CRM, which may be off: then a booking asks
            // for a name and email instead of offering people you know.
            listContacts().catch(() => []),
        ]);

    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
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
    const calendar = await readBookingsCalendar(
        dayBounds(first, timezone).from.toISOString(),
        dayBounds(last, timezone).to.toISOString(),
    );

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
                contacts={contacts.map((c) => ({
                    id: c.id,
                    name: contactName(c),
                    email: c.email,
                }))}
                can={{
                    book: may("booking:write"),
                    hours: may("service:write"),
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
                            }))}
                            contacts={contacts.map((c) => ({
                                id: c.id,
                                name: contactName(c),
                                email: c.email,
                            }))}
                            // Paying with a class pack spends one (ADR-007).
                            canUsePacks={
                                canReadPacks(organization) &&
                                canWritePacks(organization)
                            }
                        />
                    ) : null
                }
            />
        </PageContainer>
    );
}
