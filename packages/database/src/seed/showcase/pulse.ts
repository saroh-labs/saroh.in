import type { Prisma } from "@prisma/client";

import type { Db } from "../helpers";
import type { SeededService } from "./appointments";
import type {
    BillingContact,
    InvoiceSpec,
    PackPlan,
    Payment,
    SubscriptionPlanRows,
} from "./billing";
import { rupees } from "./billing";
import type { ShowcasePack, ShowcasePlan } from "./data";
import { addMinutes, istAt, istWeekday, minuteOf } from "./people";
import type { Rng } from "./random";

/**
 * Pulse Fitness as the bookings, availability and customer screens are
 * filmed in it (U9, ADR-008): the people who take bookings, their weekly
 * hours, time off and a one-off extra hour; the business's booking rules;
 * who takes each booking and how each was paid; late cancels; a membership
 * whose renewal failed, one paused and one changing plan; a pack about to run
 * out and one that ran out unused; and the team's notes on a few people.
 *
 * It layers on the generic showcase (`./run.ts`): the diary, the packs and the
 * subscriptions are planned there, and this decides the rest from them before
 * anything is written. Every choice is the one the API would have left:
 *
 * - a one-to-one booking is taken by someone who takes that service, is
 *   working then (weekly hours or extra hours, not off) and is not already
 *   booked; when nobody is, it stays Unassigned — as do a few made before the
 *   business put people on its diary (no backfill, U3);
 * - every place in a class session has the same instructor, who teaches
 *   nothing else at that time;
 * - a membership pays only its own member's classes, while it is active, and
 *   never more in a calendar month than the plan's classes a month (cancelled
 *   late counts; cancelled in time does not);
 * - a cancel inside the free-cancellation window is late: the pack's class
 *   stays used (`cancelledLate`, the redemption not reversed).
 *
 * The staff and their hours are structure, upserted on seeded ids; time off,
 * extra hours, notes and every booking are rewritten with the run.
 */

const HOUR = 3_600_000;
const DAY = 86_400_000;
const IST = 330 * 60_000;

/** The business's booking rules (the design's Availability sample). */
export const PULSE_RULES = {
    bookAheadDays: 21,
    latestBookingMinutes: 120,
    freeCancelHours: 12,
} as const;

interface Window {
    days: readonly number[];
    from: string;
    to: string;
}

interface StaffFixture {
    key: string;
    name: string;
    title: string;
    /** The demo owner, who trains too: linked to their Membership. */
    owner?: boolean;
    /**
     * Indexes into Pulse's services: 0 personal training, 1 HIIT, 2 yoga,
     * 3 free trial, 4 strength foundations, 5 fitness assessment.
     */
    services: readonly number[];
    hours: readonly Window[];
}

/**
 * Four people, hours deliberately uneven — a split shift, a late starter, a
 * weekend teacher — so the Availability screen has something to show.
 * Only the owner signs in; the trainers are on the diary without accounts.
 */
export const PULSE_STAFF: readonly StaffFixture[] = [
    {
        key: "karan",
        name: "Karan Mehta",
        title: "Owner · Head coach",
        owner: true,
        services: [0, 5, 3],
        hours: [
            { days: [1, 2, 3, 4, 5], from: "06:00", to: "11:00" },
            { days: [6], from: "07:00", to: "11:00" },
        ],
    },
    {
        key: "ritu",
        name: "Ritu Kapoor",
        title: "Trainer",
        services: [1, 0, 4],
        hours: [
            { days: [1, 3, 5], from: "06:00", to: "10:00" },
            { days: [1, 2, 3, 4, 5], from: "17:00", to: "21:00" },
        ],
    },
    {
        key: "sameer",
        name: "Sameer Khan",
        title: "Trainer",
        services: [1, 0, 5, 4],
        hours: [
            { days: [2, 4], from: "06:00", to: "12:00" },
            { days: [1, 3, 5], from: "16:00", to: "20:00" },
            { days: [6], from: "07:00", to: "12:00" },
        ],
    },
    {
        key: "ananya",
        name: "Ananya Iyer",
        title: "Yoga teacher",
        services: [2, 3],
        hours: [
            { days: [2, 4, 6], from: "06:30", to: "09:00" },
            { days: [2, 4], from: "19:00", to: "21:00" },
            { days: [0], from: "07:30", to: "09:30" },
            { days: [1, 3, 5], from: "10:00", to: "12:00" },
            { days: [1, 3, 5], from: "16:00", to: "17:30" },
        ],
    },
];

/** A seeded person and when they can take a booking. */
export interface PulseStaff {
    id: string;
    fixture: StaffFixture;
    timeOff: { start: number; end: number }[];
    extra: { start: number; end: number }[];
}

type Id = (...parts: (string | number)[]) => string;

/** The UTC midnight of a Kolkata calendar date, as a `@db.Date` column takes it. */
function localDate(now: Date, dayOffset: number): Date {
    const local = new Date(istAt(now, dayOffset, 12 * 60).getTime() + IST);
    return new Date(
        Date.UTC(
            local.getUTCFullYear(),
            local.getUTCMonth(),
            local.getUTCDate(),
        ),
    );
}

/** The next day (1…7 ahead) that falls on `weekday`. */
function nextWeekday(now: Date, weekday: number): number {
    for (let d = 1; d <= 7; d++) {
        if (istWeekday(now, d) === weekday) return d;
    }
    throw new Error("unreachable");
}

/**
 * The staff, what each takes, their hours, time off and extra hours, and the
 * business's booking rules.
 */
export async function upsertPulseStaff(
    prisma: Db,
    options: {
        orgId: string;
        now: Date;
        createdAt: Date;
        services: readonly SeededService[];
        ownerMembershipId: string;
        ownerUserId: string;
        id: Id;
    },
): Promise<PulseStaff[]> {
    const { orgId, now, id } = options;
    const ids = PULSE_STAFF.map((s) => id("staff", s.key));

    // One staff member per membership: if someone put the owner on the diary
    // by hand, that row keeps the link and the seeded one goes without.
    const holder = await prisma.staffMember.findUnique({
        where: { membershipId: options.ownerMembershipId },
        select: { id: true },
    });
    const ownerLink =
        holder && !ids.includes(holder.id) ? null : options.ownerMembershipId;

    for (let i = 0; i < PULSE_STAFF.length; i++) {
        const s = PULSE_STAFF[i];
        const data = {
            name: s.name,
            title: s.title,
            status: "ACTIVE",
            archivedAt: null,
            membershipId: s.owner ? ownerLink : null,
        };
        await prisma.staffMember.upsert({
            where: { id: ids[i] },
            update: data,
            create: {
                id: ids[i],
                organizationId: orgId,
                ...data,
                createdAt: options.createdAt,
            },
        });
    }

    // What each takes and their weekly hours ARE the fixture, so they are
    // rewritten whole; time off and extra hours only where the seed wrote them.
    await prisma.staffService.deleteMany({ where: { staffId: { in: ids } } });
    await prisma.staffHours.deleteMany({ where: { staffId: { in: ids } } });
    const seeded = { id: { startsWith: id("") } };
    await prisma.staffTimeOff.deleteMany({
        where: { staffId: { in: ids }, ...seeded },
    });
    await prisma.staffExtraHours.deleteMany({
        where: { staffId: { in: ids }, ...seeded },
    });

    await prisma.staffService.createMany({
        data: PULSE_STAFF.flatMap((s, i) =>
            s.services.map((service) => ({
                id: id("staffservice", s.key, service),
                organizationId: orgId,
                staffId: ids[i],
                serviceId: options.services[service].id,
                createdAt: options.createdAt,
            })),
        ),
    });
    await prisma.staffHours.createMany({
        data: PULSE_STAFF.flatMap((s, i) =>
            s.hours.flatMap((w, k) =>
                w.days.map((dayOfWeek) => ({
                    id: id("staffhours", s.key, k, dayOfWeek),
                    organizationId: orgId,
                    staffId: ids[i],
                    dayOfWeek,
                    startMinute: minuteOf(w.from),
                    endMinute: minuteOf(w.to),
                    createdAt: options.createdAt,
                })),
            ),
        ),
    });

    // Sameer is off for two days this week; Ananya had a week off last month.
    const sameer = PULSE_STAFF.findIndex((s) => s.key === "sameer");
    const ananya = PULSE_STAFF.findIndex((s) => s.key === "ananya");
    const ritu = PULSE_STAFF.findIndex((s) => s.key === "ritu");
    const timeOff = [
        {
            id: id("timeoff", "sameer", 0),
            staff: sameer,
            startAt: istAt(now, 1, 0),
            endAt: istAt(now, 3, 0),
            reason: "Family wedding in Pune",
            createdAt: istAt(now, -9, 18 * 60),
        },
        {
            id: id("timeoff", "ananya", 0),
            staff: ananya,
            startAt: istAt(now, -26, 0),
            endAt: istAt(now, -21, 0),
            reason: "Teacher training retreat",
            createdAt: istAt(now, -45, 12 * 60),
        },
    ];
    await prisma.staffTimeOff.createMany({
        data: timeOff.map((t) => ({
            id: t.id,
            organizationId: orgId,
            staffId: ids[t.staff],
            startAt: t.startAt,
            endAt: t.endAt,
            allDay: true,
            reason: t.reason,
            createdByUserId: options.ownerUserId,
            createdAt: t.createdAt,
        })),
    });

    // Ritu works this Saturday morning, a day she usually has off: she takes
    // the strength class and any personal training then.
    const saturday = nextWeekday(now, 6);
    const extra = [
        {
            id: id("extrahours", "ritu", 0),
            staff: ritu,
            day: saturday,
            from: "08:00",
            to: "11:00",
        },
    ];
    await prisma.staffExtraHours.createMany({
        data: extra.map((x) => ({
            id: x.id,
            organizationId: orgId,
            staffId: ids[x.staff],
            date: localDate(now, x.day),
            startMinute: minuteOf(x.from),
            endMinute: minuteOf(x.to),
            createdByUserId: options.ownerUserId,
            createdAt: istAt(now, -2, 20 * 60),
        })),
    });

    await prisma.bookingRules.upsert({
        where: { organizationId: orgId },
        update: { ...PULSE_RULES },
        create: {
            id: id("bookingrules"),
            organizationId: orgId,
            ...PULSE_RULES,
            createdAt: options.createdAt,
        },
    });

    return PULSE_STAFF.map((fixture, i) => ({
        id: ids[i],
        fixture,
        timeOff: timeOff
            .filter((t) => t.staff === i)
            .map((t) => ({
                start: t.startAt.getTime(),
                end: t.endAt.getTime(),
            })),
        extra: extra
            .filter((x) => x.staff === i)
            .map((x) => ({
                start: istAt(now, x.day, minuteOf(x.from)).getTime(),
                end: istAt(now, x.day, minuteOf(x.to)).getTime(),
            })),
    }));
}

// --- Planning ------------------------------------------------------------------

export interface PulseInput {
    now: Date;
    orgId: string;
    id: Id;
    rng: Rng;
    staff: readonly PulseStaff[];
    services: readonly SeededService[];
    /** Every booking, the course's included; changed in place. */
    bookings: Prisma.BookingCreateManyInput[];
    /** Their events; changed in place. */
    events: Prisma.BookingEventCreateManyInput[];
    packs: PackPlan;
    packFixtures: readonly ShowcasePack[];
    subscriptions: SubscriptionPlanRows;
    planFixtures: readonly ShowcasePlan[];
    contacts: readonly BillingContact[];
    pool: readonly number[];
    team: readonly string[];
}

export interface PulsePlan {
    notes: Prisma.ContactNoteCreateManyInput[];
}

const ms = (d: unknown) => (d as Date).getTime();

/** A planned row's id: the seed always sets one; the input type does not say so. */
function idOf(row: { id?: string }): string {
    if (!row.id) throw new Error("Pulse: a planned row has no id");
    return row.id;
}

/** Minute of the Kolkata day and weekday of an instant. */
function localClock(t: number) {
    const local = new Date(t + IST);
    return {
        weekday: local.getUTCDay(),
        minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
        month: `${local.getUTCFullYear()}-${local.getUTCMonth()}`,
    };
}

function isWorking(person: PulseStaff, start: number, end: number): boolean {
    if (person.timeOff.some((o) => o.start < end && start < o.end)) {
        return false;
    }
    if (person.extra.some((x) => x.start <= start && end <= x.end)) {
        return true;
    }
    const { weekday, minute } = localClock(start);
    const length = (end - start) / 60_000;
    return person.fixture.hours.some(
        (w) =>
            w.days.includes(weekday) &&
            minute >= minuteOf(w.from) &&
            minute + length <= minuteOf(w.to),
    );
}

export function planPulse(input: PulseInput): PulsePlan {
    const { now, rng, bookings } = input;
    const nowMs = now.getTime();
    const serviceIndex = new Map(input.services.map((s, i) => [s.id, i]));
    const serviceOf = (b: Prisma.BookingCreateManyInput) => {
        const i = serviceIndex.get(b.serviceId);
        if (i === undefined) throw new Error("Pulse: a booking of no service");
        return i;
    };
    const fixtureOf = (b: Prisma.BookingCreateManyInput) =>
        input.services[serviceOf(b)].fixture;
    const isClass = (b: Prisma.BookingCreateManyInput) =>
        fixtureOf(b).capacity > 1;
    const contactIndex = new Map(input.contacts.map((c, i) => [c.id, i]));
    const byStart = [...bookings].sort(
        (a, b) =>
            ms(a.startAt) - ms(b.startAt) || idOf(a).localeCompare(idOf(b)),
    );
    const cancelWindow = PULSE_RULES.freeCancelHours * HOUR;

    // --- late cancels: inside the free-cancellation window, the class stays used
    const isLate = (b: Prisma.BookingCreateManyInput) =>
        !b.courseEnrollmentId &&
        b.status === "CANCELLED" &&
        !!b.cancelledAt &&
        ms(b.cancelledAt) > ms(b.startAt) - cancelWindow;
    const byId = new Map(bookings.map((b) => [idOf(b), b]));
    for (const b of bookings) b.cancelledLate = isLate(b);
    for (const r of input.packs.redemptions) {
        if (byId.get(r.bookingId)?.cancelledLate) r.reversedAt = null;
    }

    // --- two more sales of the 5-class pack: one about to run out, one that ran
    // out unused
    const packIndex = 0;
    const pack = input.packFixtures[packIndex];
    const packId = input.id("pack", packIndex);
    const covered = new Set(pack.services.map((i) => input.services[i].id));
    const spent = new Set(input.packs.redemptions.map((r) => r.bookingId));
    const buyers = new Set(input.packs.purchases.map((p) => p.contactId));
    const extraSale = (
        tag: string,
        contact: number,
        at: Date,
        used: readonly Prisma.BookingCreateManyInput[],
    ) => {
        const staff = rng.pick(input.team);
        const purchaseId = input.id("purchase", packIndex, tag);
        input.packs.purchases.push({
            id: purchaseId,
            organizationId: input.orgId,
            packId,
            contactId: input.contacts[contact].id,
            credits: pack.credits,
            price: rupees(pack.pricePaise),
            currency: "INR",
            expiresAt: new Date(at.getTime() + pack.validityDays * DAY),
            createdByUserId: staff,
            createdAt: at,
        });
        input.packs.seen.push({ contact, at });
        buyers.add(input.contacts[contact].id);
        const paid: Payment = {
            at: addMinutes(at, 4),
            method: "UPI",
            reference: `UPI ref 4${String(rng.int(1e10, 9e10))}`,
        };
        input.packs.invoices.push({
            id: input.id("invoice", "pack", packIndex, tag),
            contact,
            createdAt: at,
            issuedAt: at,
            lines: [
                {
                    description: `${pack.name} · ${pack.credits} classes`,
                    quantity: 1,
                    unitPaise: pack.pricePaise,
                },
            ],
            taxPaise: 0,
            source: "PACK",
            packPurchaseId: purchaseId,
            createdByUserId: staff,
            paid,
            voided: null,
        } satisfies InvoiceSpec);
        used.forEach((b, r) => {
            spent.add(idOf(b));
            input.packs.bookedBy.set(idOf(b), staff);
            input.packs.redemptions.push({
                id: input.id("redemption", packIndex, tag, r),
                organizationId: input.orgId,
                purchaseId,
                bookingId: idOf(b),
                reversedAt: null,
                // Spent the moment it was booked, as the planner does.
                createdAt: addMinutes(b.createdAt as Date, 1),
            });
        });
    };

    const soonAt = istAt(now, -(pack.validityDays - 4), 11 * 60 + 15);
    const soonExpires = soonAt.getTime() + pack.validityDays * DAY;
    const usable = (contactId: string) =>
        byStart.filter(
            (b) =>
                b.contactId === contactId &&
                covered.has(b.serviceId) &&
                !b.courseEnrollmentId &&
                b.status === "CONFIRMED" &&
                !spent.has(idOf(b)) &&
                ms(b.createdAt) >= soonAt.getTime() &&
                ms(b.createdAt) <= nowMs - HOUR &&
                ms(b.startAt) < soonExpires,
        );
    const fresh = input.pool.filter((c) => !buyers.has(input.contacts[c].id));
    const ranked = fresh
        .map((c) => ({ c, list: usable(input.contacts[c].id) }))
        .sort((a, b) => b.list.length - a.list.length || a.c - b.c);
    if (ranked.length < 2) throw new Error("Pulse: nobody left to sell to");
    const soon = ranked[0];
    extraSale(
        "soon",
        soon.c,
        soonAt,
        soon.list.slice(0, Math.min(3, pack.credits - 1)),
    );
    const lapsed = rng.pick(fresh.filter((c) => c !== soon.c));
    extraSale(
        "lapsed",
        lapsed,
        istAt(now, -(pack.validityDays + 14), 18 * 60 + 30),
        [],
    );
    const redeemed = new Set(input.packs.redemptions.map((r) => r.bookingId));

    // --- who takes each booking
    const busy = new Map<string, { start: number; end: number }[]>();
    const isFree = (person: PulseStaff, start: number, end: number) =>
        !(busy.get(person.id) ?? []).some(
            (x) => x.start < end && start < x.end,
        );
    const hold = (person: PulseStaff, start: number, end: number) =>
        busy.set(person.id, [...(busy.get(person.id) ?? []), { start, end }]);
    const takers = (service: number) =>
        input.staff.filter((p) => p.fixture.services.includes(service));

    // Classes first, one instructor for the whole session: the first of those
    // who teach it who is working and free — so the same person teaches the
    // same class week to week, and someone else covers when they are off.
    const sessions = new Map<string, Prisma.BookingCreateManyInput[]>();
    for (const b of byStart) {
        if (!isClass(b)) continue;
        const key = `${b.serviceId}@${ms(b.startAt)}`;
        sessions.set(key, [...(sessions.get(key) ?? []), b]);
    }
    for (const places of Array.from(sessions.values())) {
        const first = places[0];
        const start = ms(first.startAt);
        const end = ms(first.endAt);
        const person = takers(serviceOf(first)).find(
            (p) => isWorking(p, start, end) && isFree(p, start, end),
        );
        for (const b of places) b.staffId = person?.id ?? null;
        if (person && places.some((b) => b.status !== "CANCELLED")) {
            hold(person, start, end);
        }
    }

    // One-to-one: anyone who takes it and is working and free. A few were
    // booked before the business put people on its diary, and stay so.
    for (const b of byStart) {
        if (isClass(b)) continue;
        const start = ms(b.startAt);
        const end = ms(b.endAt);
        const legacy = rng.chance(0.07);
        const standing = b.status !== "CANCELLED";
        const options = takers(serviceOf(b)).filter(
            (p) =>
                isWorking(p, start, end) &&
                (!standing || isFree(p, start, end)),
        );
        const person = options.length > 0 ? rng.pick(options) : null;
        b.staffId = legacy ? null : (person?.id ?? null);
        if (!legacy && person && standing) hold(person, start, end);
    }
    const weekFrom = istAt(now, -3, 0).getTime();
    const weekTo = istAt(now, 7, 0).getTime();
    const inWeek = (b: Prisma.BookingCreateManyInput) =>
        ms(b.startAt) >= weekFrom && ms(b.startAt) < weekTo;
    if (
        !bookings.some((b) => inWeek(b) && !b.staffId && !b.courseEnrollmentId)
    ) {
        const b = byStart.find(
            (x) => !isClass(x) && ms(x.startAt) > nowMs && inWeek(x),
        );
        if (b) b.staffId = null;
    }

    // --- how each was paid
    const planIndex = new Map(
        input.subscriptions.plans.map((p, i) => [idOf(p), i]),
    );
    const active = new Map<
        string,
        Prisma.CustomerSubscriptionCreateManyInput
    >();
    for (const s of input.subscriptions.subscriptions) {
        if (s.status === "ACTIVE") active.set(s.contactId, s);
    }
    const used = new Map<string, number>();
    const bookedEvent = new Map(
        input.events
            .filter((e) => e.type === "BOOKED")
            .map((e) => [e.bookingId, e]),
    );
    const atDesk = (b: Prisma.BookingCreateManyInput) => {
        const event = bookedEvent.get(idOf(b));
        if (event && !event.actorUserId) {
            event.actorUserId =
                input.packs.bookedBy.get(idOf(b)) ?? rng.pick(input.team);
        }
    };
    for (const b of byStart) {
        if (b.courseEnrollmentId) continue;
        if (redeemed.has(idOf(b))) {
            b.paidWith = "PACK";
            atDesk(b);
            continue;
        }
        const sub = b.contactId ? active.get(b.contactId) : undefined;
        if (isClass(b) && sub && ms(sub.createdAt) <= ms(b.createdAt)) {
            const allowance =
                input.planFixtures[planIndex.get(sub.planId) ?? -1]
                    ?.classesPerMonth ?? null;
            const key = `${sub.id}:${localClock(ms(b.startAt)).month}`;
            const counts = b.status === "CONFIRMED" || !!b.cancelledLate;
            const taken = used.get(key) ?? 0;
            if (!counts || allowance === null || taken < allowance) {
                b.paidWith = "MEMBERSHIP";
                b.subscriptionId = idOf(sub);
                if (counts) used.set(key, taken + 1);
                atDesk(b);
                continue;
            }
        }
        const roll = rng.next();
        if (fixtureOf(b).priceCents === null) {
            b.paidWith = null; // a free trial
        } else if (roll < 0.4) {
            b.paidWith = "PAID"; // paid online when they booked on the site
        } else {
            b.paidWith = "DESK";
            atDesk(b);
        }
    }

    // --- a late cancel of a pack class and of a membership class this week
    const lateCandidates = byStart.filter(
        (b) =>
            isClass(b) &&
            !b.courseEnrollmentId &&
            b.status === "CONFIRMED" &&
            ms(b.startAt) >= nowMs - 6 * DAY &&
            ms(b.startAt) <= nowMs - HOUR &&
            ms(b.createdAt) < ms(b.startAt) - 3 * HOUR,
    );
    for (const how of ["PACK", "MEMBERSHIP"] as const) {
        const b =
            lateCandidates.find((x) => x.paidWith === how && !x.outcome) ??
            lateCandidates.find((x) => x.paidWith === how);
        if (!b) continue;
        const cancelledAt = new Date(
            Math.max(
                ms(b.startAt) -
                    rng.int(1, PULSE_RULES.freeCancelHours - 1) * HOUR,
                ms(b.createdAt) + HOUR,
            ),
        );
        b.status = "CANCELLED";
        b.outcome = null;
        b.cancelledAt = cancelledAt;
        b.cancelledLate = true;
        b.updatedAt = cancelledAt;
        for (let k = input.events.length - 1; k >= 0; k--) {
            const e = input.events[k];
            if (
                e.bookingId === b.id &&
                (e.type === "ATTENDED" || e.type === "NO_SHOW")
            ) {
                input.events.splice(k, 1);
            }
        }
        input.events.push({
            id: input.id("bookingevent", "late", idOf(b).slice(-6)),
            bookingId: idOf(b),
            organizationId: input.orgId,
            type: "CANCELLED",
            actorUserId: rng.pick(input.team),
            fromStartAt: b.startAt,
            createdAt: cancelledAt,
        });
    }

    // --- memberships: one changing plan at renewal, one whose renewal failed
    const subs = input.subscriptions.subscriptions;
    const standardId = idOf(input.subscriptions.plans[0]);
    const offPeakId = idOf(input.subscriptions.plans[1]);
    const changing = subs.find(
        (s) =>
            s.status === "ACTIVE" &&
            !s.cancelAtPeriodEnd &&
            s.planId === standardId,
    );
    if (changing) changing.pendingPlanId = offPeakId;

    const invoicesOf = (subId: string) =>
        input.subscriptions.invoices
            .filter((i) => i.subscriptionId === subId)
            .sort((a, b) => ms(a.period?.start) - ms(b.period?.start));
    const pastDue = (inv: InvoiceSpec) =>
        !inv.paid && !!inv.issuedAt && inv.issuedAt.getTime() + 7 * DAY < nowMs;
    const failedRenewal = (s: Prisma.CustomerSubscriptionCreateManyInput) => {
        const list = invoicesOf(idOf(s));
        const latest = list[list.length - 1];
        return s.status === "ACTIVE" && list.length > 1 && pastDue(latest);
    };
    if (!subs.some(failedRenewal)) {
        const s = subs.find((x) => {
            const list = invoicesOf(idOf(x));
            const latest = list[list.length - 1];
            return (
                x.status === "ACTIVE" &&
                !x.cancelAtPeriodEnd &&
                x !== changing &&
                list.length > 1 &&
                !!latest.issuedAt &&
                latest.issuedAt.getTime() < nowMs - 8 * DAY
            );
        });
        if (s) {
            const list = invoicesOf(idOf(s));
            list[list.length - 1].paid = null;
        }
    }

    // --- the team's notes on a few people
    const noteOn = (contactId: string | null | undefined) =>
        contactId ? contactIndex.get(contactId) : undefined;
    const thisWeek = byStart.filter(
        (b) => inWeek(b) && b.status !== "CANCELLED" && b.contactId,
    );
    const member = thisWeek.find((b) => b.paidWith === "MEMBERSHIP");
    const trainee = thisWeek.find(
        (b) => serviceIndex.get(b.serviceId) === 0 && b.staffId,
    );
    const notes: {
        contact: number | undefined;
        body: string;
        daysAgo: number;
    }[] = [
        {
            contact: noteOn(member?.contactId),
            body: "Left knee: ACL reconstruction in 2024. No box jumps or deep lunges; offer step-ups in HIIT.",
            daysAgo: 64,
        },
        {
            contact: noteOn(member?.contactId),
            body: "Physio cleared full squats last week. Build up slowly and check in after class.",
            daysAgo: 6,
        },
        {
            contact: soon.c,
            body: "Mild asthma; keeps an inhaler in their bag. Let them set their own pace on intervals.",
            daysAgo: 40,
        },
        {
            contact: noteOn(trainee?.contactId),
            body: "Training for the 10K in December. Prefers early mornings and pays monthly at the desk.",
            daysAgo: 18,
        },
    ];
    return {
        notes: notes.flatMap((n, k) => {
            if (n.contact === undefined) return [];
            const at = istAt(now, -n.daysAgo, rng.int(9 * 60, 20 * 60));
            const by = rng.pick(input.team);
            return [
                {
                    id: input.id("note", k),
                    organizationId: input.orgId,
                    contactId: input.contacts[n.contact].id,
                    body: n.body,
                    createdByUserId: by,
                    updatedByUserId: by,
                    createdAt: at,
                    updatedAt: at,
                },
            ];
        }),
    };
}

// --- Checks ----------------------------------------------------------------------

export interface PulseCounts {
    staff: number;
    linked: number;
    hours: number;
    timeOffThisWeek: number;
    extraHours: number;
    oneToOneWithStaff: number;
    unassignedThisWeek: number;
    classPlacesNext14Days: string;
    lateCancels: number;
    noShows: number;
    failedRenewals: number;
    paused: number;
    changingPlan: number;
    packsExpiringSoon: number;
    packsExpiredUnused: number;
    notes: number;
}

type Row = Record<string, unknown>;

/**
 * What the Pulse films need on screen, checked in the database: each state
 * the designs show has at least one row to show it with.
 */
export async function checkPulse(
    prisma: Db,
    orgId: string,
    now: Date,
): Promise<PulseCounts> {
    const at = now.toISOString();
    const weekFrom = istAt(now, -3, 0).toISOString();
    const weekTo = istAt(now, 7, 0).toISOString();
    const fortnight = istAt(now, 14, 0).toISOString();
    const one = async (rows: Promise<Row[]>) => Number((await rows)[0]?.n ?? 0);

    const where = { organizationId: orgId };
    const [staff, linked, hours, extraHours, notes] = await Promise.all([
        prisma.staffMember.count({ where: { ...where, status: "ACTIVE" } }),
        prisma.staffMember.count({
            where: { ...where, membershipId: { not: null } },
        }),
        prisma.staffHours.count({ where }),
        prisma.staffExtraHours.count({ where }),
        prisma.contactNote.count({ where }),
    ]);
    const counts: PulseCounts = {
        staff,
        linked,
        hours,
        timeOffThisWeek: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "StaffTimeOff"
            WHERE "organizationId" = ${orgId}
              AND "startAt" < ${weekTo}::timestamp AND "endAt" > ${at}::timestamp`),
        extraHours,
        oneToOneWithStaff: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Booking" b JOIN "Service" s ON s.id = b."serviceId"
            WHERE b."organizationId" = ${orgId} AND s.capacity = 1
              AND b."staffId" IS NOT NULL`),
        unassignedThisWeek: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Booking"
            WHERE "organizationId" = ${orgId} AND "staffId" IS NULL
              AND "courseEnrollmentId" IS NULL
              AND "startAt" >= ${weekFrom}::timestamp AND "startAt" < ${weekTo}::timestamp`),
        classPlacesNext14Days: (
            await prisma.$queryRaw<Row[]>`
                SELECT COALESCE(b."paidWith", 'COURSE') AS how, COUNT(*) AS n
                FROM "Booking" b JOIN "Service" s ON s.id = b."serviceId"
                WHERE b."organizationId" = ${orgId} AND s.capacity > 1
                  AND b.status = 'CONFIRMED'
                  AND b."startAt" >= ${weekFrom}::timestamp
                  AND b."startAt" < ${fortnight}::timestamp
                GROUP BY 1 ORDER BY 1`
        )
            .map((r) => `${Number(r.n)} ${String(r.how).toLowerCase()}`)
            .join(", "),
        lateCancels: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Booking"
            WHERE "organizationId" = ${orgId} AND "cancelledLate"`),
        noShows: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Booking"
            WHERE "organizationId" = ${orgId} AND outcome = 'NO_SHOW'`),
        failedRenewals: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "CustomerSubscription" cs
            JOIN LATERAL (
                SELECT i.* FROM "Invoice" i
                WHERE i."subscriptionId" = cs.id AND i.status <> 'VOID'
                ORDER BY i."periodStart" DESC LIMIT 1
            ) latest ON true
            WHERE cs."organizationId" = ${orgId} AND cs.status = 'ACTIVE'
              AND latest.status = 'ISSUED' AND latest."dueAt" < ${at}::timestamp
              AND latest."createdByUserId" IS NULL`),
        paused: await prisma.customerSubscription.count({
            where: { ...where, status: "PAUSED" },
        }),
        changingPlan: await prisma.customerSubscription.count({
            where: { ...where, pendingPlanId: { not: null } },
        }),
        packsExpiringSoon: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "PackPurchase" p
            WHERE p."organizationId" = ${orgId}
              AND p."expiresAt" > ${at}::timestamp
              AND p."expiresAt" < ${weekTo}::timestamp
              AND EXISTS (SELECT 1 FROM "PackRedemption" r
                  WHERE r."purchaseId" = p.id AND r."reversedAt" IS NULL)`),
        packsExpiredUnused: await one(prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "PackPurchase" p
            WHERE p."organizationId" = ${orgId}
              AND p."expiresAt" < ${at}::timestamp
              AND NOT EXISTS (SELECT 1 FROM "PackRedemption" r
                  WHERE r."purchaseId" = p.id AND r."reversedAt" IS NULL)`),
        notes,
    };

    const missing = Object.entries({
        "four people on the diary": counts.staff >= 4,
        "one linked to a team member": counts.linked >= 1,
        "weekly hours": counts.hours > 0,
        "time off this week": counts.timeOffThisWeek >= 1,
        "one-off extra hours": counts.extraHours >= 1,
        "one-to-one bookings with a person": counts.oneToOneWithStaff > 0,
        "an Unassigned booking this week": counts.unassignedThisWeek >= 1,
        "class places paid by membership, pack, online and at the desk": [
            "membership",
            "pack",
            "paid",
            "desk",
        ].every((how) => counts.classPlacesNext14Days.includes(` ${how}`)),
        "a late cancel": counts.lateCancels >= 1,
        "a no-show": counts.noShows >= 1,
        "a failed renewal": counts.failedRenewals >= 1,
        "a paused membership": counts.paused >= 1,
        "a plan change at renewal": counts.changingPlan >= 1,
        "a pack about to run out": counts.packsExpiringSoon >= 1,
        "a pack that ran out unused": counts.packsExpiredUnused >= 1,
        "notes on a person": counts.notes >= 1,
    }).flatMap(([what, ok]) => (ok ? [] : [what]));
    if (missing.length > 0) {
        throw new Error(
            `Pulse Fitness is missing what its films show: ${missing.join("; ")}`,
        );
    }
    return counts;
}
