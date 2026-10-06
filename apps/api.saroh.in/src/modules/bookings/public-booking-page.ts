import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { APPOINTMENTS_OPEN, appointmentsOpen } from "./appointments-open";
import type { OpeningHours, Slot } from "./availability";
import {
    countOverlapping,
    enumerateSlots,
    guarded,
    insideOpening,
    outsideClosures,
    staffSlots,
} from "./availability";
import { onlinePaymentBlocker } from "./booking-payment";
import type { BookingRulesValue } from "./booking-rules";
import {
    allowsOnline,
    loadBookingRules,
    withinBookingWindow,
} from "./booking-rules";
import type { Staffing } from "./booking-slots";
import {
    busyOverlapping,
    loadStaffing,
    toAvailabilityService,
} from "./booking-slots";
import type { BookingLocationType, LocationType } from "./dto";
import { openingFor } from "./opening-hours";
import { loadBookableService } from "./reservation";
import { depositCents } from "./service-fields";
import {
    businessTimezone,
    loadClosures,
    loadPeople,
} from "./staff-availability";

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
    /**
     * A service offered either way (DEC-087): set when this start can be
     * had only one way — online outside opening hours.
     */
    only?: BookingLocationType;
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
    /**
     * Whether pay now is on offer: the business lets people pay online
     * (its booking rules, DEC-088), Payments is on and a provider is
     * connected. Whether the desk is on offer is `rules.bookingPayment`.
     */
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
        /**
         * What is paid online at booking when the booker pays the deposit
         * (E8): the service's share of its price, worked out here, or null
         * when it takes none. A service with a deposit is paid at the desk
         * only when online can't take it and the business allows the desk
         * (DEC-089); one whose deposit is the full price is paid now.
         */
        depositCents: number | null;
        /**
         * How many visits one booking of it is (E10): more than one is a
         * treatment, sold whole and booked a visit at a time.
         */
        visits: number;
        /** Online only. A service offered either way is not (see `where`). */
        online: boolean;
        /**
         * Where it happens: IN_PERSON, ONLINE, or EITHER — the booker
         * chooses, and the page asks Where (E7).
         */
        where: LocationType;
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
    /** How many days from today. On today (G18) reads one. */
    span: number = PUBLIC_DAYS,
): Promise<PublicDays> {
    const { service, rules } = await loadBookableService(serviceId, {
        bookingPage: true,
    });
    const [bookingRules, zone, staffing] = await Promise.all([
        loadBookingRules(prisma, service.organizationId),
        businessTimezone(prisma, service.organizationId),
        loadStaffing(service),
    ]);
    const first = DateTime.fromJSDate(now, { zone }).startOf("day");
    const from = first.toJSDate();
    const to = first.plus({ days: span }).toJSDate();
    const names = new Map(staffing.people.map((p) => [p.id, p.name]));
    const availService = toAvailabilityService(service);
    // Never a start that has begun; then the business's own rules.
    const bookable = (startAt: Date) =>
        startAt > now && withinBookingWindow(startAt, now, bookingRules);
    const kind: PublicDays["kind"] = service.capacity > 1 ? "class" : "one";

    // What the hours alone offer (open days), and what is free now.
    // A day the business is closed is closed on the page, not Full (E3):
    // closures are public, unlike a person's time off.
    const closed = await loadClosures(prisma, service.organizationId, from, to);
    const people =
        staffing.perPerson && staffing.zone
            ? await loadPeople(
                  prisma,
                  service.organizationId,
                  staffing.people.map((p) => p.id),
                  from,
                  to,
              )
            : [];
    // The buffers' width beyond the range too (DEC-052).
    const reach = guarded({ startAt: from, endAt: to }, availService);
    const busy =
        staffing.perPerson && staffing.zone
            ? []
            : await busyOverlapping(service.id, reach.startAt, reach.endAt);

    /** The open-day hours and the starts, kept to `opening` when given. */
    const offer = (
        opening: OpeningHours | null,
    ): { hours: Slot[]; starts: PublicStart[] } => {
        if (staffing.perPerson && staffing.zone) {
            const hours = outsideClosures(
                staffSlots(
                    availService,
                    rules,
                    people.map((p) => ({ ...p, busy: [], timeOff: [] })),
                    staffing.zone,
                    from,
                    to,
                    opening,
                ),
                closed,
            );
            const starts = staffSlots(
                availService,
                rules,
                people,
                staffing.zone,
                from,
                to,
                opening,
            )
                .filter((slot) => bookable(slot.startAt))
                .map((slot) => {
                    const staffId = slot.staffIds[0] ?? null;
                    return {
                        startAt: slot.startAt.toISOString(),
                        endAt: slot.endAt.toISOString(),
                        staffId,
                        staffName: staffId
                            ? (names.get(staffId) ?? null)
                            : null,
                        placesLeft: null,
                    };
                });
            return { hours, starts };
        }
        const hours = insideOpening(
            outsideClosures(
                enumerateSlots(availService, rules, from, to),
                closed,
            ),
            opening,
        );
        const [instructor] = staffing.people as (
            Staffing["people"][number] | undefined
        )[];
        const starts = hours
            .filter((slot) => bookable(slot.startAt))
            .map((slot) => {
                const left =
                    service.capacity -
                    countOverlapping(guarded(slot, availService), busy);
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
        return { hours, starts };
    };

    // In person keeps to opening hours (DEC-087). A service offered either
    // way lists both, and a start only one way can have says which.
    const opening = await openingFor(service, "IN_PERSON");
    const { hours, starts } =
        service.locationType === "EITHER" && opening
            ? eitherWay(offer(opening), offer(null))
            : offer(opening);

    const aheadEnd =
        bookingRules.bookAheadDays === null
            ? null
            : now.getTime() + bookingRules.bookAheadDays * 86_400_000;
    const days: PublicDay[] = [];
    for (let i = 0; i < span; i += 1) {
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
 * A service offered either way (DEC-087): its starts in person (kept to
 * opening hours) and online, as one list. A start both ways can have is
 * listed once, as in person; one only one way can have says which, so the
 * page asks Where no further.
 */
export function eitherWay(
    inPerson: { hours: Slot[]; starts: PublicStart[] },
    online: { hours: Slot[]; starts: PublicStart[] },
): { hours: Slot[]; starts: PublicStart[] } {
    const byStart = new Map<string, PublicStart>();
    for (const start of online.starts) {
        byStart.set(start.startAt, { ...start, only: "ONLINE" });
    }
    for (const start of inPerson.starts) {
        byStart.set(
            start.startAt,
            byStart.has(start.startAt)
                ? start
                : { ...start, only: "IN_PERSON" },
        );
    }
    return {
        hours: [...online.hours, ...inPerson.hours],
        starts: [...byStart.values()].sort((a, b) =>
            a.startAt.localeCompare(b.startAt),
        ),
    };
}

/**
 * The services a site's booking page offers: active, shown on the booking
 * page (E1), and of this site or of no site. On today (G18) lists the same
 * ones, so it never shows a time the booking page would not.
 */
export function offeredOnSite(organizationId: string, siteId: string) {
    return {
        organizationId,
        deletedAt: null,
        status: "ACTIVE" as const,
        // The merchant's "Show on booking page" (E1).
        showOnBookingPage: true,
        OR: [{ siteId: null }, { siteId }],
    };
}

/**
 * What a site's booking page opens with (U19): the business, the services
 * it may offer (active, of this site or of no site, Appointments on), who
 * takes each — names only — the booking rules (how people pay among them,
 * DEC-088) and whether it can take payment online. A site that is not
 * published is a 404, like its pages.
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
                  where: offeredOnSite(organizationId, siteId),
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
                      depositMode: true,
                      visits: true,
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
        payOnline: online && allowsOnline(rules),
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
            // A deposit the business can't take online (its plan, Payments
            // off, no provider) isn't served: the service books as one
            // without, at the desk, as `bookOnline` books it — the page
            // never shows a deposit it can't take (`deposit-plan.ts`).
            depositCents: online
                ? depositCents(svc.priceCents, svc.depositMode)
                : null,
            visits: svc.visits,
            online: svc.locationType === "ONLINE",
            // The page asks Where for EITHER (E7); anything unknown reads
            // as in person, which asks nothing and shows no link.
            where:
                svc.locationType === "ONLINE" || svc.locationType === "EITHER"
                    ? svc.locationType
                    : "IN_PERSON",
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
 * - shown on the booking page (E1): a hidden service is booked by staff;
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
            showOnBookingPage: true,
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

/**
 * Payments on, and a provider connected to take the money — one whose
 * checkout window can open: a Razorpay connection still missing its public
 * key id is not (DEC-054). Whether the business lets people pay online is
 * its booking rules' (DEC-088), read beside this.
 */
export async function takesOnlinePayment(
    organizationId: string,
): Promise<boolean> {
    return (await onlinePaymentBlocker(organizationId)) === null;
}

/**
 * What a public booking answers with (ADR-007): the booker's own booking and
 * nothing else — never the row, which carries the organization, the contact,
 * the IP hash and the booker's own note (E7). Read from the booking's frozen
 * snapshot, so the first answer and an idempotent replay are the same shape
 * and the same link. Where it happens is the booking's own answer when it
 * has one (a service offered either way, E7), else the service's.
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
    locationType?: string | null;
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
    const online = booking.locationType
        ? booking.locationType === "ONLINE"
        : service?.locationType === "ONLINE";
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
            typeof service?.meetingUrl === "string"
                ? service.meetingUrl
                : null,
    };
}
