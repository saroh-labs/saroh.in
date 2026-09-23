import { DateTime, IANAZone } from "luxon";

/**
 * Pure, timezone-aware availability geometry for bookable Services (S4-002).
 *
 * This module contains NO Nest DI, NO Prisma and NO clock/network access — it is
 * a deterministic function of its inputs, so the DST and capacity behaviour is
 * exhaustively unit-testable. It never hand-rolls UTC-offset math: all local
 * ⇆ absolute conversions go through luxon's IANA zone database, so a rule
 * authored as "09:00 in America/New_York" resolves to a DIFFERENT absolute UTC
 * instant either side of a daylight-saving transition (the whole point of the
 * "DST correctness" acceptance criterion).
 *
 * Model:
 *  - `AvailabilityRule`s are recurring WEEKLY windows expressed as minutes from
 *    LOCAL midnight in the Service's timezone (`dayOfWeek` 0=Sun..6=Sat).
 *  - Within a window we place back-to-back slots. Each slot's booking occupies
 *    `durationMinutes`; consecutive slot STARTS are spaced by
 *    `durationMinutes + bufferBeforeMinutes + bufferAfterMinutes` — so with zero
 *    buffers slots step purely by duration, and buffers add dead time between
 *    slots ("buffers space slots"). A slot is emitted only if its whole booking
 *    interval `[start, start+duration]` fits inside the window.
 *  - A slot is OPEN iff the number of CONFIRMED bookings overlapping it is
 *    strictly less than the Service `capacity`.
 */

/** The Service terms this module needs — a structural subset of the Prisma row. */
export interface AvailabilityService {
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    capacity: number;
    /** IANA timezone the rules are authored in, e.g. "Asia/Kolkata". */
    timezone: string;
}

/** A recurring weekly availability window (subset of the Prisma AvailabilityRule). */
export interface AvailabilityRuleWindow {
    /** 0 = Sunday … 6 = Saturday (matches the schema). */
    dayOfWeek: number;
    /** Minutes from local midnight, inclusive (0–1439). */
    startMinute: number;
    /** Minutes from local midnight, exclusive; > startMinute (1–1440). */
    endMinute: number;
}

/** An absolute-UTC bookable slot. */
export interface Slot {
    startAt: Date;
    endAt: Date;
}

/** An absolute-UTC interval (e.g. an existing booking) used for overlap checks. */
export interface Interval {
    startAt: Date;
    endAt: Date;
}

/** Two half-open intervals `[start, end)` overlap iff each starts before the other ends. */
export function overlaps(a: Interval, b: Interval): boolean {
    return (
        a.startAt.getTime() < b.endAt.getTime() &&
        a.endAt.getTime() > b.startAt.getTime()
    );
}

/** How many of `bookings` overlap `slot` (used against `capacity`). */
export function countOverlapping(slot: Interval, bookings: Interval[]): number {
    let n = 0;
    for (const b of bookings) {
        if (overlaps(slot, b)) n += 1;
    }
    return n;
}

/** The spacing between consecutive slot starts within a window. */
function stepMinutes(service: AvailabilityService): number {
    return (
        service.durationMinutes +
        service.bufferBeforeMinutes +
        service.bufferAfterMinutes
    );
}

/** luxon weekday (1=Mon..7=Sun) → schema dayOfWeek (0=Sun..6=Sat). */
function schemaDayOfWeek(dt: DateTime): number {
    return dt.weekday % 7;
}

/**
 * Convert a local minute-of-day on a given calendar day (in the Service tz) to
 * an absolute UTC instant, or `null` if the wall-clock time does not exist (a
 * spring-forward gap). Delegating to luxon is what makes this DST-correct.
 */
function localToUtc(
    day: DateTime,
    minuteOfDay: number,
    zone: string,
): Date | null {
    const dt = DateTime.fromObject(
        {
            year: day.year,
            month: day.month,
            day: day.day,
            hour: Math.floor(minuteOfDay / 60),
            minute: minuteOfDay % 60,
        },
        { zone },
    );
    if (!dt.isValid) return null;
    return dt.toUTC().toJSDate();
}

/**
 * Enumerate the candidate slots (pure geometry — capacity is NOT applied here)
 * for a Service across the absolute-UTC range `[from, to)`. A slot is included
 * only if its whole `[start, end]` interval falls within the range.
 *
 * Days are iterated in the Service's LOCAL calendar so a "Monday 09:00" rule
 * lands on the correct wall-clock time and thus the correct UTC instant on every
 * date, DST transitions included.
 */
export function enumerateSlots(
    service: AvailabilityService,
    rules: AvailabilityRuleWindow[],
    from: Date,
    to: Date,
): Slot[] {
    if (!IANAZone.isValidZone(service.timezone)) {
        throw new Error(`Invalid IANA timezone "${service.timezone}"`);
    }
    if (service.durationMinutes <= 0) return [];

    const zone = service.timezone;
    const step = stepMinutes(service);
    const fromMs = from.getTime();
    const toMs = to.getTime();

    // Group rules by day-of-week for cheap per-day lookup.
    const rulesByDow = new Map<number, AvailabilityRuleWindow[]>();
    for (const rule of rules) {
        const list = rulesByDow.get(rule.dayOfWeek) ?? [];
        list.push(rule);
        rulesByDow.set(rule.dayOfWeek, list);
    }

    const slots: Slot[] = [];

    // Walk local calendar days from the day containing `from` through the day
    // containing `to`. One extra trailing day guards a slot whose local day
    // rolls over relative to the UTC boundary.
    let day = DateTime.fromJSDate(from, { zone }).startOf("day");
    const lastDay = DateTime.fromJSDate(to, { zone })
        .startOf("day")
        .plus({ days: 1 });

    while (day <= lastDay) {
        const dow = schemaDayOfWeek(day);
        const dayRules = rulesByDow.get(dow) ?? [];

        for (const rule of dayRules) {
            for (
                let start = rule.startMinute;
                start + service.durationMinutes <= rule.endMinute;
                start += step
            ) {
                const startAt = localToUtc(day, start, zone);
                if (startAt === null) continue; // non-existent wall-clock time
                const endAt = localToUtc(
                    day,
                    start + service.durationMinutes,
                    zone,
                );
                if (endAt === null) continue;

                // Keep only slots fully inside the requested absolute range.
                if (startAt.getTime() >= fromMs && endAt.getTime() <= toMs) {
                    slots.push({ startAt, endAt });
                }
            }
        }

        day = day.plus({ days: 1 });
    }

    // Stable chronological order (rules/days may interleave otherwise).
    slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    return slots;
}

/**
 * Available (open) slots: candidate slots whose CONFIRMED-booking overlap count
 * is below `capacity`. `confirmed` is the set of CONFIRMED bookings overlapping
 * the range (the caller supplies them; this stays pure).
 */
export function availableSlots(
    service: AvailabilityService,
    rules: AvailabilityRuleWindow[],
    from: Date,
    to: Date,
    confirmed: Interval[],
): Slot[] {
    return enumerateSlots(service, rules, from, to).filter(
        (slot) => countOverlapping(slot, confirmed) < service.capacity,
    );
}

/**
 * Is `startAt` the exact start of a real, geometrically-valid slot for this
 * Service (aligned to a rule window + duration stepping)? This validates the
 * booking's requested instant BEFORE the transactional capacity check — a
 * client can't book an off-grid time. Capacity/openness is enforced separately
 * (authoritatively, inside the serializable reservation transaction).
 */
export function isValidSlotStart(
    service: AvailabilityService,
    rules: AvailabilityRuleWindow[],
    startAt: Date,
): boolean {
    // A one-slot-wide window around the instant is enough to test alignment.
    const endAt = new Date(
        startAt.getTime() + service.durationMinutes * 60_000,
    );
    const candidates = enumerateSlots(service, rules, startAt, endAt);
    return candidates.some(
        (slot) => slot.startAt.getTime() === startAt.getTime(),
    );
}

// ── Per-person availability (U3) ───────────────────────────────────────────
//
// A service somebody takes gets its free times from each person's working
// time: their weekly hours plus any one-off extra hours, minus time off,
// intersected with the service's own weekly rules when it has any. Slots step
// from the start of each resulting window, so "Mon 6–12, 60 minutes" offers
// 6:00 … 11:00. A person already booked — on any service — is not free.
//
// Hours are authored in the BUSINESS's timezone; a service's rules in its
// own. Both become absolute intervals before they meet, so they agree even
// where the two zones differ, and every local ⇆ absolute step goes through
// luxon, so a DST change moves the instants and not the wall-clock hours.

/** One-off hours on a calendar date (`YYYY-MM-DD`, local to the zone). */
export interface DatedWindow {
    date: string;
    startMinute: number;
    endMinute: number;
}

/** Everything the engine needs to know about one person. */
export interface StaffAvailabilityInput {
    id: string;
    /** Weekly working hours, in the business timezone. */
    hours: AvailabilityRuleWindow[];
    /** One-off extra hours on given dates, in the business timezone. */
    extraHours: DatedWindow[];
    /** Absolute time off. */
    timeOff: Interval[];
    /** Absolute confirmed bookings of this person, on any service. */
    busy: Interval[];
}

/** A free start, and who is free to take it. */
export interface StaffSlot extends Slot {
    staffIds: string[];
}

const MINUTE = 60_000;

/**
 * A local minute-of-day (0–1440) on a calendar day, as an absolute instant.
 * 1440 is the next day's midnight — a window that runs to the end of the day.
 */
function localMinuteToUtc(
    day: DateTime,
    minuteOfDay: number,
    zone: string,
): Date | null {
    if (minuteOfDay >= 1440) {
        return localToUtc(day.plus({ days: 1 }), 0, zone);
    }
    return localToUtc(day, minuteOfDay, zone);
}

/** Sort and union overlapping or touching intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
    const sorted = [...list]
        .filter((i) => i.endAt.getTime() > i.startAt.getTime())
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    const out: Interval[] = [];
    for (const next of sorted) {
        const last = out[out.length - 1];
        if (out.length > 0 && next.startAt.getTime() <= last.endAt.getTime()) {
            if (next.endAt.getTime() > last.endAt.getTime()) {
                out[out.length - 1] = {
                    startAt: last.startAt,
                    endAt: next.endAt,
                };
            }
        } else {
            out.push({ startAt: next.startAt, endAt: next.endAt });
        }
    }
    return out;
}

/** `a` with every part covered by `b` taken out. */
export function subtractIntervals(a: Interval[], b: Interval[]): Interval[] {
    const cuts = mergeIntervals(b);
    const out: Interval[] = [];
    for (const piece of mergeIntervals(a)) {
        let start = piece.startAt.getTime();
        const end = piece.endAt.getTime();
        for (const cut of cuts) {
            const cs = cut.startAt.getTime();
            const ce = cut.endAt.getTime();
            if (ce <= start || cs >= end) continue;
            if (cs > start) {
                out.push({ startAt: new Date(start), endAt: new Date(cs) });
            }
            start = Math.max(start, ce);
            if (start >= end) break;
        }
        if (start < end) {
            out.push({ startAt: new Date(start), endAt: new Date(end) });
        }
    }
    return out;
}

/** The parts covered by both `a` and `b`. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
    const left = mergeIntervals(a);
    const right = mergeIntervals(b);
    const out: Interval[] = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
        const l = left[i];
        const r = right[j];
        const start = Math.max(l.startAt.getTime(), r.startAt.getTime());
        const end = Math.min(l.endAt.getTime(), r.endAt.getTime());
        if (start < end) {
            out.push({ startAt: new Date(start), endAt: new Date(end) });
        }
        if (l.endAt.getTime() < r.endAt.getTime()) i += 1;
        else j += 1;
    }
    return out;
}

/** Whether `inner` lies wholly inside one of `windows`. */
export function withinIntervals(inner: Interval, windows: Interval[]): boolean {
    return mergeIntervals(windows).some(
        (w) =>
            w.startAt.getTime() <= inner.startAt.getTime() &&
            w.endAt.getTime() >= inner.endAt.getTime(),
    );
}

/**
 * Weekly windows as absolute intervals on every local day touching
 * `[from, to)` — plus a day either side, so a window is never cut at the
 * range's edge (a cut window would step from the cut, off the grid).
 */
export function weeklyIntervals(
    windows: AvailabilityRuleWindow[],
    zone: string,
    from: Date,
    to: Date,
): Interval[] {
    if (!IANAZone.isValidZone(zone)) {
        throw new Error(`Invalid IANA timezone "${zone}"`);
    }
    const out: Interval[] = [];
    let day = DateTime.fromJSDate(from, { zone })
        .startOf("day")
        .minus({ days: 1 });
    const lastDay = DateTime.fromJSDate(to, { zone })
        .startOf("day")
        .plus({ days: 1 });
    while (day <= lastDay) {
        const dow = schemaDayOfWeek(day);
        for (const w of windows) {
            if (w.dayOfWeek !== dow) continue;
            const startAt = localMinuteToUtc(day, w.startMinute, zone);
            const endAt = localMinuteToUtc(day, w.endMinute, zone);
            if (startAt && endAt && endAt > startAt) {
                out.push({ startAt, endAt });
            }
        }
        day = day.plus({ days: 1 });
    }
    return out;
}

/** One-off dated windows as absolute intervals. */
export function datedIntervals(
    windows: DatedWindow[],
    zone: string,
): Interval[] {
    const out: Interval[] = [];
    for (const w of windows) {
        const day = DateTime.fromISO(w.date, { zone }).startOf("day");
        if (!day.isValid) continue;
        const startAt = localMinuteToUtc(day, w.startMinute, zone);
        const endAt = localMinuteToUtc(day, w.endMinute, zone);
        if (startAt && endAt && endAt > startAt) out.push({ startAt, endAt });
    }
    return out;
}

/**
 * When a person is at work over `[from, to)` (padded a day either side):
 * weekly hours and extra hours together, time off taken out.
 */
export function workingIntervals(
    person: Pick<StaffAvailabilityInput, "hours" | "extraHours" | "timeOff">,
    zone: string,
    from: Date,
    to: Date,
): Interval[] {
    const on = [
        ...weeklyIntervals(person.hours, zone, from, to),
        ...datedIntervals(person.extraHours, zone),
    ];
    return subtractIntervals(mergeIntervals(on), person.timeOff);
}

/**
 * Back-to-back starts inside each window, stepping from the window's start
 * by `step` minutes; a slot is kept only when its whole booking fits in the
 * window and in `[from, to]`.
 */
export function slotsInIntervals(
    windows: Interval[],
    durationMinutes: number,
    stepMinutes: number,
    from: Date,
    to: Date,
): Slot[] {
    if (durationMinutes <= 0 || stepMinutes <= 0) return [];
    const out: Slot[] = [];
    for (const w of mergeIntervals(windows)) {
        const end = w.endAt.getTime();
        for (
            let start = w.startAt.getTime();
            start + durationMinutes * MINUTE <= end;
            start += stepMinutes * MINUTE
        ) {
            const slotEnd = start + durationMinutes * MINUTE;
            if (start >= from.getTime() && slotEnd <= to.getTime()) {
                out.push({
                    startAt: new Date(start),
                    endAt: new Date(slotEnd),
                });
            }
        }
    }
    return out;
}

/**
 * One person's free starts for a one-to-one service over `[from, to)`:
 * their working time (in `zone`), intersected with the service's own weekly
 * rules when it has any, less anything they are already booked for.
 */
export function personSlots(
    service: AvailabilityService,
    serviceRules: AvailabilityRuleWindow[],
    person: StaffAvailabilityInput,
    zone: string,
    from: Date,
    to: Date,
): Slot[] {
    let windows = workingIntervals(person, zone, from, to);
    if (serviceRules.length > 0) {
        windows = intersectIntervals(
            windows,
            weeklyIntervals(serviceRules, service.timezone, from, to),
        );
    }
    return slotsInIntervals(
        windows,
        service.durationMinutes,
        stepMinutes(service),
        from,
        to,
    ).filter((slot) => countOverlapping(slot, person.busy) === 0);
}

/**
 * Free starts for a one-to-one service somebody takes, over `[from, to)`,
 * each naming everyone free for it — chronological.
 */
export function staffSlots(
    service: AvailabilityService,
    serviceRules: AvailabilityRuleWindow[],
    people: StaffAvailabilityInput[],
    zone: string,
    from: Date,
    to: Date,
): StaffSlot[] {
    const byStart = new Map<number, StaffSlot>();
    for (const person of people) {
        const slots = personSlots(
            service,
            serviceRules,
            person,
            zone,
            from,
            to,
        );
        for (const slot of slots) {
            const key = slot.startAt.getTime();
            const found = byStart.get(key);
            if (found) found.staffIds.push(person.id);
            else byStart.set(key, { ...slot, staffIds: [person.id] });
        }
    }
    return [...byStart.values()].sort(
        (a, b) => a.startAt.getTime() - b.startAt.getTime(),
    );
}

/**
 * Is `startAt` one of this person's free starts for the service? The same
 * geometry the listing uses, so nothing can be booked that was not offered.
 */
export function isPersonSlotStart(
    service: AvailabilityService,
    serviceRules: AvailabilityRuleWindow[],
    person: StaffAvailabilityInput,
    zone: string,
    startAt: Date,
): boolean {
    const endAt = new Date(
        startAt.getTime() + service.durationMinutes * MINUTE,
    );
    return personSlots(
        service,
        serviceRules,
        person,
        zone,
        startAt,
        endAt,
    ).some((slot) => slot.startAt.getTime() === startAt.getTime());
}
