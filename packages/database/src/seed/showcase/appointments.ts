import type { Prisma } from "@prisma/client";

import type { Db } from "../helpers";
import type { ShowcaseService } from "./data";
import { TIMEZONE } from "./data";
import { addMinutes, earliest, istAt, istWeekday, minuteOf } from "./people";
import type { Rng } from "./random";

/**
 * Services, their weekly hours, and a diary of bookings that respects both.
 *
 * Every booking sits on a real slot — a start the availability rules produce,
 * on the service's duration grid — because the reschedule picker and the
 * public form both reason from those rules, and a booking at 10:17 would be a
 * state the product cannot produce. Capacity is counted per slot as bookings
 * are placed, so a class never holds more people than it has room for.
 */

export interface SeededService {
    id: string;
    fixture: ShowcaseService;
}

export async function upsertServices(
    prisma: Db,
    options: {
        orgId: string;
        services: readonly ShowcaseService[];
        serviceId: (i: number) => string;
        ruleId: (i: number, k: number) => string;
        createdAt: Date;
    },
): Promise<SeededService[]> {
    const out: SeededService[] = [];
    for (let i = 0; i < options.services.length; i++) {
        const s = options.services[i];
        const service = await prisma.service.upsert({
            where: { id: options.serviceId(i) },
            update: {
                name: s.name,
                description: s.description,
                durationMinutes: s.minutes,
                capacity: s.capacity,
                priceCents: s.priceCents,
                currency: s.priceCents === null ? null : "INR",
                status: "ACTIVE",
            },
            create: {
                id: options.serviceId(i),
                organizationId: options.orgId,
                name: s.name,
                description: s.description,
                durationMinutes: s.minutes,
                capacity: s.capacity,
                priceCents: s.priceCents,
                currency: s.priceCents === null ? null : "INR",
                timezone: TIMEZONE,
                status: "ACTIVE",
                createdAt: options.createdAt,
            },
        });

        // Rewritten whole each run: the rules ARE the fixture, and a stale
        // window left by an earlier version would open slots nobody meant.
        await prisma.availabilityRule.deleteMany({
            where: { serviceId: service.id },
        });
        const rules = s.rules.flatMap((rule) =>
            rule.days.map((dayOfWeek) => ({
                dayOfWeek,
                startMinute: minuteOf(rule.from),
                endMinute: minuteOf(rule.to),
            })),
        );
        await prisma.availabilityRule.createMany({
            data: rules.map((r, k) => ({
                id: options.ruleId(i, k),
                organizationId: options.orgId,
                serviceId: service.id,
                ...r,
            })),
        });
        out.push({ id: service.id, fixture: s });
    }
    return out;
}

interface Slot {
    service: number;
    startAt: Date;
    endAt: Date;
    dayOffset: number;
    taken: number;
}

export interface PlannedBooking {
    service: number;
    contact: number;
    startAt: Date;
    endAt: Date;
    /** Pre-drawn, so the outcome logic never changes how many draws are made. */
    roll: [number, number, number, number];
}

/**
 * Place `target` bookings on real slots from `fromDay` to `toDay` (relative
 * to today). Group classes fill in clusters, the way a class fills; one-to-one
 * services take one person per slot. Nobody is booked into two overlapping
 * appointments.
 */
export function planBookings(
    rng: Rng,
    options: {
        now: Date;
        services: readonly ShowcaseService[];
        target: number;
        fromDay: number;
        toDay: number;
        contacts: number;
        /** Contacts who are new — the ones who book a trial. */
        prospects: readonly number[];
        /** Services only prospects book (a free trial). */
        prospectServices: readonly number[];
        /** Extra weight for a weekday, Sunday first. */
        weekdayWeights: readonly number[];
    },
): PlannedBooking[] {
    const slots: Slot[] = [];
    for (let d = options.fromDay; d <= options.toDay; d++) {
        const dow = istWeekday(options.now, d);
        options.services.forEach((s, service) => {
            for (const rule of s.rules) {
                if (!rule.days.includes(dow)) continue;
                const end = minuteOf(rule.to);
                for (
                    let m = minuteOf(rule.from);
                    m + s.minutes <= end;
                    m += s.minutes
                ) {
                    const startAt = istAt(options.now, d, m);
                    slots.push({
                        service,
                        startAt,
                        endAt: addMinutes(startAt, s.minutes),
                        dayOffset: d,
                        taken: 0,
                    });
                }
            }
        });
    }

    const perService = options.services.map(
        (_, i) => slots.filter((s) => s.service === i).length || 1,
    );
    // The recent past and the fortnight ahead are what the film looks at, so
    // they are the fullest; far-off weeks thin out as real diaries do.
    const dayFactor = (d: number) =>
        d < -30 ? 0.6 : d < 0 ? 1 : d <= 7 ? 1.15 : 0.55;
    const weight = (slot: Slot) => {
        const s = options.services[slot.service];
        if (slot.taken >= s.capacity) return 0;
        return (
            (s.weight / perService[slot.service]) *
            dayFactor(slot.dayOffset) *
            options.weekdayWeights[istWeekday(options.now, slot.dayOffset)]
        );
    };

    const busy = new Map<number, { start: number; end: number }[]>();
    const isFree = (contact: number, slot: Slot) =>
        !(busy.get(contact) ?? []).some(
            (b) =>
                b.start < slot.endAt.getTime() &&
                slot.startAt.getTime() < b.end,
        );

    const planned: PlannedBooking[] = [];
    let guard = 0;
    while (planned.length < options.target && guard++ < options.target * 20) {
        const slot = rng.weighted(slots, weight);
        const s = options.services[slot.service];
        const room = s.capacity - slot.taken;
        if (room <= 0) continue;
        // A class fills a handful at a time; a one-to-one slot takes one.
        const cluster =
            s.capacity === 1
                ? 1
                : Math.min(
                      room,
                      rng.int(2, Math.max(2, Math.ceil(s.capacity * 0.7))),
                  );
        for (let c = 0; c < cluster && planned.length < options.target; c++) {
            const prospectOnly = options.prospectServices.includes(
                slot.service,
            );
            let contact = -1;
            for (let attempt = 0; attempt < 12; attempt++) {
                const candidate = prospectOnly
                    ? rng.pick(options.prospects)
                    : rng.skewed(options.contacts, 1.6);
                if (isFree(candidate, slot)) {
                    contact = candidate;
                    break;
                }
            }
            if (contact < 0) continue;
            busy.set(contact, [
                ...(busy.get(contact) ?? []),
                { start: slot.startAt.getTime(), end: slot.endAt.getTime() },
            ]);
            slot.taken++;
            planned.push({
                service: slot.service,
                contact,
                startAt: slot.startAt,
                endAt: slot.endAt,
                roll: [rng.next(), rng.next(), rng.next(), rng.next()],
            });
        }
    }
    return planned.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export interface BookingRows {
    bookings: Prisma.BookingCreateManyInput[];
    events: Prisma.BookingEventCreateManyInput[];
}

/**
 * Turn planned bookings into rows, deciding what has happened to each by the
 * clock:
 *
 * - past: mostly attended, some no-shows, a few cancelled — and the last three
 *   days partly unanswered, because "Needs an outcome" is the merchant's job
 *   and an empty queue would hide it;
 * - upcoming: confirmed, some still pending, a few cancelled.
 *
 * Each has the BOOKED event its history starts with, plus the event for what
 * followed. The snapshot is the one `BookingsService.buildSnapshot` writes.
 */
export function bookingRows(
    planned: readonly PlannedBooking[],
    options: {
        now: Date;
        orgId: string;
        services: readonly SeededService[];
        contacts: readonly {
            id: string;
            name: string;
            email: string;
            phone: string;
        }[];
        staffUserIds: readonly string[];
        bookingId: (n: number) => string;
        eventId: (n: number, kind: string) => string;
    },
): BookingRows {
    const { now } = options;
    const bookings: Prisma.BookingCreateManyInput[] = [];
    const events: Prisma.BookingEventCreateManyInput[] = [];

    planned.forEach((b, n) => {
        const service = options.services[b.service];
        const s = service.fixture;
        const contact = options.contacts[b.contact];
        const [r1, r2, r3, r4] = b.roll;
        const id = options.bookingId(n);
        const hoursAgo = (now.getTime() - b.endAt.getTime()) / 3_600_000;
        const past = hoursAgo > 0;
        const staff =
            options.staffUserIds[
                Math.floor(r4 * options.staffUserIds.length)
            ] ?? null;

        // Booked between a day and ten days ahead — never after now.
        const createdAt = earliest(
            addMinutes(b.startAt, -Math.round((1 + r3 * 9) * 24 * 60)),
            addMinutes(now, -Math.round(30 + r3 * 600)),
        );

        let status: "CONFIRMED" | "PENDING" | "CANCELLED" = "CONFIRMED";
        let outcome: "ATTENDED" | "NO_SHOW" | null = null;
        let cancelledAt: Date | null = null;
        if (past) {
            if (r1 < 0.08) {
                status = "CANCELLED";
            } else if (hoursAgo < 72 && r2 < 0.6) {
                outcome = null; // not answered yet
            } else {
                outcome = r2 < 0.88 ? "ATTENDED" : "NO_SHOW";
            }
        } else if (r1 < 0.06) {
            status = "CANCELLED";
        } else if (r1 < 0.2) {
            status = "PENDING";
        }
        if (status === "CANCELLED") {
            cancelledAt = earliest(
                now,
                new Date(
                    createdAt.getTime() +
                        (b.startAt.getTime() - createdAt.getTime()) *
                            (0.3 + r2 * 0.6),
                ),
            );
        }

        const lastTouched =
            cancelledAt ?? (outcome ? addMinutes(b.endAt, 45) : createdAt);

        bookings.push({
            id,
            organizationId: options.orgId,
            serviceId: service.id,
            contactId: contact.id,
            startAt: b.startAt,
            endAt: b.endAt,
            timezone: TIMEZONE,
            status,
            outcome,
            cancelledAt,
            bookerName: contact.name,
            bookerEmail: contact.email,
            bookerPhone: contact.phone,
            snapshot: {
                service: {
                    id: service.id,
                    name: s.name,
                    durationMinutes: s.minutes,
                    bufferBeforeMinutes: 0,
                    bufferAfterMinutes: 0,
                    capacity: s.capacity,
                    timezone: TIMEZONE,
                    priceCents: s.priceCents,
                    currency: s.priceCents === null ? null : "INR",
                },
                slot: {
                    startAt: b.startAt.toISOString(),
                    endAt: b.endAt.toISOString(),
                },
                booker: {
                    name: contact.name,
                    email: contact.email,
                    phone: contact.phone,
                },
            },
            createdAt,
            updatedAt: earliest(now, lastTouched),
        });

        // The booker made it themselves, so the first line has no actor.
        events.push({
            id: options.eventId(n, "booked"),
            bookingId: id,
            organizationId: options.orgId,
            type: "BOOKED",
            toStartAt: b.startAt,
            createdAt,
        });
        if (cancelledAt) {
            events.push({
                id: options.eventId(n, "cancelled"),
                bookingId: id,
                organizationId: options.orgId,
                type: "CANCELLED",
                actorUserId: staff,
                fromStartAt: b.startAt,
                createdAt: cancelledAt,
            });
        }
        if (outcome) {
            events.push({
                id: options.eventId(n, "outcome"),
                bookingId: id,
                organizationId: options.orgId,
                type: outcome,
                actorUserId: staff,
                fromStartAt: b.startAt,
                createdAt: earliest(now, addMinutes(b.endAt, 45)),
            });
        }
    });

    return { bookings, events };
}
