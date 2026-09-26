import { Button } from "@saroh/ui/button";
import { FailedState, PartialNotice } from "@saroh/ui/data-state";
import Link from "next/link";

import { AvailabilityEditor } from "@/components/bookings/availability/availability-editor";
import { BARE, BookingsTopBar } from "@/components/bookings/calendar/parts";
import { PageContainer } from "@/components/shared/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
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
import { requireSession } from "@/lib/session";
import type { BookingRules, StaffList } from "@/lib/staff/service";
import { getBookingRules, listStaff } from "@/lib/staff/service";

/**
 * Bookings › Availability (U16): each person's weekly hours, time off and
 * one-off extra hours, and the business's booking rules. Reads the staff
 * (U3) and three weeks of bookings (U4) — the bookings only to say which
 * would fall outside new hours or on a day off. Without them the editor
 * still works and says it could not check.
 */
export const metadata = { title: "Availability" };

const NO_RULES: BookingRules = {
    bookAheadDays: null,
    latestBookingMinutes: null,
    freeCancelHours: null,
};

async function readStaff(): Promise<StaffList | null> {
    try {
        return await listStaff();
    } catch {
        return null;
    }
}

export default async function AvailabilityPage() {
    await requireSession();
    const [organization, staffList, rules, services] = await Promise.all([
        resolveActiveOrganization(),
        readStaff(),
        getBookingRules().catch(() => null),
        listServices(),
    ]);

    if (!staffList) {
        return (
            <PageContainer width="full" className={BARE}>
                <BookingsTopBar page="Availability" />
                <div className="px-[22px] pb-6 pt-[18px]">
                    <FailedState
                        title="Couldn't load everyone's hours"
                        description="Nothing has been changed. Try again in a moment."
                        action={
                            <Button asChild variant="outline">
                                <Link href="/bookings/availability">
                                    Try again
                                </Link>
                            </Button>
                        }
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
    const calendar = await readBookingsCalendar(
        dayBounds(today, timezone).from.toISOString(),
        dayBounds(addDays(today, 21), timezone).to.toISOString(),
    );

    // The live bookings with a person: this week's for "outside these
    // hours", and a count per person per day for time off.
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
        <PageContainer width="full" className={BARE}>
            <BookingsTopBar page="Availability" />
            <div className="px-[22px] pb-6 pt-[18px] max-[759px]:px-4">
                {calendar ? null : (
                    <PartialNotice className="mb-3">
                        Bookings could not be loaded, so the hours below
                        can&apos;t say which bookings they would leave out.
                    </PartialNotice>
                )}
                <AvailabilityEditor
                    staff={staffList.staff}
                    rules={rules ?? NO_RULES}
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
                />
            </div>
        </PageContainer>
    );
}
