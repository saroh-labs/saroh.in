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
