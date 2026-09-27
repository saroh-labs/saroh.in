import type { Prisma } from "@prisma/client";

import type { Dentist } from "./clinic-data";
import {
    DIWALI,
    DR,
    GENERATED_PATIENTS,
    KAVI_DENTISTS,
    KAVI_GST,
    KAVI_KEY,
    KAVI_PATIENTS,
    KAVI_RULES,
    KAVI_SERVICES,
    kaviId,
    PT,
    RAHUL_BOOKING_NOTE,
    SVC,
} from "./clinic-data";
import { SHOWCASE_SEED, TIMEZONE } from "./data";
import { hashKey, istAt, istWeekday, makePeople, minuteOf } from "./people";
import type { Rng } from "./random";
import { createRng } from "./random";

/**
 * Kavi Dental's dated world, planned before anything is written (E29): the
 * Diwali closure, a dentist's day off, the patients, the diary across both
 * dentists, the Needs attention entries and the invoices. Pure — `now` and
 * the seeded random streams decide everything — so `clinic.test.ts` can plan
 * it for any day and prove each rule holds.
 *
 * Every booking is one the product could have made:
 *
 * - on a start the slot engine offers (`availability.ts` `personSlots`): a
 *   dentist who takes the service, inside their weekly hours, stepping by the
 *   service's length from the window's start, never on their day off or in a
 *   closure, and never overlapping another of theirs;
 * - one-to-one: the same service is never booked twice at once (the seed's
 *   capacity check counts per service), nor the same patient;
 * - made before it starts and before now; one made on the booking page at
 *   least two hours ahead (the booking rules);
 * - an outcome only once it has ended; a cancel inside 24 hours is late.
 *
 * Treatments (root canal, whitening) appear only in their scenes, booked at
 * the desk: E9 makes them orders and owns their money. Everything else paid
 * online has its invoice (source BOOKING, paid at booking); the desk bills a
 * visit by hand afterwards (MANUAL), mostly paid there and then, some still
 * due and one overdue. Every line is exempt: 0%, SAC 9993.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const IST = 330 * MINUTE;

export interface KaviPlanInput {
    now: Date;
    orgId: string;
    ownerUserId: string;
    deskUserId: string;
}

export interface KaviInvoice {
    id: string;
    number: string;
    status: "ISSUED" | "PAID";
    source: "BOOKING" | "MANUAL";
    bookingId: string | null;
    contactId: string;
    billToName: string;
    billToEmail: string;
    createdAt: Date;
    issuedAt: Date;
    dueAt: Date;
    paidAt: Date | null;
    paymentMethod: string | null;
    paymentReference: string | null;
    paymentNote: string | null;
    createdByUserId: string | null;
    lines: { description: string; quantity: number; unitPaise: number }[];
}

export interface KaviWorld {
    closures: Prisma.BusinessClosureCreateManyInput[];
    timeOff: Prisma.StaffTimeOffCreateManyInput[];
    contacts: Prisma.ContactCreateManyInput[];
    bookings: Prisma.BookingCreateManyInput[];
    events: Prisma.BookingEventCreateManyInput[];
    attention: Prisma.ContactAttentionCreateManyInput[];
    intents: Prisma.PaymentIntentCreateManyInput[];
    attempts: Prisma.PaymentAttemptCreateManyInput[];
    invoices: KaviInvoice[];
    /** Each series' last number, e.g. KD/26-27 → 41. */
    sequences: { series: string; lastNumber: number }[];
}

/** A span of time, in epoch milliseconds, end exclusive. */
interface Span {
    start: number;
    end: number;
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/** The seeded ids of Kavi's services and staff, as the writer upserts them. */
export const serviceIdOf = (i: number) => kaviId("service", i);
export const staffIdOf = (d: Dentist) => kaviId("staff", d.key);

const rngFor = (concern: string) =>
    createRng((SHOWCASE_SEED ^ hashKey(KAVI_KEY, concern)) >>> 0);

// --- Closures and days off ------------------------------------------------------

/** Kolkata midnight at the start of an ISO calendar date. */
const localMidnight = (iso: string) => Date.parse(`${iso}T00:00:00Z`) - IST;

/**
 * The Diwali closures that matter now: the next one not yet over, and any
 * that ended in the last sixty days (the diary reaches back that far). The
 * clinic shuts from the day before Diwali to two days after.
 */
export function diwaliClosures(now: Date): Span[] {
    const t = now.getTime();
    const all = DIWALI.map((iso) => {
        const start = localMidnight(iso) - DAY;
        return { start, end: start + 4 * DAY };
    });
    const next = all.find((c) => c.end > t);
    if (!next) {
        throw new Error(
            "Kavi Dental: add the next Diwali to DIWALI in clinic-data.ts",
        );
    }
    return all.filter((c) => c.end > t - 60 * DAY && c.start <= next.start);
}

/** Minute of the Kolkata day and weekday of an instant. */
function localClock(t: number): { weekday: number; minute: number } {
    const local = new Date(t + IST);
    return {
        weekday: local.getUTCDay(),
        minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
    };
}

/** A dentist's weekly windows on the Kolkata day `dayOffset` from now. */
function windowsOn(now: Date, dentist: Dentist, dayOffset: number): Span[] {
    const weekday = istWeekday(now, dayOffset);
    return dentist.hours
        .filter((w) => w.days.includes(weekday))
        .map((w) => ({
            start: istAt(now, dayOffset, minuteOf(w.from)).getTime(),
            end: istAt(now, dayOffset, minuteOf(w.to)).getTime(),
        }))
        .sort((a, b) => a.start - b.start);
}

/** The Kolkata day offset from `now`'s day of an instant. */
const dayOffsetOf = (now: Date, t: number) =>
    Math.round(
        (istAt(new Date(t), 0, 0).getTime() - istAt(now, 0, 0).getTime()) / DAY,
    );

// --- The world ----------------------------------------------------------------------

type Status = "CONFIRMED" | "CANCELLED";
type Outcome = "ATTENDED" | "NO_SHOW" | null;

interface Planned {
    id: string;
    /** Scenes carry a key; generated bookings don't. */
    scene: string | null;
    contact: number;
    dentist: number;
    service: number;
    start: number;
    end: number;
    /** Who made it at the clinic; null: the patient, on the booking page. */
    madeBy: string | null;
    createdAt: number;
    status: Status;
    outcome: Outcome;
    outcomeBy: string | null;
    outcomeAt: number | null;
    cancelledAt: number | null;
    cancelledBy: string | null;
    paidWith: "PAID" | "DESK";
    locationType: "IN_PERSON" | "ONLINE" | null;
}

interface Person {
    id: string;
    first: string;
    last: string;
    email: string;
    phone: string;
}

export function planKavi(input: KaviPlanInput): KaviWorld {
    const { now, orgId } = input;
    const t = now.getTime();
    const staffUser = (rng: Rng) =>
        rng.chance(0.7) ? input.deskUserId : input.ownerUserId;

    // --- closures, and a dentist's day off this week
    const closed = diwaliClosures(now);
    const closures: Prisma.BusinessClosureCreateManyInput[] = closed.map(
        (c) => ({
            id: kaviId(
                "closure",
                new Date(c.start + IST + DAY).getUTCFullYear(),
            ),
            organizationId: orgId,
            startAt: new Date(c.start),
            endAt: new Date(c.end),
            allDay: true,
            reason: "Closed for Diwali",
            createdByUserId: input.ownerUserId,
            // Put up weeks ahead, at the end of a working day.
            createdAt: new Date(
                Math.min(c.start - 40 * DAY + 18.5 * HOUR, t - HOUR),
            ),
        }),
    );
    const isClosed = (s: Span) => closed.some((c) => overlaps(c, s));

    // Dr. Pillai takes a day off this week — or Dr. Rao, when Pillai's only
    // open day left is that one (a closure can take the rest): whoever is
    // off still sees patients on another day this week.
    const openDay = (dentist: number, d: number) =>
        windowsOn(now, KAVI_DENTISTS[dentist], d).some(
            (w) => w.end > t + 3 * HOUR,
        ) &&
        !isClosed({
            start: istAt(now, d, 0).getTime(),
            end: istAt(now, d + 1, 0).getTime(),
        });
    let offDentist: number = DR.pillai;
    let offDay = -1;
    for (const dentist of [DR.pillai, DR.rao]) {
        for (let d = 1; d <= 6 && offDay < 0; d++) {
            const another = [0, 1, 2, 3, 4, 5, 6].some(
                (e) => e !== d && openDay(dentist, e),
            );
            if (openDay(dentist, d) && another) {
                offDentist = dentist;
                offDay = d;
            }
        }
        if (offDay >= 0) break;
    }
    if (offDay < 0)
        throw new Error("Kavi Dental: no day off to give this week");
    const dayOff: Span = {
        start: istAt(now, offDay, 0).getTime(),
        end: istAt(now, offDay + 1, 0).getTime(),
    };
    const timeOff: Prisma.StaffTimeOffCreateManyInput[] = [
        {
            id: kaviId("timeoff", KAVI_DENTISTS[offDentist].key, 0),
            organizationId: orgId,
            staffId: staffIdOf(KAVI_DENTISTS[offDentist]),
            startAt: new Date(dayOff.start),
            endAt: new Date(dayOff.end),
            allDay: true,
            reason: "At a dental conference in Chennai",
            createdByUserId: input.ownerUserId,
            createdAt: new Date(
                Math.min(istAt(now, -12, 18 * 60).getTime(), t - HOUR),
            ),
        },
    ];
    const blocked = (dentist: number, s: Span) =>
        isClosed(s) || (dentist === offDentist && overlaps(dayOff, s));

    // --- the people
    const fixed: Person[] = KAVI_PATIENTS.map((p) => ({
        id: kaviId("contact", p.key),
        first: p.first,
        last: p.last,
        email: p.email,
        phone: p.phone,
    }));
    const generated = makePeople(
        rngFor("people"),
        GENERATED_PATIENTS,
        new Set(fixed.map((p) => p.email)),
    ).map((p, i) => ({
        id: kaviId("contact", i),
        first: p.first,
        last: p.last,
        email: p.email,
        phone: `+91 ${p.phone}`,
    }));
    const people = [...fixed, ...generated];

    // --- who is busy when
    const busyStaff = KAVI_DENTISTS.map((): Span[] => []);
    const busyService = KAVI_SERVICES.map((): Span[] => []);
    const busyPerson = new Map<number, Span[]>();
    const isFree = (
        dentist: number,
        service: number,
        s: Span,
        contact?: number,
    ) =>
        !busyStaff[dentist].some((b) => overlaps(b, s)) &&
        !busyService[service].some((b) => overlaps(b, s)) &&
        (contact === undefined ||
            !(busyPerson.get(contact) ?? []).some((b) => overlaps(b, s)));
    const hold = (p: Planned) => {
        const s = { start: p.start, end: p.end };
        busyStaff[p.dentist].push(s);
        busyService[p.service].push(s);
        busyPerson.set(p.contact, [...(busyPerson.get(p.contact) ?? []), s]);
    };

    /**
     * The first start the slot engine would offer this dentist for this
     * service at or after `from` and before `until`, free for the patient.
     */
    const firstSlot = (
        dentist: number,
        service: number,
        contact: number,
        from: number,
        until: number,
    ): Span => {
        const minutes = KAVI_SERVICES[service].minutes;
        const step = minutes * MINUTE;
        for (
            let d = dayOffsetOf(now, from);
            d <= dayOffsetOf(now, until);
            d++
        ) {
            for (const w of windowsOn(now, KAVI_DENTISTS[dentist], d)) {
                const k = Math.max(0, Math.ceil((from - w.start) / step));
                for (
                    let s = w.start + k * step;
                    s + step <= w.end && s < until;
                    s += step
                ) {
                    const slot = { start: s, end: s + step };
                    if (
                        !blocked(dentist, slot) &&
                        isFree(dentist, service, slot, contact)
                    ) {
                        return slot;
                    }
                }
            }
        }
        throw new Error(
            `Kavi Dental: no ${KAVI_SERVICES[service].name} free with ` +
                `${KAVI_DENTISTS[dentist].name} for ${people[contact].first} ` +
                `between ${new Date(from).toISOString()} and ${new Date(until).toISOString()}`,
        );
    };

    const planned: Planned[] = [];
    const sceneRng = rngFor("scenes");

    // --- the scenes the designs show (saroh-fixtures.js), relative to now
    const scene = (a: {
        key: string;
        contact: number;
        /** Who takes it: the first of these with a free start. */
        dentists: readonly number[];
        service: number;
        from: number;
        until: number;
        /** Null: the patient, on the booking page. */
        madeBy: string | null;
        /** When it was made, given its start. */
        made: (start: number) => number;
        paidWith?: "PAID" | "DESK";
        locationType?: "IN_PERSON" | "ONLINE";
    }): Planned => {
        let found: { dentist: number; slot: Span } | null = null;
        let refused: unknown = null;
        for (const dentist of a.dentists) {
            try {
                found = {
                    dentist,
                    slot: firstSlot(
                        dentist,
                        a.service,
                        a.contact,
                        a.from,
                        a.until,
                    ),
                };
                break;
            } catch (error) {
                refused = error;
            }
        }
        if (!found) throw refused;
        const { slot } = found;
        const past = slot.end <= t;
        const p: Planned = {
            id: kaviId("booking", a.key),
            scene: a.key,
            contact: a.contact,
            dentist: found.dentist,
            service: a.service,
            ...slot,
            madeBy: a.madeBy,
            createdAt: a.made(slot.start),
            status: "CONFIRMED",
            outcome: past ? "ATTENDED" : null,
            outcomeBy: past ? input.deskUserId : null,
            outcomeAt: past ? Math.min(t, slot.end + 25 * MINUTE) : null,
            cancelledAt: null,
            cancelledBy: null,
            paidWith: a.paidWith ?? "DESK",
            locationType: a.locationType ?? null,
        };
        planned.push(p);
        hold(p);
        return p;
    };
    const ago = (m: number) => t - m * MINUTE;
    const soon = t + 3 * HOUR;

    // Rahul's root canal with Dr. Rao: the first visit last week, at the desk;
    // the second coming up, which he booked on the site last night — with a
    // note the team hasn't looked at yet.
    const rct1 = scene({
        key: "rahul_rct_1",
        contact: PT.rahul,
        dentists: [DR.rao],
        service: SVC.rootCanal,
        from: istAt(now, -10, 9 * 60).getTime(),
        until: istAt(now, -3, 0).getTime(),
        madeBy: input.deskUserId,
        made: (start) => start - 8 * DAY - 2 * HOUR,
    });
    const rct2 = scene({
        key: "rahul_rct_2",
        contact: PT.rahul,
        dentists: [DR.rao],
        service: SVC.rootCanal,
        from: soon,
        until: istAt(now, 7, 0).getTime(),
        madeBy: null,
        made: (start) =>
            Math.max(
                rct1.end + HOUR,
                Math.min(
                    istAt(now, -1, 21 * 60 + 12).getTime(),
                    start - 3 * HOUR,
                    ago(30),
                ),
            ),
    });
    // Leela: a check-up with Dr. Pillai soon, and a video consultation.
    const leelaCheck = scene({
        key: "leela_checkup",
        contact: PT.leela,
        dentists: [DR.pillai, DR.rao],
        service: SVC.checkUp,
        from: Math.max(soon, istAt(now, 0, 11 * 60).getTime()),
        until: istAt(now, 7, 0).getTime(),
        madeBy: null,
        made: (start) => Math.min(start - 2 * DAY, ago(5 * 60)),
    });
    scene({
        key: "leela_video",
        contact: PT.leela,
        dentists: [DR.rao, DR.pillai],
        service: SVC.video,
        from: Math.max(istAt(now, 1, 16 * 60).getTime(), leelaCheck.end),
        until: t + 10 * DAY,
        madeBy: null,
        made: (start) =>
            Math.min(
                istAt(now, -1, 19 * 60 + 12).getTime(),
                start - 3 * HOUR,
                ago(30),
            ),
        paidWith: "PAID",
        locationType: "ONLINE",
    });
    // Farah's whitening with Dr. Pillai, booked on the site two nights ago.
    scene({
        key: "farah_whitening",
        contact: PT.farah,
        dentists: [DR.pillai],
        service: SVC.whitening,
        from: istAt(now, 2, 17 * 60).getTime(),
        until: t + 14 * DAY,
        madeBy: null,
        made: (start) =>
            Math.min(
                istAt(now, -2, 21 * 60 + 40).getTime(),
                start - 3 * HOUR,
                ago(30),
            ),
    });
    // Vikram: a check-up two weeks ago, the X-ray it led to (still unpaid),
    // and a review coming up with Dr. Rao.
    const vikramCheck = scene({
        key: "vikram_checkup",
        contact: PT.vikram,
        dentists: [DR.pillai, DR.rao],
        service: SVC.checkUp,
        from: istAt(now, -21, 9 * 60).getTime(),
        until: istAt(now, -12, 0).getTime(),
        madeBy: null,
        made: (start) => start - 3 * DAY - 5 * HOUR,
    });
    // Within six days of the check-up and over a week ago, so its bill is
    // overdue.
    const xrayFrom = vikramCheck.end;
    const xrayUntil = Math.min(
        vikramCheck.end + 6 * DAY,
        istAt(now, -8, 0).getTime(),
    );
    const xray = scene({
        key: "vikram_xray",
        contact: PT.vikram,
        dentists: [DR.rao, DR.pillai],
        service: SVC.xray,
        from: xrayFrom,
        until: xrayUntil,
        madeBy: input.deskUserId,
        // Booked by the desk while the check-up was on.
        made: (start) =>
            Math.max(vikramCheck.start + 10 * MINUTE, start - 50 * MINUTE),
    });
    scene({
        key: "vikram_review",
        contact: PT.vikram,
        dentists: [DR.rao, DR.pillai],
        service: SVC.review,
        from: Math.max(soon, istAt(now, 0, 16 * 60 + 30).getTime()),
        until: t + 8 * DAY,
        madeBy: input.deskUserId,
        made: () => Math.min(xray.end + 10 * MINUTE, ago(30)),
    });

    // --- the day-to-day diary
    const rng = rngFor("diary");
    const share = (d: number) =>
        d < -30 ? 0.2 : d < 0 ? 0.3 : d <= 7 ? 0.35 : 0.15;
    let n = 0;
    for (let d = -60; d <= 21; d++) {
        for (let dentist = 0; dentist < KAVI_DENTISTS.length; dentist++) {
            const takes = KAVI_DENTISTS[dentist].services.filter(
                (s) => KAVI_SERVICES[s].weight > 0,
            );
            for (const w of windowsOn(now, KAVI_DENTISTS[dentist], d)) {
                let cursor = w.start;
                while (cursor < w.end) {
                    const roll = rng.next();
                    const service = rng.weighted(
                        takes,
                        (s) => KAVI_SERVICES[s].weight,
                    );
                    const step = KAVI_SERVICES[service].minutes * MINUTE;
                    const k = Math.ceil((cursor - w.start) / step);
                    const slot = {
                        start: w.start + k * step,
                        end: w.start + k * step + step,
                    };
                    const contact =
                        fixed.length + rng.skewed(generated.length, 1.4);
                    const fits =
                        roll < share(d) &&
                        slot.end <= w.end &&
                        !blocked(dentist, slot) &&
                        isFree(dentist, service, slot, contact);
                    if (!fits) {
                        cursor += 30 * MINUTE;
                        continue;
                    }
                    planned.push(
                        dayToDay(rng, n++, contact, dentist, service, slot),
                    );
                    const last = planned[planned.length - 1];
                    if (last.status !== "CANCELLED") hold(last);
                    // A cancelled one still keeps its service's start: the
                    // seed reads a service and start as one session, whose
                    // bookings share one person.
                    else busyService[service].push(slot);
                    cursor = slot.end;
                }
            }
        }
    }

    function dayToDay(
        r: Rng,
        index: number,
        contact: number,
        dentist: number,
        service: number,
        slot: Span,
    ): Planned {
        const [r1, r2, r3, r4] = [r.next(), r.next(), r.next(), r.next()];
        const online = service !== SVC.xray && r4 < 0.55;
        const lead = online
            ? r.int(3 * 60, 10 * 24 * 60)
            : r.int(15, 14 * 24 * 60);
        const createdAt = Math.min(
            slot.start - lead * MINUTE,
            ago(r.int(30, 600)),
        );
        const madeBy = online ? null : staffUser(r);
        const payOnline = online && service !== SVC.xray && r3 < 0.4;
        const hoursAgo = (t - slot.end) / HOUR;
        let status: Status = "CONFIRMED";
        let outcome: Outcome = null;
        if (hoursAgo > 0) {
            if (r1 < 0.06) status = "CANCELLED";
            else if (hoursAgo < 72 && r2 < 0.45) outcome = null;
            else outcome = r3 < 0.07 ? "NO_SHOW" : "ATTENDED";
        } else if (slot.start > t && r1 < 0.05) {
            status = "CANCELLED";
        }
        const cancelledAt =
            status === "CANCELLED"
                ? Math.min(
                      t,
                      createdAt + (slot.start - createdAt) * (0.3 + 0.6 * r2),
                  )
                : null;
        return {
            id: kaviId("booking", index),
            scene: null,
            contact,
            dentist,
            service,
            ...slot,
            madeBy,
            createdAt,
            status,
            outcome,
            outcomeBy: outcome ? staffUser(r) : null,
            outcomeAt: outcome
                ? Math.min(t, slot.end + r.int(10, 90) * MINUTE)
                : null,
            cancelledAt,
            cancelledBy:
                cancelledAt === null
                    ? null
                    : online && r2 < 0.5
                      ? null
                      : staffUser(r),
            // A cancelled booking was never paid online: a paid one's money
            // would be owed back, which is a refund the seed doesn't write.
            paidWith: payOnline && status !== "CANCELLED" ? "PAID" : "DESK",
            locationType:
                service === SVC.video
                    ? r2 < 0.6
                        ? "ONLINE"
                        : "IN_PERSON"
                    : null,
        };
    }

    // --- at least one no-show and one late cancel, whatever the day
    const dayToDayPast = planned
        .filter(
            (p) => !p.scene && p.end < t - 4 * DAY && p.status === "CONFIRMED",
        )
        .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    if (!planned.some((p) => p.outcome === "NO_SHOW")) {
        const p = dayToDayPast.find((x) => x.outcome === "ATTENDED");
        if (!p) throw new Error("Kavi Dental: nobody to mark as a no-show");
        p.outcome = "NO_SHOW";
    }
    const isLate = (p: Planned) =>
        p.cancelledAt !== null &&
        p.cancelledAt > p.start - KAVI_RULES.freeCancelHours * HOUR;
    if (!planned.some(isLate)) {
        const p = [...dayToDayPast]
            .reverse()
            .find(
                (x) =>
                    x.outcome === "ATTENDED" &&
                    x.paidWith === "DESK" &&
                    x.createdAt < x.start - 30 * HOUR,
            );
        if (!p) throw new Error("Kavi Dental: nobody to cancel late");
        p.status = "CANCELLED";
        p.outcome = null;
        p.outcomeBy = null;
        p.outcomeAt = null;
        p.cancelledAt = p.start - sceneRng.int(2, 20) * HOUR;
        p.cancelledBy = null;
    }

    // --- rows
    planned.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    const bookings: Prisma.BookingCreateManyInput[] = [];
    const events: Prisma.BookingEventCreateManyInput[] = [];
    for (const p of planned) {
        const person = people[p.contact];
        const svc = KAVI_SERVICES[p.service];
        const name = `${person.first} ${person.last}`;
        const actor = p.madeBy;
        const lastTouched = p.cancelledAt ?? p.outcomeAt ?? p.createdAt;
        bookings.push({
            id: p.id,
            organizationId: orgId,
            serviceId: serviceIdOf(p.service),
            contactId: person.id,
            staffId: staffIdOf(KAVI_DENTISTS[p.dentist]),
            startAt: new Date(p.start),
            endAt: new Date(p.end),
            timezone: TIMEZONE,
            status: p.status,
            outcome: p.outcome,
            cancelledAt:
                p.cancelledAt === null ? null : new Date(p.cancelledAt),
            cancelledLate: isLate(p),
            paidWith: p.paidWith,
            locationType: p.locationType,
            bookerName: name,
            bookerEmail: person.email,
            bookerPhone: person.phone,
            snapshot: {
                service: {
                    id: serviceIdOf(p.service),
                    name: svc.name,
                    durationMinutes: svc.minutes,
                    bufferBeforeMinutes: 0,
                    bufferAfterMinutes: 0,
                    capacity: 1,
                    timezone: TIMEZONE,
                    priceCents: svc.pricePaise,
                    currency: "INR",
                    locationType: svc.locationType,
                    meetingUrl: svc.meetingUrl,
                },
                slot: {
                    startAt: new Date(p.start).toISOString(),
                    endAt: new Date(p.end).toISOString(),
                },
                booker: { name, email: person.email, phone: person.phone },
            },
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(Math.min(t, lastTouched)),
        });
        events.push({
            id: kaviId(
                "bookingevent",
                p.id.slice(KAVI_PREFIX_LENGTH),
                "booked",
            ),
            bookingId: p.id,
            organizationId: orgId,
            type: "BOOKED",
            actorUserId: actor,
            toStartAt: new Date(p.start),
            createdAt: new Date(p.createdAt),
        });
        if (p.cancelledAt !== null) {
            events.push({
                id: kaviId(
                    "bookingevent",
                    p.id.slice(KAVI_PREFIX_LENGTH),
                    "cancelled",
                ),
                bookingId: p.id,
                organizationId: orgId,
                type: "CANCELLED",
                actorUserId: p.cancelledBy,
                fromStartAt: new Date(p.start),
                createdAt: new Date(p.cancelledAt),
            });
        }
        if (p.outcome && p.outcomeAt !== null) {
            events.push({
                id: kaviId(
                    "bookingevent",
                    p.id.slice(KAVI_PREFIX_LENGTH),
                    "outcome",
                ),
                bookingId: p.id,
                organizationId: orgId,
                type: p.outcome,
                actorUserId: p.outcomeBy,
                fromStartAt: new Date(p.start),
                createdAt: new Date(p.outcomeAt),
            });
        }
    }

    // --- contacts: each exists from the first thing they did
    const firstSeen = new Map<number, number>();
    const firstPublic = new Map<number, boolean>();
    for (const p of [...planned].sort((a, b) => a.createdAt - b.createdAt)) {
        if (!firstSeen.has(p.contact)) {
            firstSeen.set(p.contact, p.createdAt - 5 * MINUTE);
            firstPublic.set(p.contact, p.madeBy === null);
        }
    }
    const contactRng = rngFor("contacts");
    const contactCreatedAt = people.map((_, i) => {
        const drawn = istAt(now, -contactRng.int(20, 190), 11 * 60).getTime();
        return Math.min(firstSeen.get(i) ?? drawn, t - HOUR);
    });
    const contacts: Prisma.ContactCreateManyInput[] = people.map((p, i) => ({
        id: p.id,
        organizationId: orgId,
        email: p.email,
        firstName: p.first,
        lastName: p.last,
        phone: p.phone,
        source: firstPublic.get(i)
            ? "WEBSITE"
            : contactRng.pick(["WALK_IN", "REFERRAL", "GOOGLE"]),
        createdAt: new Date(contactCreatedAt[i]),
        updatedAt: new Date(contactCreatedAt[i]),
    }));

    // --- Needs attention (C1), written directly: what the team knows about
    // the designs' patients, and Rahul's booking-page note waiting as a
    // suggestion (sensitive until the team confirms it).
    const attention: Prisma.ContactAttentionCreateManyInput[] = [];
    KAVI_PATIENTS.forEach((patient, i) => {
        const at = new Date(contactCreatedAt[i] + 10 * MINUTE);
        patient.attention.forEach((a, k) => {
            attention.push({
                id: kaviId("attention", patient.key, k),
                organizationId: orgId,
                contactId: fixed[i].id,
                kind: a.kind,
                label: a.label,
                detail: a.detail,
                sensitive: a.sensitive,
                source: "STAFF",
                status: "ACTIVE",
                createdByUserId: input.deskUserId,
                createdAt: at,
                updatedAt: at,
            });
        });
    });
    attention.push({
        id: kaviId("attention", "rahul", "note"),
        organizationId: orgId,
        contactId: fixed[PT.rahul].id,
        kind: "MEDICAL",
        label: "Started a new BP tablet (amlodipine)",
        detail: RAHUL_BOOKING_NOTE,
        sensitive: true,
        source: "BOOKING_PAGE",
        status: "SUGGESTED",
        bookingId: rct2.id,
        createdByUserId: null,
        createdAt: new Date(rct2.createdAt),
        updatedAt: new Date(rct2.createdAt),
    });

    // --- money
    const money = planMoney(input, planned, people);

    return {
        closures,
        timeOff,
        contacts,
        bookings,
        events,
        attention,
        ...money,
    };
}

const KAVI_PREFIX_LENGTH = kaviId("booking", "").length;

// --- Invoices -----------------------------------------------------------------------

/** "Check-up and clean · Tue 15 Sep 2026, 16:30", as `holdLineDescription` writes it. */
export function lineDescription(serviceName: string, start: number): string {
    const local = new Date(start + IST);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
    ];
    const hh = String(local.getUTCHours()).padStart(2, "0");
    const mm = String(local.getUTCMinutes()).padStart(2, "0");
    return `${serviceName} · ${days[local.getUTCDay()]} ${local.getUTCDate()} ${months[local.getUTCMonth()]} ${local.getUTCFullYear()}, ${hh}:${mm}`;
}

/** The financial year of an instant, in Kolkata: 23 Sep 2026 → "26-27". */
export function financialYear(at: number): string {
    const local = new Date(at + IST);
    const start =
        local.getUTCMonth() >= 3
            ? local.getUTCFullYear()
            : local.getUTCFullYear() - 1;
    const yy = (y: number) => String(y % 100).padStart(2, "0");
    return `${yy(start)}-${yy(start + 1)}`;
}

const TREATMENTS: readonly number[] = [SVC.rootCanal, SVC.whitening];

const hex = (rng: Rng, n: number) =>
    Array.from({ length: n }, () =>
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789".charAt(
            rng.int(0, 57),
        ),
    ).join("");

function planMoney(
    input: KaviPlanInput,
    planned: readonly Planned[],
    people: readonly Person[],
): Pick<KaviWorld, "intents" | "attempts" | "invoices" | "sequences"> {
    const { orgId } = input;
    const t = input.now.getTime();
    const rng = rngFor("money");
    const intents: Prisma.PaymentIntentCreateManyInput[] = [];
    const attempts: Prisma.PaymentAttemptCreateManyInput[] = [];
    const docs: Omit<KaviInvoice, "number">[] = [];

    const bill = (p: Planned) => {
        const person = people[p.contact];
        const svc = KAVI_SERVICES[p.service];
        return {
            contactId: person.id,
            billToName: `${person.first} ${person.last}`,
            billToEmail: person.email,
            lines: [
                {
                    description: lineDescription(svc.name, p.start),
                    quantity: 1,
                    unitPaise: svc.pricePaise,
                },
            ],
        };
    };

    for (const p of planned) {
        const key = p.id.slice(KAVI_PREFIX_LENGTH);
        if (p.paidWith === "PAID") {
            // Paid on the booking page: the hold's invoice, numbered and
            // paid by the provider's webhook a few minutes after booking.
            const paidAt = p.createdAt + rng.int(2, 6) * MINUTE;
            const invoiceId = kaviId("invoice", "b", key);
            const ref = `pay_${hex(rng, 14)}`;
            intents.push({
                id: kaviId("intent", key),
                organizationId: orgId,
                invoiceId,
                provider: "RAZORPAY",
                providerIntentId: `order_${hex(rng, 14)}`,
                amountCents: KAVI_SERVICES[p.service].pricePaise,
                currency: "INR",
                status: "SUCCEEDED",
                createdAt: new Date(p.createdAt),
                updatedAt: new Date(paidAt),
            });
            attempts.push({
                id: kaviId("attempt", key),
                organizationId: orgId,
                paymentIntentId: kaviId("intent", key),
                provider: "RAZORPAY",
                providerRef: ref,
                status: "CAPTURED",
                createdAt: new Date(paidAt),
            });
            docs.push({
                id: invoiceId,
                status: "PAID",
                source: "BOOKING",
                bookingId: p.id,
                ...bill(p),
                createdAt: new Date(p.createdAt),
                issuedAt: new Date(paidAt),
                dueAt: new Date(paidAt),
                paidAt: new Date(paidAt),
                paymentMethod: "ONLINE",
                paymentReference: ref,
                paymentNote: "Paid online through Razorpay",
                createdByUserId: null,
            });
            continue;
        }
        // Billed at the desk after the visit: most paid there and then.
        const billable =
            p.outcome === "ATTENDED" &&
            !TREATMENTS.includes(p.service) &&
            p.end + 20 * MINUTE <= t;
        const scene =
            p.id === kaviId("booking", "vikram_xray")
                ? "overdue"
                : p.id === kaviId("booking", "vikram_checkup")
                  ? "card"
                  : null;
        if (!billable || (!scene && !rng.chance(0.6))) continue;
        const issuedAt = p.end + rng.int(3, 12) * MINUTE;
        const paid =
            scene === "card" || (scene !== "overdue" && rng.chance(0.85));
        const paidAt = issuedAt + rng.int(1, 4) * MINUTE;
        const method =
            scene === "card"
                ? "CARD"
                : rng.weighted(
                      [
                          { m: "UPI", w: 55 },
                          { m: "CASH", w: 25 },
                          { m: "CARD", w: 20 },
                      ],
                      (x) => x.w,
                  ).m;
        docs.push({
            id: kaviId("invoice", "m", key),
            status: paid ? "PAID" : "ISSUED",
            source: "MANUAL",
            bookingId: null,
            ...bill(p),
            createdAt: new Date(issuedAt),
            issuedAt: new Date(issuedAt),
            dueAt: new Date(issuedAt + 7 * DAY),
            paidAt: paid ? new Date(paidAt) : null,
            paymentMethod: paid ? method : null,
            paymentReference: !paid
                ? null
                : method === "UPI"
                  ? `UPI ref ${rng.int(3, 6)}${String(rng.int(1e9, 9e9))}${rng.int(0, 9)}`
                  : method === "CARD"
                    ? `Card ending ${String(rng.int(1000, 9999))}`
                    : null,
            paymentNote: null,
            createdByUserId: rng.chance(0.75)
                ? input.deskUserId
                : input.ownerUserId,
        });
    }
    // One still due, not yet overdue: the latest bill written at the desk.
    if (!docs.some((d) => d.status === "ISSUED" && d.dueAt.getTime() > t)) {
        const last = docs
            .filter(
                (d) =>
                    d.source === "MANUAL" &&
                    d.id !== kaviId("invoice", "m", "vikram_xray"),
            )
            .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
            .at(0);
        if (!last) throw new Error("Kavi Dental: no desk bill to leave due");
        last.status = "ISSUED";
        last.paidAt = null;
        last.paymentMethod = null;
        last.paymentReference = null;
        last.dueAt = new Date(
            Math.max(last.dueAt.getTime(), istAt(input.now, 5, 0).getTime()),
        );
    }

    // Numbered in the order the paper was issued: KD/<FY>/0001…
    const ordered = [...docs].sort(
        (a, b) =>
            a.issuedAt.getTime() - b.issuedAt.getTime() ||
            a.id.localeCompare(b.id),
    );
    const last = new Map<string, number>();
    const invoices: KaviInvoice[] = ordered.map((d) => {
        const series = `${KAVI_GST.prefix}/${financialYear(d.issuedAt.getTime())}`;
        const k = (last.get(series) ?? 0) + 1;
        last.set(series, k);
        return { ...d, number: `${series}/${String(k).padStart(4, "0")}` };
    });
    return {
        intents,
        attempts,
        invoices,
        sequences: Array.from(last.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([series, lastNumber]) => ({ series, lastNumber })),
    };
}

/** Where a local instant falls: exported for the checks and the test. */
export { localClock };
