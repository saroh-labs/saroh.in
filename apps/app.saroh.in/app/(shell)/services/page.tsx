import { Button } from "@saroh/ui/button";
import { FailedState, PartialNotice } from "@saroh/ui/data-state";
import Link from "next/link";

import { BARE, BookingsTopBar } from "@/components/bookings/calendar/parts";
import type { ServiceUsage } from "@/components/services/services-screen";
import { ServicesScreen } from "@/components/services/services-screen";
import { PageContainer } from "@/components/shared/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import {
    addDays,
    dayBounds,
    localDateOf,
    weekStartOf,
} from "@/lib/services/diary";
import {
    readBookingsCalendar,
    readNow,
    readServices,
} from "@/lib/services/service";
import { requireSession } from "@/lib/session";
import type { StaffList } from "@/lib/staff/service";
import { listStaff } from "@/lib/staff/service";

/**
 * Bookings › Services (U16): what people can book, as the design's cards.
 * The services read is the page; the staff read (who takes each) and the
 * bookings read (how each is used) degrade on their own and say so.
 */
export const metadata = { title: "Services" };

/** How far ahead "still to come" counts. */
const AHEAD_DAYS = 90;

async function readStaff(): Promise<StaffList | null> {
    try {
        return await listStaff();
    } catch {
        return null;
    }
}

export default async function ServicesPage() {
    await requireSession();
    const [read, staffList, organization] = await Promise.all([
        readServices(),
        readStaff(),
        resolveActiveOrganization(),
    ]);

    if (!read.ok) {
        return (
            <PageContainer width="full" className={BARE}>
                <BookingsTopBar page="Services" />
                <div className="px-[22px] pb-6 pt-[18px]">
                    <FailedState
                        title={
                            read.forbidden
                                ? "Your role can't see services"
                                : "Couldn't load your services"
                        }
                        description={
                            read.forbidden
                                ? "An owner or admin can change what your role reaches in Team."
                                : "Nothing has been changed. Try again in a moment."
                        }
                        action={
                            read.forbidden ? undefined : (
                                <Button asChild variant="outline">
                                    <Link href="/services">Try again</Link>
                                </Button>
                            )
                        }
                    />
                </div>
            </PageContainer>
        );
    }

    const services = read.services;
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
    const timezone =
        staffList?.timezone ?? services.at(0)?.timezone ?? "Asia/Kolkata";
    const now = readNow();
    const today = localDateOf(new Date(now), timezone);
    const weekStart = weekStartOf(today);
    const calendar = await readBookingsCalendar(
        dayBounds(weekStart, timezone).from.toISOString(),
        dayBounds(addDays(today, AHEAD_DAYS), timezone).to.toISOString(),
    );

    // This week: places and bookings held. Still to come: bookings, and a
    // class's starts with someone on them.
    let usage: Record<string, ServiceUsage> | null = null;
    if (calendar) {
        const tally: Record<string, ServiceUsage> = {};
        const of = (id: string) => (tally[id] ??= { thisWeek: 0, comingUp: 0 });
        const weekEnd = dayBounds(addDays(weekStart, 6), timezone).to.getTime();
        for (const diary of calendar.diaries) {
            for (const b of diary.bookings) {
                if (b.status === "CANCELLED") continue;
                const at = Date.parse(b.startAt);
                if (at < weekEnd) of(b.serviceId).thisWeek += 1;
                if (at >= now) of(b.serviceId).comingUp += 1;
            }
            for (const s of diary.classes) {
                const held = s.bookings.filter(
                    (b) => b.status !== "CANCELLED",
                ).length;
                if (!held) continue;
                const at = Date.parse(s.startAt);
                if (at < weekEnd) of(s.service.id).thisWeek += held;
                if (at >= now) of(s.service.id).comingUp += 1;
            }
        }
        usage = Object.fromEntries(
            services.map((s) => [
                s.id,
                tally[s.id] ?? { thisWeek: 0, comingUp: 0 },
            ]),
        );
    }

    return (
        <PageContainer width="full" className={BARE}>
            <BookingsTopBar page="Services" />
            <div className="px-[22px] pb-6 pt-[18px] max-[759px]:px-4">
                {staffList && calendar ? null : (
                    <PartialNotice className="mb-3">
                        {!staffList && !calendar
                            ? "Who takes each service and how each is used could not be loaded."
                            : !staffList
                              ? "Who takes each service could not be loaded."
                              : "How much each service is booked could not be loaded."}
                    </PartialNotice>
                )}
                <ServicesScreen
                    services={services}
                    staff={staffList?.staff ?? null}
                    usage={usage}
                    timezone={timezone}
                    currency={
                        services.find((s) => s.currency)?.currency ?? "INR"
                    }
                    canEdit={may("service:write")}
                />
            </div>
        </PageContainer>
    );
}
