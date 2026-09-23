import type { PaidWith } from "./dto";
import { PAID_WITH } from "./dto";

/**
 * The bookings calendar as one read (plan 2026-09-23-003, U4): the org's
 * bookings in a range, grouped by the person who takes them, with each class
 * start gathered into one session that says who is on it and how each paid.
 *
 * Pure: the service loads rows, this shapes them. A booking with no person —
 * every booking made before staff existed (U3 did not backfill) — goes to the
 * Unassigned diary, which is present only when it holds something.
 *
 * Money (DEC-020, ADR-008): a Member reads the diary and the people on it,
 * never a price. How a place was paid (membership, pack, paid, desk) is not a
 * money figure and travels to everyone who reads bookings.
 */

/** What the service loads per booking. */
export interface DiaryRow {
    id: string;
    serviceId: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    status: string;
    outcome: string | null;
    bookerName: string | null;
    bookerEmail: string | null;
    bookerPhone: string | null;
    createdAt: Date;
    cancelledAt: Date | null;
    cancelledLate: boolean;
    paidWith: string | null;
    subscriptionId: string | null;
    service: {
        id: string;
        name: string;
        timezone: string;
        capacity: number;
        durationMinutes: number;
        priceCents: number | null;
        currency: string | null;
    };
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
    } | null;
    staff: { id: string; name: string } | null;
    packRedemption: {
        reversedAt: Date | null;
        purchase: { pack: { name: string } };
    } | null;
}

export interface DiaryPerson {
    id: string;
    name: string;
    title: string | null;
}

export interface DiaryService {
    id: string;
    name: string;
    timezone: string;
    capacity: number;
    durationMinutes: number;
    /** Money only — absent for a viewer who reads no money. */
    priceCents?: number | null;
    currency?: string | null;
}

export interface DiaryBooking {
    id: string;
    serviceId: string;
    startAt: string;
    endAt: string;
    timezone: string;
    status: string;
    outcome: string | null;
    bookerName: string | null;
    bookerEmail: string | null;
    bookerPhone: string | null;
    createdAt: string;
    cancelledAt: string | null;
    cancelledLate: boolean;
    service: DiaryService;
    contact: DiaryRow["contact"];
    staff: { id: string; name: string } | null;
    /** How the place is paid; null when nobody said (older bookings). */
    paidWith: PaidWith | null;
    /** The pack paying for it, while its class is still spent on it. */
    packName: string | null;
    /** The membership whose monthly classes it uses. */
    subscriptionId: string | null;
}

/** One start of a class: the places, who holds them, and how each paid. */
export interface ClassSession {
    /** `<serviceId>@<startAt ISO>` — stable for a session. */
    key: string;
    service: DiaryService;
    startAt: string;
    endAt: string;
    /** The instructor, for display: the first person named on its bookings. */
    staff: { id: string; name: string } | null;
    capacity: number;
    /** Places held — every booking on it that is not cancelled. */
    taken: number;
    /** Everyone booked on it, cancelled included (marked by status). */
    bookings: DiaryBooking[];
}

export interface PersonDiary {
    /** Null: the Unassigned diary. */
    person: DiaryPerson | null;
    /** One-to-one bookings, by start. */
    bookings: DiaryBooking[];
    /** Class sessions this person takes, by start. */
    classes: ClassSession[];
}

/** How a booking was paid, from what it records (U3) and what it holds. */
export function howPaid(row: DiaryRow): PaidWith | null {
    if (row.paidWith && (PAID_WITH as readonly string[]).includes(row.paidWith))
        return row.paidWith as PaidWith;
    if (row.packRedemption?.reversedAt === null) return "PACK";
    if (row.subscriptionId) return "MEMBERSHIP";
    return null;
}

/** A class is a service more than one person books at once. */
export function isClass(service: { capacity: number }): boolean {
    return service.capacity > 1;
}

function serviceView(row: DiaryRow, money: boolean): DiaryService {
    const s = row.service;
    return {
        id: s.id,
        name: s.name,
        timezone: s.timezone,
        capacity: s.capacity,
        durationMinutes: s.durationMinutes,
        ...(money ? { priceCents: s.priceCents, currency: s.currency } : {}),
    };
}

export function diaryBooking(row: DiaryRow, money: boolean): DiaryBooking {
    const pack = row.packRedemption;
    return {
        id: row.id,
        serviceId: row.serviceId,
        startAt: row.startAt.toISOString(),
        endAt: row.endAt.toISOString(),
        timezone: row.timezone,
        status: row.status,
        outcome: row.outcome,
        bookerName: row.bookerName,
        bookerEmail: row.bookerEmail,
        bookerPhone: row.bookerPhone,
        createdAt: row.createdAt.toISOString(),
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
        cancelledLate: row.cancelledLate,
        service: serviceView(row, money),
        contact: row.contact,
        staff: row.staff,
        paidWith: howPaid(row),
        packName:
            pack !== null && pack.reversedAt === null
                ? pack.purchase.pack.name
                : null,
        subscriptionId: row.subscriptionId,
    };
}

const byStart = <T extends { startAt: string }>(a: T, b: T) =>
    a.startAt.localeCompare(b.startAt);

/**
 * Group rows into diaries: one per person given (in their order), then any
 * person named on a booking but not given (someone archived since), then
 * Unassigned when anything has no person.
 */
export function groupDiaries(
    rows: DiaryRow[],
    people: DiaryPerson[],
    money: boolean,
): PersonDiary[] {
    const diaries = new Map<string | null, PersonDiary>();
    for (const person of people) {
        diaries.set(person.id, { person, bookings: [], classes: [] });
    }
    const diaryOf = (staff: { id: string; name: string } | null) => {
        const id = staff?.id ?? null;
        let diary = diaries.get(id);
        if (!diary) {
            diary = {
                person: staff
                    ? { id: staff.id, name: staff.name, title: null }
                    : null,
                bookings: [],
                classes: [],
            };
            diaries.set(id, diary);
        }
        return diary;
    };

    const sessions = new Map<string, ClassSession>();
    for (const row of rows) {
        const booking = diaryBooking(row, money);
        if (!isClass(row.service)) {
            diaryOf(row.staff).bookings.push(booking);
            continue;
        }
        const key = `${row.serviceId}@${booking.startAt}`;
        let session = sessions.get(key);
        if (!session) {
            session = {
                key,
                service: booking.service,
                startAt: booking.startAt,
                endAt: booking.endAt,
                staff: null,
                capacity: row.service.capacity,
                taken: 0,
                bookings: [],
            };
            sessions.set(key, session);
        }
        session.staff ??= row.staff;
        if (row.status !== "CANCELLED") session.taken += 1;
        session.bookings.push(booking);
    }
    for (const session of sessions.values()) {
        // Places held first, then cancellations; each in the order booked.
        session.bookings.sort(
            (a, b) =>
                Number(a.status === "CANCELLED") -
                    Number(b.status === "CANCELLED") ||
                a.createdAt.localeCompare(b.createdAt),
        );
        diaryOf(session.staff).classes.push(session);
    }

    const out = [...diaries.values()];
    for (const diary of out) {
        diary.bookings.sort(byStart);
        diary.classes.sort(byStart);
    }
    // Unassigned last, and only when it holds something.
    const unassigned = diaries.get(null);
    return [
        ...out.filter((d) => d.person !== null),
        ...(unassigned &&
        (unassigned.bookings.length > 0 || unassigned.classes.length > 0)
            ? [unassigned]
            : []),
    ];
}
