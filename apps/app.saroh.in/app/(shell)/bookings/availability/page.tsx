import { PartialRead } from "@/components/shared/failed-read";
import { FailedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";

import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { AvailabilityEditor } from "@/components/bookings/availability/availability-editor";

import { PageContainer } from "@/components/shared/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import type { KeptBooking } from "@/lib/services/availability-rules";
import {
    addDays,
    dayBounds,
    localDateOf,
    localMinuteOf,
    weekdayOf,
    whoFor,
} from "@/lib/services/diary";
import {
    listServices,
    readBookingsCalendar,
    readNow,
} from "@/lib/services/service";
import { readServiceHours } from "@/lib/services/service-hours-read";
import { requireSession } from "@/lib/session";
import { seatNote } from "@/lib/staff/seat-note";
import type { StaffList } from "@/lib/staff/service";
import {
    getBookingRules,
    listStaff,
    readBookingPayment,
} from "@/lib/staff/service";
import { tidyWeek } from "@/lib/staff/starting-week";
import { couldntLoad } from "@saroh/ui/lib/state-copy";

/**
 * Bookings › Availability (U16): each person's weekly hours, time off and
 * one-off extra hours, and the business's booking rules. Reads the staff
 * (U3) and three weeks of bookings (U4) — the bookings only to say which
 * would fall outside new hours or in extra hours; time off and closures
 * ask the API what they cover (E3). Without them the editor still works
 * and says it could not check. With nobody on the diary it also reads the
 * services' own hours, as the calendar's "Service hours" column does
 * (`readServiceHours`), to say the week customers can book today.
 */
export const metadata = { title: "Availability" };

async function readStaff(): Promise<StaffList | null> {
    try {
        return await listStaff();
    } catch {
        return null;
    }
}

export default async function AvailabilityPage() {
    await requireSession();
    const [organization, staffList, rules, services, payment, plan] =
        await Promise.all([
            resolveActiveOrganization(),
            readStaff(),
            getBookingRules().catch(() => null),
            listServices(),
            readBookingPayment(),
            billingAccessOrNull(),
        ]);

    if (!staffList) {
        return (
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Bookings", "Availability"]}
                    title="Availability"
                />
                <div>
                    <FailedState
                        title={couldntLoad("everyone's hours")}
                        retryHref="/bookings/availability"
                    />
                </div>
            </PageContainer>
        );
    }

    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const timezone = staffList.timezone;
    const today = localDateOf(new Date(readNow()), timezone);
    const [calendar, serviceHours] = await Promise.all([
        readBookingsCalendar(
            dayBounds(today, timezone).from.toISOString(),
            dayBounds(addDays(today, 21), timezone).to.toISOString(),
        ),
        // Only read while nobody is on the diary; null otherwise.
        readServiceHours(services, staffList),
    ]);

    // The live bookings with a person: this week's for "outside these
    // hours", and a count per person per day for extra hours.
    const weekEnd = addDays(today, 7);
    let kept: KeptBooking[] | null = null;
    let bookedOn: Record<string, number> | null = null;
    if (calendar) {
        const counts: Record<string, number> = {};
        kept = [];
        bookedOn = counts;
        const count = (staffId: string, date: string) => {
            const key = `${staffId}|${date}`;
            counts[key] = (counts[key] ?? 0) + 1;
        };
        for (const diary of calendar.diaries) {
            if (!diary.person) continue;
            const staffId = diary.person.id;
            for (const b of diary.bookings) {
                if (b.status === "CANCELLED") continue;
                const date = localDateOf(b.startAt, timezone);
                count(staffId, date);
                if (date < weekEnd) {
                    kept.push({
                        id: b.id,
                        staffId,
                        weekday: weekdayOf(date),
                        start: localMinuteOf(b.startAt, timezone),
                        who: whoFor(b),
                    });
                }
            }
            // A class is one thing on the day, however many are on it.
            for (const s of diary.classes) {
                if (s.bookings.every((b) => b.status === "CANCELLED")) continue;
                const date = localDateOf(s.startAt, timezone);
                count(staffId, date);
                if (date < weekEnd) {
                    kept.push({
                        id: s.key,
                        staffId,
                        weekday: weekdayOf(date),
                        start: localMinuteOf(s.startAt, timezone),
                        who: s.service.name,
                    });
                }
            }
        }
    }
    const classes = new Set(
        services.filter((s) => s.capacity > 1).map((s) => s.id),
    );

    return (
        <PageContainer width="full">
            <div>
                {calendar ? null : (
                    <PartialRead
                        className="mb-3"
                        things="bookings"
                        so="The hours below can't say which bookings they would leave out."
                    />
                )}
                {/* Everyone who takes bookings uses a team seat (DEC-105). */}
                {may("service:write") ? (
                    <PlanLimitNotice moduleId="members" className="mb-3" />
                ) : null}
                <AvailabilityEditor
                    staff={staffList.staff}
                    closures={staffList.closures}
                    openingHours={staffList.openingHours ?? null}
                    rules={rules}
                    serviceHours={
                        serviceHours ? tidyWeek(serviceHours.hours) : null
                    }
                    services={services
                        .filter(
                            (s) => s.status === "ACTIVE" && s.showOnBookingPage,
                        )
                        .map((s) => ({ id: s.id, name: s.name }))}
                    seatNote={seatNote(plan)}
                    timezone={timezone}
                    today={today}
                    kept={kept}
                    bookedOn={bookedOn}
                    takesClasses={staffList.staff
                        .filter((p) =>
                            p.serviceIds.some((id) => classes.has(id)),
                        )
                        .map((p) => p.id)}
                    canEdit={may("service:write")}
                    onlineBlocker={payment?.onlineBlocker}
                />
            </div>
        </PageContainer>
    );
}
