import type { Prisma } from "@prisma/client";

import type { PlacedBooking, SeededService } from "./appointments";
import { bookingSnapshot, isSlotStart, slotKey } from "./appointments";
import type {
    ShowcaseCourse,
    ShowcaseManualInvoice,
    ShowcasePack,
    ShowcasePlan,
} from "./data";
import { TIMEZONE } from "./data";
import { addMinutes, earliest, istAt, istWeekday, minuteOf } from "./people";
import type { Period } from "./periods";
import { boundary, periodLabel } from "./periods";
import type { Rng } from "./random";

/**
 * What a business sells beyond a single booking (ADR-007) — plans and the
 * people on them, class packs and the classes spent from them, courses and
 * the people on them — and the invoices all of it raised.
 *
 * Every row is the one the API would have left behind had the history been
 * clicked through by hand and the renewal job run on time:
 *
 * - a subscription is invoiced forward, one invoice per period, the first by
 *   whoever signed the person up and each renewal by the job (no author) at
 *   the period's start; its current period is the last one invoiced, and the
 *   periods are the API's own rules (`./periods`);
 * - a course enrolment books every session still to come when it is made, in
 *   the enrolment's name; cancelling it cancels the sessions after that;
 * - a class is spent from a pack on a confirmed booking of a service the pack
 *   covers, before the pack expires, and a cancelled booking gives it back;
 * - an invoice's lines, subtotal, tax and total agree, and its number is the
 *   business's next one in the order the invoices were issued.
 *
 * Money is computed in integer paise and written as Decimal(12,2) strings.
 */

const HOUR = 3_600_000;
const DAY = 86_400_000;
const CURRENCY = "INR";
/** The API's `DEFAULT_DUE_DAYS`: an issued invoice falls due a week later. */
const DUE_DAYS = 7;

/** Paise as a Decimal(12,2) string: 250000 → "2500.00". */
export const rupees = (paise: number) =>
    `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;

/** "INV-0001", as the API's `formatInvoiceNumber` writes it. */
export const invoiceNumber = (n: number) => `INV-${String(n).padStart(4, "0")}`;

export interface BillingContact {
    id: string;
    name: string;
    email: string;
    phone: string;
    company: string | null;
}

export interface BillingContext {
    now: Date;
    orgId: string;
    /** This business's seeded id for a row. */
    id: (...parts: (string | number)[]) => string;
    /** One random stream per concern. */
    rng: (concern: string) => Rng;
    services: readonly SeededService[];
    contacts: readonly BillingContact[];
    /** Contacts who can be members, students and buyers — not the new leads. */
    pool: readonly number[];
    /** Team members who sign people up and take payments. */
    staff: readonly string[];
    /** Whether Payments is on: without it nothing sold is invoiced. */
    invoicing: boolean;
}

/** When a contact first did something, so they exist before it. */
export interface Seen {
    contact: number;
    at: Date;
}

export interface Payment {
    at: Date;
    method: "CASH" | "UPI" | "BANK_TRANSFER" | "CARD";
    reference: string | null;
}

/** An invoice before it is numbered. */
export interface InvoiceSpec {
    id: string;
    contact: number;
    createdAt: Date;
    /** Null while it is a draft. */
    issuedAt: Date | null;
    lines: readonly {
        description: string;
        quantity: number;
        unitPaise: number;
    }[];
    taxPaise: number;
    source: "MANUAL" | "SUBSCRIPTION" | "COURSE" | "PACK";
    subscriptionId?: string;
    period?: Period;
    courseEnrollmentId?: string;
    packPurchaseId?: string;
    createdByUserId: string | null;
    paid: Payment | null;
    voided: { at: Date; reason: string } | null;
}

// --- small helpers -----------------------------------------------------------

/** `n` distinct items, in a random order. */
function pickDistinct<T>(rng: Rng, items: readonly T[], n: number): T[] {
    if (n > items.length) {
        throw new Error(`Asked for ${n} of ${items.length} items`);
    }
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
}

const later = (...dates: Date[]) =>
    new Date(Math.max(...dates.map((d) => d.getTime())));

const METHODS: readonly { method: Payment["method"]; weight: number }[] = [
    { method: "UPI", weight: 55 },
    { method: "CARD", weight: 20 },
    { method: "CASH", weight: 15 },
    { method: "BANK_TRANSFER", weight: 10 },
];

function paymentAt(rng: Rng, at: Date): Payment {
    const { method } = rng.weighted(METHODS, (m) => m.weight);
    const digits = (n: number) =>
        Array.from({ length: n }, () => rng.int(0, 9)).join("");
    const reference =
        method === "UPI"
            ? `UPI ref ${rng.int(3, 6)}${digits(11)}`
            : method === "BANK_TRANSFER"
              ? `NEFT ${digits(10)}`
              : method === "CARD"
                ? `Card ending ${digits(4)}`
                : null;
    return { at, method, reference };
}

/**
 * When someone pays: promptly (within three days), late (a week or more
 * after the due date's neighbourhood), or not at all. A payment that would
 * land after now has not happened yet.
 */
function settle(
    rng: Rng,
    issuedAt: Date,
    now: Date,
    how: "prompt" | "late" | "unpaid",
): Payment | null {
    if (how === "unpaid") return null;
    const at =
        how === "prompt"
            ? addMinutes(issuedAt, rng.int(5, 3 * 24 * 60))
            : addMinutes(issuedAt, rng.int(8 * 24 * 60, 20 * 24 * 60));
    return at <= now ? paymentAt(rng, at) : null;
}

// --- Courses -------------------------------------------------------------------

export interface CoursePlan {
    courses: Prisma.CourseCreateManyInput[];
    sessions: Prisma.CourseSessionCreateManyInput[];
    enrollments: Prisma.CourseEnrollmentCreateManyInput[];
    bookings: Prisma.BookingCreateManyInput[];
    events: Prisma.BookingEventCreateManyInput[];
    /** Places each session takes from its service, by `slotKey`. */
    reserved: Map<string, number>;
    /** When each person on a course is in class. */
    busy: { contact: number; start: number; end: number }[];
    invoices: InvoiceSpec[];
    seen: Seen[];
}

/**
 * Courses, their dated sessions, the people on them and a booking for each
 * of their sessions. Sessions fall on the service's own slots, so the diary
 * and the course agree on the time.
 */
export function planCourses(
    ctx: BillingContext,
    fixtures: readonly ShowcaseCourse[],
): CoursePlan {
    const { now } = ctx;
    const plan: CoursePlan = {
        courses: [],
        sessions: [],
        enrollments: [],
        bookings: [],
        events: [],
        reserved: new Map(),
        busy: [],
        invoices: [],
        seen: [],
    };

    fixtures.forEach((course, ci) => {
        const service = ctx.services[course.service];
        const s = service.fixture;
        const rng = ctx.rng(`course-${ci}`);
        const courseId = ctx.id("course", ci);
        const people = course.enrolled + (course.lateJoiners ?? 0);
        if (course.seats > s.capacity) {
            throw new Error(`${course.name}: more seats than ${s.name} holds`);
        }
        if (people > course.seats) {
            throw new Error(`${course.name}: more people than seats`);
        }
        if (course.status === "DRAFT" && people > 0) {
            throw new Error(`${course.name}: a draft takes no enrolments`);
        }

        // The sessions: the schedule's weekdays from the first day on.
        const starts: Date[] = [];
        for (let d = course.firstDay; starts.length < course.sessions; d++) {
            const weekday = istWeekday(now, d);
            for (const slot of course.schedule) {
                if (slot.day === weekday && starts.length < course.sessions) {
                    starts.push(istAt(now, d, minuteOf(slot.at)));
                }
            }
        }
        const sessions = starts.map((startAt) => ({
            startAt,
            endAt: addMinutes(startAt, s.minutes),
        }));
        for (const session of sessions) {
            if (!isSlotStart(s, session.startAt)) {
                throw new Error(
                    `${course.name}: ${session.startAt.toISOString()} is not a slot of ${s.name}`,
                );
            }
        }
        const first = sessions[0].startAt;
        const last = sessions[sessions.length - 1];
        const past = sessions.filter((x) => x.startAt < now).length;

        // Who is on it, and when each of them joined.
        const contacts = pickDistinct(rng, ctx.pool, people);
        const joined = contacts.map((contact, e) => {
            const staff = rng.pick(ctx.staff);
            if (e < course.enrolled) {
                const at = earliest(
                    new Date(
                        first.getTime() -
                            rng.int(1, 21) * DAY -
                            rng.int(1, 10) * HOUR,
                    ),
                    new Date(now.getTime() - rng.int(1, 48) * HOUR),
                );
                return { contact, staff, at, from: 0 };
            }
            // A late joiner arrives between two sessions that have passed.
            const k = past >= 2 ? rng.int(1, past - 1) : 0;
            if (k === 0) {
                throw new Error(`${course.name}: no room for a late joiner`);
            }
            const at = earliest(
                new Date(
                    sessions[k - 1].endAt.getTime() + rng.int(2, 30) * HOUR,
                ),
                new Date(sessions[k].startAt.getTime() - HOUR),
                new Date(now.getTime() - HOUR),
            );
            return { contact, staff, at, from: k };
        });

        // Taken off it part-way: the last of those who enrolled on time.
        const cancelledAt = joined.map((j, e) => {
            const cancelled = course.cancelled ?? 0;
            if (e < course.enrolled - cancelled || e >= course.enrolled) {
                return null;
            }
            const until = earliest(now, last.startAt);
            return new Date(
                j.at.getTime() +
                    (until.getTime() - j.at.getTime()) *
                        (0.4 + rng.next() * 0.3),
            );
        });

        const createdAt = new Date(
            Math.min(
                ...joined.map((j) => j.at.getTime()),
                first.getTime(),
                now.getTime(),
            ) -
                rng.int(3, 12) * DAY,
        );
        plan.courses.push({
            id: courseId,
            organizationId: ctx.orgId,
            serviceId: service.id,
            name: course.name,
            description: course.description,
            price: rupees(course.pricePaise),
            currency: CURRENCY,
            seats: course.seats,
            status: course.status,
            createdAt,
            updatedAt:
                course.status === "CLOSED"
                    ? earliest(now, addMinutes(last.endAt, 24 * 60))
                    : createdAt,
        });
        sessions.forEach((session, si) => {
            plan.sessions.push({
                id: ctx.id("coursesession", ci, si),
                organizationId: ctx.orgId,
                courseId,
                ...session,
                createdAt,
            });
        });

        const confirmedAt = sessions.map(() => 0);
        joined.forEach((j, e) => {
            const contact = ctx.contacts[j.contact];
            const enrollmentId = ctx.id("enrollment", ci, e);
            const cancelled = cancelledAt[e];
            const booked = sessions
                .map((session, si) => ({ ...session, si }))
                .filter((session) => session.startAt > j.at);
            const pricePaise =
                j.from === 0
                    ? course.pricePaise
                    : Math.round(
                          (course.pricePaise * booked.length) /
                              course.sessions /
                              10_000,
                      ) * 10_000;

            plan.enrollments.push({
                id: enrollmentId,
                organizationId: ctx.orgId,
                courseId,
                contactId: contact.id,
                status: cancelled ? "CANCELLED" : "ACTIVE",
                price: rupees(pricePaise),
                currency: CURRENCY,
                cancelledAt: cancelled,
                createdByUserId: j.staff,
                createdAt: j.at,
                updatedAt: cancelled ?? j.at,
            });
            plan.seen.push({ contact: j.contact, at: j.at });

            for (const session of booked) {
                const bookingId = ctx.id("coursebooking", ci, e, session.si);
                const eventId = (kind: string) =>
                    ctx.id("coursebookingevent", ci, e, session.si, kind);
                const isCancelled =
                    cancelled !== null && session.startAt > cancelled;
                const hoursAgo =
                    (now.getTime() - session.endAt.getTime()) / HOUR;
                const roll = rng.next();
                const outcome =
                    isCancelled || hoursAgo <= 0
                        ? null
                        : hoursAgo < 72 && roll < 0.5
                          ? null
                          : roll < 0.9
                            ? "ATTENDED"
                            : "NO_SHOW";
                const outcomeAt = earliest(now, addMinutes(session.endAt, 45));
                plan.bookings.push({
                    id: bookingId,
                    organizationId: ctx.orgId,
                    serviceId: service.id,
                    contactId: contact.id,
                    startAt: session.startAt,
                    endAt: session.endAt,
                    timezone: TIMEZONE,
                    status: isCancelled ? "CANCELLED" : "CONFIRMED",
                    outcome,
                    cancelledAt: isCancelled ? cancelled : null,
                    bookerName: contact.name,
                    bookerEmail: contact.email,
                    bookerPhone: contact.phone,
                    snapshot: bookingSnapshot(service, session, {
                        name: contact.name,
                        email: contact.email,
                        phone: contact.phone,
                    }),
                    courseEnrollmentId: enrollmentId,
                    createdAt: j.at,
                    updatedAt: isCancelled
                        ? cancelled
                        : outcome
                          ? outcomeAt
                          : j.at,
                });
                plan.events.push({
                    id: eventId("booked"),
                    bookingId,
                    organizationId: ctx.orgId,
                    type: "BOOKED",
                    actorUserId: j.staff,
                    toStartAt: session.startAt,
                    createdAt: j.at,
                });
                if (isCancelled) {
                    plan.events.push({
                        id: eventId("cancelled"),
                        bookingId,
                        organizationId: ctx.orgId,
                        type: "CANCELLED",
                        actorUserId: j.staff,
                        fromStartAt: session.startAt,
                        createdAt: cancelled,
                    });
                } else {
                    confirmedAt[session.si] += 1;
                    plan.busy.push({
                        contact: j.contact,
                        start: session.startAt.getTime(),
                        end: session.endAt.getTime(),
                    });
                    if (outcome) {
                        plan.events.push({
                            id: eventId("outcome"),
                            bookingId,
                            organizationId: ctx.orgId,
                            type: outcome,
                            actorUserId: j.staff,
                            fromStartAt: session.startAt,
                            createdAt: outcomeAt,
                        });
                    }
                }
            }

            if (ctx.invoicing) {
                const n = booked.length;
                plan.invoices.push({
                    id: ctx.id("invoice", "course", ci, e),
                    contact: j.contact,
                    createdAt: j.at,
                    issuedAt: j.at,
                    lines: [
                        {
                            description: `${course.name} · ${n} ${n === 1 ? "session" : "sessions"}`,
                            quantity: 1,
                            unitPaise: pricePaise,
                        },
                    ],
                    taxPaise: 0,
                    source: "COURSE",
                    courseEnrollmentId: enrollmentId,
                    createdByUserId: j.staff,
                    paid: settle(
                        rng,
                        j.at,
                        now,
                        rng.chance(0.85)
                            ? "prompt"
                            : rng.chance(0.5)
                              ? "late"
                              : "unpaid",
                    ),
                    voided: null,
                });
            }
        });

        // What each session takes from its service: its confirmed bookings,
        // and — while the course is open — the seats nobody has bought yet.
        const active = cancelledAt.filter((c) => c === null).length;
        const unsold = course.status === "OPEN" ? course.seats - active : 0;
        sessions.forEach((session, si) => {
            const taken = confirmedAt[si] + unsold;
            if (taken > s.capacity) {
                throw new Error(
                    `${course.name}: session ${si + 1} takes ${taken} of ${s.capacity} places`,
                );
            }
            const key = slotKey(course.service, session.startAt);
            plan.reserved.set(key, (plan.reserved.get(key) ?? 0) + taken);
        });
    });
    return plan;
}

// --- Class packs ---------------------------------------------------------------

export interface PackPlan {
    packs: Prisma.ClassPackCreateManyInput[];
    packServices: Prisma.ClassPackServiceCreateManyInput[];
    purchases: Prisma.PackPurchaseCreateManyInput[];
    redemptions: Prisma.PackRedemptionCreateManyInput[];
    invoices: InvoiceSpec[];
    seen: Seen[];
    /** Bookings made at the desk to spend a class: who made them. */
    bookedBy: Map<string, string>;
}

/**
 * Packs, who bought them, and the classes spent from them. The buyers are
 * the people who book the pack's classes most; each pack is bought shortly
 * before the first class it pays for, and pays for their bookings of its
 * services until it runs out of classes or expires.
 */
export function planPacks(
    ctx: BillingContext,
    fixtures: readonly ShowcasePack[],
    diary: readonly PlacedBooking[],
    since: Date,
): PackPlan {
    const { now } = ctx;
    const plan: PackPlan = {
        packs: [],
        packServices: [],
        purchases: [],
        redemptions: [],
        invoices: [],
        seen: [],
        bookedBy: new Map(),
    };
    const spent = new Set<string>();

    // Retired packs were sold first, so they take their classes first.
    const order = fixtures
        .map((pack, pi) => ({ pack, pi }))
        .sort(
            (a, b) =>
                Number(b.pack.status === "ARCHIVED") -
                    Number(a.pack.status === "ARCHIVED") || a.pi - b.pi,
        );
    order.forEach(({ pack, pi }) => {
        const rng = ctx.rng(`pack-${pi}`);
        const packId = ctx.id("pack", pi);
        const archived = pack.status === "ARCHIVED";
        plan.packs.push({
            id: packId,
            organizationId: ctx.orgId,
            name: pack.name,
            description: pack.description,
            credits: pack.credits,
            validityDays: pack.validityDays,
            price: rupees(pack.pricePaise),
            currency: CURRENCY,
            status: pack.status,
            createdAt: since,
            updatedAt: archived ? addMinutes(now, -40 * 24 * 60) : since,
        });
        for (const service of pack.services) {
            plan.packServices.push({
                packId,
                serviceId: ctx.services[service].id,
                organizationId: ctx.orgId,
            });
        }

        // An archived pack was sold before it was retired, so only its old
        // classes are candidates.
        const covered = new Set(pack.services);
        const cutoff = now.getTime() - HOUR;
        const eligible = diary.filter(
            (b) =>
                covered.has(b.service) &&
                b.status !== "PENDING" &&
                !spent.has(b.id) &&
                b.createdAt.getTime() <= cutoff &&
                (!archived || b.startAt.getTime() < now.getTime() - 45 * DAY),
        );
        const byContact = new Map<number, PlacedBooking[]>();
        for (const b of eligible) {
            byContact.set(b.contact, [...(byContact.get(b.contact) ?? []), b]);
        }
        const buyers = Array.from(byContact.entries())
            .filter(([, list]) => list.length > 0)
            .sort((a, b) => b[1].length - a[1].length || a[0] - b[0])
            .slice(0, pack.buyers);

        const sell = (contact: number, at: Date, k: number) => {
            const staff = rng.pick(ctx.staff);
            const purchaseId = ctx.id("purchase", pi, k);
            plan.purchases.push({
                id: purchaseId,
                organizationId: ctx.orgId,
                packId,
                contactId: ctx.contacts[contact].id,
                credits: pack.credits,
                price: rupees(pack.pricePaise),
                currency: CURRENCY,
                expiresAt: new Date(at.getTime() + pack.validityDays * DAY),
                createdByUserId: staff,
                createdAt: at,
            });
            plan.seen.push({ contact, at });
            if (ctx.invoicing) {
                plan.invoices.push({
                    id: ctx.id("invoice", "pack", pi, k),
                    contact,
                    createdAt: at,
                    issuedAt: at,
                    lines: [
                        {
                            description: `${pack.name} · ${pack.credits} ${pack.credits === 1 ? "class" : "classes"}`,
                            quantity: 1,
                            unitPaise: pack.pricePaise,
                        },
                    ],
                    taxPaise: 0,
                    source: "PACK",
                    packPurchaseId: purchaseId,
                    createdByUserId: staff,
                    // Packs are paid for at the desk, nearly always there and then.
                    paid: settle(
                        rng,
                        at,
                        now,
                        rng.chance(0.9) ? "prompt" : "unpaid",
                    ),
                    voided: null,
                });
            }
            return { purchaseId, staff };
        };

        buyers.forEach(([contact, list], k) => {
            const ordered = [...list].sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
            );
            const start = ordered[rng.int(0, Math.floor(ordered.length / 3))];
            const at = new Date(
                start.createdAt.getTime() -
                    rng.int(1, 72) * HOUR -
                    rng.int(0, 59) * 60_000,
            );
            const expiresAt = at.getTime() + pack.validityDays * DAY;
            const usable = ordered.filter(
                (b) => b.createdAt >= at && b.startAt.getTime() < expiresAt,
            );
            // Some spend the lot; most are part-way through.
            const target = Math.min(
                pack.credits,
                usable.length,
                Math.max(
                    1,
                    Math.round(pack.credits * (0.35 + rng.next() * 0.65)),
                ),
            );
            const { purchaseId, staff } = sell(contact, at, k);
            usable.slice(0, target).forEach((b, r) => {
                spent.add(b.id);
                plan.bookedBy.set(b.id, staff);
                const redeemedAt = addMinutes(b.createdAt, 1);
                plan.redemptions.push({
                    id: ctx.id("redemption", pi, k, r),
                    organizationId: ctx.orgId,
                    purchaseId,
                    bookingId: b.id,
                    // Cancelling the booking gave the class back.
                    reversedAt:
                        b.status === "CANCELLED" && b.cancelledAt
                            ? later(b.cancelledAt, redeemedAt)
                            : null,
                    createdAt: redeemedAt,
                });
            });
        });

        // A couple bought in the last few days and not used yet.
        if (!archived) {
            const taken = new Set(buyers.map(([c]) => c));
            const fresh = pickDistinct(
                rng,
                ctx.pool.filter((c) => !taken.has(c)),
                2,
            );
            fresh.forEach((contact, f) => {
                sell(
                    contact,
                    new Date(now.getTime() - rng.int(2, 96) * HOUR),
                    buyers.length + f,
                );
            });
        }
    });
    return plan;
}

// --- Subscriptions ---------------------------------------------------------------

export interface SubscriptionPlanRows {
    plans: Prisma.SubscriptionPlanCreateManyInput[];
    subscriptions: Prisma.CustomerSubscriptionCreateManyInput[];
    invoices: InvoiceSpec[];
    seen: Seen[];
}

/**
 * People on plans over the past year. Most are active and pay on time; some
 * owe for their last period or two; a few paused, cancelled, or asked to
 * stop at the end of the period they are in.
 */
export function planSubscriptions(
    ctx: BillingContext,
    fixtures: readonly ShowcasePlan[],
    count: number,
    since: Date,
): SubscriptionPlanRows {
    const { now } = ctx;
    const rng = ctx.rng("subscriptions");
    const out: SubscriptionPlanRows = {
        plans: fixtures.map((p, i) => ({
            id: ctx.id("plan", i),
            organizationId: ctx.orgId,
            name: p.name,
            description: p.description,
            price: rupees(p.pricePaise),
            currency: CURRENCY,
            interval: p.interval,
            status: "ACTIVE",
            createdAt: since,
            updatedAt: p.earlier
                ? istAt(now, -p.earlier.beforeDaysAgo, 10 * 60)
                : since,
        })),
        subscriptions: [],
        invoices: [],
        seen: [],
    };
    if (count === 0) return out;

    const members = pickDistinct(rng, ctx.pool, count);
    members.forEach((contact, i) => {
        const planIndex = fixtures.indexOf(
            rng.weighted(fixtures, (p) => p.weight),
        );
        const plan = fixtures[planIndex];
        const interval = plan.interval;
        const staff = rng.pick(ctx.staff);
        const daysAgo = 3 + Math.floor(Math.pow(rng.next(), 0.85) * 362);
        // The API anchors a new subscription at the start of the day it
        // begins, in its zone; the first invoice goes out as it is made.
        const anchor = istAt(now, -daysAgo, 0);
        const subscribedAt = istAt(now, -daysAgo, rng.int(10 * 60, 19 * 60));
        const pricePaise =
            plan.earlier && daysAgo > plan.earlier.beforeDaysAgo
                ? plan.earlier.pricePaise
                : plan.pricePaise;
        const at = (n: number) => boundary(anchor, interval, TIMEZONE, n);

        // What became of it, and when.
        const fate = rng.next();
        const room = now.getTime() - subscribedAt.getTime();
        let kind: "ACTIVE" | "ENDING" | "PAUSED" | "CANCELLED" =
            fate < 0.06
                ? "PAUSED"
                : fate < 0.15
                  ? "CANCELLED"
                  : fate < 0.18
                    ? "ENDING"
                    : "ACTIVE";
        if ((kind === "PAUSED" || kind === "CANCELLED") && room < 4 * DAY) {
            kind = "ACTIVE";
        }
        const event =
            kind === "PAUSED"
                ? later(
                      addMinutes(subscribedAt, 2 * 24 * 60),
                      istAt(now, -rng.int(3, 75), rng.int(11 * 60, 18 * 60)),
                  )
                : kind === "CANCELLED"
                  ? new Date(
                        subscribedAt.getTime() +
                            room * (0.3 + rng.next() * 0.6),
                    )
                  : now;

        // Invoiced forward: the period it began in, then each renewal the
        // job issued up to the event (or now).
        let n = 0;
        while (at(n + 1) <= event) n += 1;
        const current: Period = { start: at(n), end: at(n + 1) };

        let status: "ACTIVE" | "PAUSED" | "CANCELLED" = "ACTIVE";
        let cancelAtPeriodEnd = false;
        let cancelledAt: Date | null = null;
        let pausedAt: Date | null = null;
        if (kind === "PAUSED") {
            status = "PAUSED";
            pausedAt = event;
        } else if (kind === "CANCELLED") {
            status = "CANCELLED";
            // Either stopped there and then, or asked to stop and the job
            // ended it when the period ran out.
            cancelledAt =
                rng.chance(0.5) && current.end <= now ? current.end : event;
        } else if (kind === "ENDING") {
            cancelAtPeriodEnd = true;
        }

        // How they pay: most on time, some slowly, a few not for the last
        // period or two.
        const payer = rng.next();
        const owes = payer < 0.12 ? rng.int(1, 2) : 0;
        const slow = payer >= 0.12 && payer < 0.25;
        const leftOwing = kind === "CANCELLED" && rng.chance(0.3);

        const subscriptionId = ctx.id("sub", i);
        let lastIssued = subscribedAt;
        for (let k = 0; k <= n; k++) {
            const period: Period = { start: at(k), end: at(k + 1) };
            const issuedAt =
                k === 0
                    ? subscribedAt
                    : earliest(addMinutes(period.start, rng.int(1, 55)), event);
            lastIssued = issuedAt;
            const due = issuedAt.getTime() + DUE_DAYS * DAY;
            const fromEnd = n - k;
            const how: "prompt" | "late" | "unpaid" =
                (fromEnd < owes && due < now.getTime()) ||
                (leftOwing && fromEnd === 0)
                    ? "unpaid"
                    : slow
                      ? "late"
                      : "prompt";
            out.invoices.push({
                id: ctx.id("invoice", "sub", i, k),
                contact,
                createdAt: issuedAt,
                issuedAt,
                lines: [
                    {
                        description: `${plan.name} · ${periodLabel(period, TIMEZONE)}`,
                        quantity: 1,
                        unitPaise: pricePaise,
                    },
                ],
                taxPaise: 0,
                source: "SUBSCRIPTION",
                subscriptionId,
                period,
                createdByUserId: k === 0 ? staff : null,
                paid: settle(rng, issuedAt, now, how),
                voided: null,
            });
        }

        out.subscriptions.push({
            id: subscriptionId,
            organizationId: ctx.orgId,
            planId: ctx.id("plan", planIndex),
            contactId: ctx.contacts[contact].id,
            status,
            price: rupees(pricePaise),
            currency: CURRENCY,
            interval,
            timezone: TIMEZONE,
            anchorAt: anchor,
            currentPeriodStart: current.start,
            currentPeriodEnd: current.end,
            pausedAt,
            cancelAtPeriodEnd,
            cancelledAt,
            createdByUserId: staff,
            createdAt: subscribedAt,
            updatedAt: earliest(
                now,
                later(
                    lastIssued,
                    cancelledAt ?? lastIssued,
                    pausedAt ?? lastIssued,
                ),
            ),
        });
        out.seen.push({ contact, at: subscribedAt });
    });
    return out;
}

// --- Invoices written by hand ------------------------------------------------------

export function planManualInvoices(
    ctx: BillingContext,
    fixtures: readonly ShowcaseManualInvoice[],
): { invoices: InvoiceSpec[]; seen: Seen[] } {
    const { now } = ctx;
    const rng = ctx.rng("manual-invoices");
    const invoices: InvoiceSpec[] = [];
    const seen: Seen[] = [];
    const withCompany = ctx.pool.filter((c) => ctx.contacts[c].company);
    fixtures.forEach((inv, i) => {
        const contact =
            inv.company && withCompany.length > 0
                ? rng.pick(withCompany)
                : rng.pick(ctx.pool);
        const createdAt = earliest(
            istAt(now, -inv.daysAgo, rng.int(10 * 60, 18 * 60)),
            addMinutes(now, -90),
        );
        const issuedAt =
            inv.state === "DRAFT"
                ? null
                : addMinutes(createdAt, rng.int(5, 40));
        const paid =
            inv.state === "PAID" && issuedAt
                ? paymentAt(
                      rng,
                      earliest(
                          addMinutes(issuedAt, rng.int(60, 3 * 24 * 60)),
                          addMinutes(now, -5),
                      ),
                  )
                : null;
        const voided =
            inv.state === "VOID" && issuedAt
                ? {
                      at: earliest(
                          addMinutes(issuedAt, rng.int(60, 2 * 24 * 60)),
                          addMinutes(now, -5),
                      ),
                      reason: inv.voidReason ?? "Issued by mistake",
                  }
                : null;
        invoices.push({
            id: ctx.id("invoice", "manual", i),
            contact,
            createdAt,
            issuedAt,
            lines: inv.lines,
            taxPaise: inv.taxPaise,
            source: "MANUAL",
            createdByUserId: rng.pick(ctx.staff),
            paid,
            voided,
        });
        seen.push({ contact, at: createdAt });
    });
    return { invoices, seen };
}

// --- Numbering and rows ------------------------------------------------------------

export interface InvoiceRows {
    invoices: Prisma.InvoiceCreateManyInput[];
    lines: Prisma.InvoiceLineCreateManyInput[];
    /** The business's last invoice number, for its InvoiceSequence. */
    lastNumber: number;
}

/**
 * Number the invoices in the order they were issued — the order the API's
 * sequence would have handed numbers out — and turn them into rows. Drafts
 * have no number, no bill-to and no due date until they are issued.
 */
export function invoiceRows(
    ctx: BillingContext,
    specs: readonly InvoiceSpec[],
): InvoiceRows {
    const issued = specs
        .filter((s) => s.issuedAt)
        .sort(
            (a, b) =>
                (a.issuedAt?.getTime() ?? 0) - (b.issuedAt?.getTime() ?? 0) ||
                a.id.localeCompare(b.id),
        );
    const numbers = new Map(issued.map((s, i) => [s.id, i + 1]));

    const invoices: Prisma.InvoiceCreateManyInput[] = [];
    const lines: Prisma.InvoiceLineCreateManyInput[] = [];
    for (const spec of specs) {
        const contact = ctx.contacts[spec.contact];
        const subtotal = spec.lines.reduce(
            (sum, l) => sum + l.quantity * l.unitPaise,
            0,
        );
        const number = numbers.get(spec.id);
        const issuedAt = spec.issuedAt;
        const status = !issuedAt
            ? "DRAFT"
            : spec.voided
              ? "VOID"
              : spec.paid
                ? "PAID"
                : "ISSUED";
        invoices.push({
            id: spec.id,
            organizationId: ctx.orgId,
            number: number ? invoiceNumber(number) : null,
            status,
            contactId: contact.id,
            billToName: issuedAt ? contact.name : null,
            billToEmail: issuedAt ? contact.email : null,
            currency: CURRENCY,
            subtotal: rupees(subtotal),
            tax: rupees(spec.taxPaise),
            total: rupees(subtotal + spec.taxPaise),
            issuedAt,
            dueAt: issuedAt
                ? new Date(issuedAt.getTime() + DUE_DAYS * DAY)
                : null,
            paidAt: spec.paid?.at ?? null,
            paymentMethod: spec.paid?.method ?? null,
            paymentReference: spec.paid?.reference ?? null,
            voidedAt: spec.voided?.at ?? null,
            voidReason: spec.voided?.reason ?? null,
            source: spec.source,
            subscriptionId: spec.subscriptionId ?? null,
            periodStart: spec.period?.start ?? null,
            periodEnd: spec.period?.end ?? null,
            courseEnrollmentId: spec.courseEnrollmentId ?? null,
            packPurchaseId: spec.packPurchaseId ?? null,
            createdByUserId: spec.createdByUserId,
            createdAt: spec.createdAt,
            updatedAt:
                spec.voided?.at ?? spec.paid?.at ?? issuedAt ?? spec.createdAt,
        });
        spec.lines.forEach((l, position) => {
            lines.push({
                id: `${spec.id}_line_${position}`,
                organizationId: ctx.orgId,
                invoiceId: spec.id,
                position,
                description: l.description,
                quantity: l.quantity,
                unitPrice: rupees(l.unitPaise),
                amount: rupees(l.quantity * l.unitPaise),
            });
        });
    }
    return { invoices, lines, lastNumber: issued.length };
}
