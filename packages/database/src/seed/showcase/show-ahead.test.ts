import { describe, expect, it } from "vitest";

import type { PlannedBooking, SeededService } from "./appointments";
import {
    bookingRows,
    isSlotStart,
    planBookings,
    slotKey,
} from "./appointments";
import { planCourses } from "./billing";
import type { ShowcaseService } from "./data";
import { DK_DIARY, DK_PEOPLE } from "./desk42";
import { DK_SERVICES } from "./desk42-data";
import { SA_DIARY, SA_PEOPLE } from "./shiksha";
import { SA_COURSES, SA_SERVICES } from "./shiksha-data";
import { rngFor } from "./vertical";

/**
 * A showcase business's "must show" bookings — Aarohan's demo class to come,
 * Desk 42's day pass, room and booth booked ahead — are planned relative to
 * `now`. On 21 Oct 2026 the draws left Aarohan with no upcoming demo class and
 * the seed stopped (DEV_LEARNINGS). Plan each diary for every day of 60, at
 * two hours of the day, and prove each must-show booking is there, written as
 * confirmed by `bookingRows`, on a real slot, within the slot's room.
 */

const DAY = 24 * 60 * 60_000;
const START = Date.UTC(2026, 9, 1, 3, 30); // 09:00 in Kolkata
const NOWS = Array.from({ length: 60 }, (_, d) => [
    new Date(START + d * DAY),
    new Date(START + d * DAY + 13 * 60 * 60_000), // 22:00 in Kolkata
]).flat();

const seeded = (services: readonly ShowcaseService[]): SeededService[] =>
    services.map((fixture, i) => ({ id: `service-${i}`, fixture }));

const contacts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: `contact-${i}`,
        name: `Person ${i}`,
        email: `person.${i}@example.com`,
        phone: "+910000000000",
        company: null,
    }));

interface Diary {
    planned: PlannedBooking[];
    reserved?: ReadonlyMap<string, number>;
}

function shiksha(now: Date): Diary {
    const people = SA_PEOPLE.leads + SA_PEOPLE.students;
    const courses = planCourses(
        {
            now,
            orgId: "org",
            id: (...parts) => parts.join("-"),
            rng: (concern) => rngFor("test-shiksha", concern),
            services: seeded(SA_SERVICES),
            contacts: contacts(people),
            pool: Array.from(
                { length: SA_PEOPLE.students },
                (_, i) => SA_PEOPLE.leads + i,
            ),
            staff: ["staff"],
            invoicing: true,
            seller: {
                sellerName: "Aarohan",
                sellerLegalName: null,
                sellerEmail: null,
                sellerAddress: null,
            },
        },
        SA_COURSES,
    );
    return {
        planned: planBookings(rngFor("test-shiksha", "bookings"), {
            ...SA_DIARY,
            now,
            services: SA_SERVICES,
            contacts: people,
            reserved: courses.reserved,
            busy: courses.busy,
        }),
        reserved: courses.reserved,
    };
}

function desk42(now: Date): Diary {
    return {
        planned: planBookings(rngFor("test-desk42", "bookings"), {
            ...DK_DIARY,
            now,
            services: DK_SERVICES,
            contacts: DK_PEOPLE,
        }),
    };
}

const BUSINESSES = [
    {
        name: "Aarohan Academy",
        services: SA_SERVICES,
        showAhead: SA_DIARY.showAhead,
        people: SA_PEOPLE.leads + SA_PEOPLE.students,
        plan: shiksha,
    },
    {
        name: "Desk 42",
        services: DK_SERVICES,
        showAhead: DK_DIARY.showAhead,
        people: DK_PEOPLE,
        plan: desk42,
    },
];

describe.each(BUSINESSES)("$name's must-show bookings ahead", (biz) => {
    it.each(NOWS.map((now) => [now.toISOString(), now] as const))(
        "are there when the seed runs at %s",
        (_, now) => {
            const { planned, reserved } = biz.plan(now);
            const { bookings } = bookingRows(planned, {
                now,
                orgId: "org",
                services: seeded(biz.services),
                contacts: contacts(biz.people),
                staffUserIds: ["staff"],
                bookingId: (n) => `booking-${n}`,
                eventId: (n, kind) => `event-${n}-${kind}`,
            });
            for (const service of biz.showAhead) {
                const ahead = bookings.filter(
                    (b, n) =>
                        planned[n].service === service &&
                        b.status === "CONFIRMED" &&
                        (b.startAt as Date).getTime() > now.getTime(),
                );
                expect(
                    ahead.length,
                    `${biz.services[service].name} confirmed ahead`,
                ).toBeGreaterThanOrEqual(1);
            }

            // Every booking on a real slot, within the slot's room once the
            // courses' places are counted, and nobody in two places at once.
            const load = new Map<string, number>();
            const byContact = new Map<number, PlannedBooking[]>();
            for (const b of planned) {
                const s = biz.services[b.service];
                expect(isSlotStart(s, b.startAt), s.name).toBe(true);
                const key = slotKey(b.service, b.startAt);
                load.set(key, (load.get(key) ?? 0) + 1);
                expect(
                    (load.get(key) ?? 0) + (reserved?.get(key) ?? 0),
                ).toBeLessThanOrEqual(s.capacity);
                const theirs = byContact.get(b.contact) ?? [];
                for (const o of theirs) {
                    expect(
                        o.startAt < b.endAt && b.startAt < o.endAt,
                        `contact ${b.contact} double-booked`,
                    ).toBe(false);
                }
                byContact.set(b.contact, [...theirs, b]);
            }
        },
    );
});
