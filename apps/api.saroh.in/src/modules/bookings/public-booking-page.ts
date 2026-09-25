import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { paymentsOn } from "../invoices/payments-on";
import { APPOINTMENTS_OPEN, appointmentsOpen } from "./appointments-open";
import type { Slot } from "./availability";
import { countOverlapping, enumerateSlots, staffSlots } from "./availability";
import type { BookingRulesValue } from "./booking-rules";
import { loadBookingRules, withinBookingWindow } from "./booking-rules";
import type { Staffing } from "./booking-slots";
import {
    busyOverlapping,
    loadStaffing,
    toAvailabilityService,
} from "./booking-slots";
import { loadBookableService } from "./reservation";
import { businessTimezone, loadPeople } from "./staff-availability";

/*
 * What a website shows of the business's bookings (#508): the booking page's
 * services, days and starts, the services list, and a booking as its booker
 * sees it. Only fields a visitor is meant to see leave here.
 */

/** A service as a website visitor sees it (#255). No internal fields. */
export interface PublicService {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceCents: number | null;
    currency: string | null;
}

/** How many days the booking page offers (U19). */
const PUBLIC_DAYS = 14;

/** A start on the booking page (U19). `placesLeft` is a class's only. */
export interface PublicStart {
    startAt: string;
    endAt: string;
    staffId: string | null;
    staffName: string | null;
    placesLeft: number | null;
}

export interface PublicDay {
    /** `YYYY-MM-DD` in the business's zone. */
    date: string;
    open: boolean;
    starts: PublicStart[];
}

/** One service's next two weeks on the booking page (U19). */
export interface PublicDays {
    timezone: string;
    kind: "one" | "class";
    capacity: number;
    days: PublicDay[];
}

/** What a site's booking page opens with (U19). No internal fields. */
export interface PublicBookingPage {
    businessName: string;
    /** False when the business has Appointments switched off. */
    open: boolean;
    timezone: string;
    /** Whether pay now is on offer: Payments on and a provider connected. */
    payOnline: boolean;
    rules: BookingRulesValue;
    services: {
        id: string;
        name: string;
        description: string | null;
        durationMinutes: number;
        kind: "one" | "class";
        capacity: number;
        priceCents: number | null;
        currency: string | null;
        online: boolean;
        /** Who takes it, by display name. */
        staff: string[];
    }[];
}

/**
 * The booking page's next two weeks for one service (U19), day by day in
 * the business's zone: whether it is open that day, and its starts.
 *
 * A one-to-one lists its free starts, each with the first person free
 * then (by name — the page shows who before the booker confirms). A class
 * (a service with more than one place) lists every session inside the
 * booking rules with its places left, full ones included, so the page can
 * say Full. A day is open when the hours alone would offer a start on it
 * — the service's rules, or its people's weekly and one-off hours — and it
 * is inside book-ahead; nothing about who is booked or off is used for
 * that, so a day someone is off reads Full, never why.
 */
export async function publicDays(
    serviceId: string,
    now: Date = new Date(),
): Promise<PublicDays> {
    const { service, rules } = await loadBookableService(serviceId);
    const [bookingRules, zone, staffing] = await Promise.all([
        loadBookingRules(prisma, service.organizationId),
        businessTimezone(prisma, service.organizationId),
        loadStaffing(service),
    ]);
    const first = DateTime.fromJSDate(now, { zone }).startOf("day");
    const from = first.toJSDate();
    const to = first.plus({ days: PUBLIC_DAYS }).toJSDate();
    const names = new Map(staffing.people.map((p) => [p.id, p.name]));
    const availService = toAvailabilityService(service);
    // Never a start that has begun; then the business's own rules.
    const bookable = (startAt: Date) =>
        startAt > now && withinBookingWindow(startAt, now, bookingRules);
    const kind: PublicDays["kind"] = service.capacity > 1 ? "class" : "one";

    // What the hours alone offer (open days), and what is free now.
    let hours: Slot[];
    let starts: PublicStart[];
    if (staffing.perPerson && staffing.zone) {
        const people = await loadPeople(
            prisma,
            staffing.people.map((p) => p.id),
            from,
            to,
        );
        hours = staffSlots(
            availService,
            rules,
            people.map((p) => ({ ...p, busy: [], timeOff: [] })),
            staffing.zone,
            from,
            to,
        );
        starts = staffSlots(
            availService,
            rules,
            people,
            staffing.zone,
            from,
            to,
        )
            .filter((slot) => bookable(slot.startAt))
            .map((slot) => {
                const staffId = slot.staffIds[0] ?? null;
                return {
                    startAt: slot.startAt.toISOString(),
                    endAt: slot.endAt.toISOString(),
                    staffId,
                    staffName: staffId ? (names.get(staffId) ?? null) : null,
                    placesLeft: null,
                };
            });
    } else {
        hours = enumerateSlots(availService, rules, from, to);
        const busy = await busyOverlapping(service.id, from, to);
        const [instructor] = staffing.people as (
            Staffing["people"][number] | undefined
        )[];
        starts = hours
            .filter((slot) => bookable(slot.startAt))
            .map((slot) => {
                const left = service.capacity - countOverlapping(slot, busy);
                return {
                    startAt: slot.startAt.toISOString(),
                    endAt: slot.endAt.toISOString(),
                    staffId: instructor?.id ?? null,
                    staffName: instructor?.name ?? null,
                    placesLeft: kind === "class" ? Math.max(0, left) : null,
                    free: left > 0,
                };
            })
            // A one-to-one lists only what is free; a class, every session.
            .filter((start) => kind === "class" || start.free)
            .map(({ free: _free, ...start }) => start);
    }

    const aheadEnd =
        bookingRules.bookAheadDays === null
            ? null
            : now.getTime() + bookingRules.bookAheadDays * 86_400_000;
    const days: PublicDay[] = [];
    for (let i = 0; i < PUBLIC_DAYS; i += 1) {
        const day = first.plus({ days: i });
        const dayFrom = day.toMillis();
        const dayTo = day.plus({ days: 1 }).toMillis();
        const inDay = (iso: string | Date) => {
            const t = new Date(iso).getTime();
            return t >= dayFrom && t < dayTo;
        };
        days.push({
            date: day.toISODate() ?? "",
            open:
                hours.some((slot) => inDay(slot.startAt)) &&
                (aheadEnd === null || dayFrom <= aheadEnd),
            starts: starts.filter((start) => inDay(start.startAt)),
        });
    }
    return { timezone: zone, kind, capacity: service.capacity, days };
}

/**
 * What a site's booking page opens with (U19): the business, the services
 * it may offer (active, of this site or of no site, Appointments on), who
 * takes each — names only — the booking rules and whether it can take
 * payment online. A site that is not published is a 404, like its pages.
 */
export async function publicBookingPage(
    siteId: string,
): Promise<PublicBookingPage> {
    const site = await prisma.site.findFirst({
        where: {
            id: siteId,
            deletedAt: null,
            currentPublicationId: { not: null },
        },
        select: {
            organizationId: true,
            organization: { select: { name: true } },
        },
    });
    if (!site) throw new NotFoundException("Site not found");
    const organizationId = site.organizationId;
    const open = await appointmentsOpen(organizationId);
    const [services, rules, zone, online] = await Promise.all([
        open
            ? prisma.service.findMany({
                  where: {
                      organizationId,
                      deletedAt: null,
                      status: "ACTIVE",
                      OR: [{ siteId: null }, { siteId }],
                  },
                  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                  select: {
                      id: true,
                      name: true,
                      description: true,
                      durationMinutes: true,
                      capacity: true,
                      priceCents: true,
                      currency: true,
                      locationType: true,
                      staffServices: {
                          where: { staff: { status: "ACTIVE" } },
                          select: { staff: { select: { name: true } } },
                      },
                  },
              })
            : Promise.resolve([]),
        loadBookingRules(prisma, organizationId),
        businessTimezone(prisma, organizationId),
        takesOnlinePayment(organizationId),
    ]);
    return {
        businessName: site.organization.name,
        open,
        timezone: zone,
        payOnline: online,
        rules,
        services: services.map((svc) => ({
            id: svc.id,
            name: svc.name,
            description: svc.description,
            durationMinutes: svc.durationMinutes,
            kind: svc.capacity > 1 ? "class" : "one",
            capacity: svc.capacity,
            priceCents: svc.priceCents,
            currency: svc.currency,
            online: svc.locationType === "ONLINE",
            staff: svc.staffServices
                .map((row) => row.staff.name)
                .sort((a, b) => a.localeCompare(b)),
        })),
    };
}

/**
 * The public view of a merchant's chosen services, for the website's
 * services list (#255). Guardless like availability: the ids come from a
 * published section, and only fields a visitor is meant to see leave here.
 *
 * Read live, not frozen at publish, so a changed price or a deleted service
 * is right on the next page view. Filtered to what may be offered:
 * - not deleted, and ACTIVE (an archived service is not on offer);
 * - its Organization has not DISABLED Appointments. A missing module row
 *   counts as on: enforcement is still dark (#117) and the backfill may not
 *   have written one, and hiding a merchant's services over an absent row
 *   would be the wrong way to fail.
 *
 * Returned in the order asked for, which is the order the merchant set.
 * Unknown ids are dropped, never an error: the page must degrade, not 404.
 */
export async function publicServices(ids: string[]): Promise<PublicService[]> {
    if (ids.length === 0) return [];
    const rows = await prisma.service.findMany({
        where: {
            id: { in: ids },
            deletedAt: null,
            status: "ACTIVE",
            // The same rule public booking closes on (#327), so a list
            // never offers a service its booking block would refuse.
            organization: APPOINTMENTS_OPEN,
        },
        select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            priceCents: true,
            currency: true,
        },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
    });
}

/** Payments on, and a provider connected to take the money. */
export async function takesOnlinePayment(
    organizationId: string,
): Promise<boolean> {
    const [on, provider] = await Promise.all([
        paymentsOn(prisma, organizationId),
        prisma.merchantPaymentProvider.findFirst({
            where: { organizationId, status: "CONNECTED" },
            select: { id: true },
        }),
    ]);
    return on && provider !== null;
}

/**
 * What a public booking answers with (ADR-007): the booker's own booking and
 * nothing else — never the row, which carries the organization, the contact
 * and the IP hash. Read from the booking's frozen snapshot, so the first
 * answer and an idempotent replay are the same shape and the same link.
 */
export interface PublicBooking {
    reference: string;
    startAt: string;
    endAt: string;
    serviceName: string;
    online: boolean;
    meetingUrl: string | null;
}

export function toPublicBooking(booking: {
    id: string;
    startAt: Date;
    endAt: Date;
    snapshot: unknown;
    status?: string;
}): PublicBooking {
    const service = (
        booking.snapshot as {
            service?: {
                name?: unknown;
                locationType?: unknown;
                meetingUrl?: unknown;
            };
        } | null
    )?.service;
    const online = service?.locationType === "ONLINE";
    return {
        reference: booking.id,
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
        serviceName: typeof service?.name === "string" ? service.name : "",
        online,
        // Only a CONFIRMED booking holds a place in the class — a PENDING
        // pay-now hold has not paid yet, and a cancelled booking no longer
        // holds one at all — so only CONFIRMED carries the way in. `outcome`
        // (ATTENDED/NO_SHOW) never touches this: it is set after the class,
        // once the link is no longer needed either way.
        meetingUrl:
            online &&
            booking.status === "CONFIRMED" &&
            typeof service.meetingUrl === "string"
                ? service.meetingUrl
                : null,
    };
}
