import type { Prisma } from "@saroh/database";

import type { BookingRulesValue, FieldRefusal } from "./booking-rules";
import {
    bookingWindowRefusal,
    describeMinutes,
    loadBookingRules,
} from "./booking-rules";

/**
 * Each person's own booking rules (DEC-170, #1038): the timing rules of
 * their diary — notice needed, how far ahead and the gap between bookings
 * — each falling back to the business's when it is null ("same as the
 * business"). How customers pay, refunds and the free-cancel window stay
 * business-wide, so they have no column here: free cancelling always
 * follows the business's refund policy (DEC-170, owner 20 Oct 2026), and a
 * person's own is refused ({@link PERSON_FREE_CANCEL_REFUSAL}).
 *
 * A person's rules apply to the one-to-ones they take, where each person
 * is their own diary. A class keeps the business's rules: its sessions are
 * the business's timetable, shared by everyone in them.
 *
 * The rules bind the customer, as the business's do (`booking-rules.ts`):
 * the booking page, a customer moving their own booking. The team booking
 * someone in by hand is not held to the notice and book-ahead rules; the
 * gap, which is about the person's day, holds everywhere
 * (`availability.ts`, `assertPersonFreeInTx`).
 *
 * Pure, but for the two loaders at the foot.
 */

export const PERSON_RULE_FIELDS = [
    "bookAheadDays",
    "latestBookingMinutes",
    "gapMinutes",
] as const;
export type PersonRuleField = (typeof PERSON_RULE_FIELDS)[number];

/**
 * Why a person's own free-cancel window is refused (DEC-170, owner 20 Oct
 * 2026): it follows the business's refund policy, for everyone.
 */
export const PERSON_FREE_CANCEL_REFUSAL =
    "Free cancelling follows the business's refund policy, so it can't be set for one person. Change it in the business's booking rules.";

/** A person's own rules; a null is "same as the business". */
export type PersonRules = Record<PersonRuleField, number | null>;

/** Some of a person's rules, as asked: only the fields that change. */
export type RuleChanges = Partial<PersonRules>;

export const SAME_AS_BUSINESS: PersonRules = {
    bookAheadDays: null,
    latestBookingMinutes: null,
    gapMinutes: null,
};

/** A row's own rules, whatever else it carries. */
export function personRulesOf(row: PersonRules): PersonRules {
    return {
        bookAheadDays: row.bookAheadDays,
        latestBookingMinutes: row.latestBookingMinutes,
        gapMinutes: row.gapMinutes,
    };
}

/**
 * The rules a person's diary keeps: theirs where they have one, the
 * business's where they don't, field by field. Free cancelling is always
 * the business's.
 */
export function rulesForPerson(
    business: BookingRulesValue,
    own: PersonRules | null | undefined,
): BookingRulesValue {
    if (!own) return business;
    return {
        ...business,
        bookAheadDays: own.bookAheadDays ?? business.bookAheadDays,
        latestBookingMinutes:
            own.latestBookingMinutes ?? business.latestBookingMinutes,
        gapMinutes: own.gapMinutes ?? business.gapMinutes,
    };
}

/** The business's rules and each person's own, read once for a listing. */
export interface DiaryRules {
    business: BookingRulesValue;
    people: ReadonlyMap<string, PersonRules>;
}

/** The rules of one person's diary, or the business's for nobody. */
export function ruleFor(
    diary: DiaryRules,
    staffId: string | null | undefined,
): BookingRulesValue {
    return rulesForPerson(
        diary.business,
        staffId ? diary.people.get(staffId) : null,
    );
}

/**
 * The starts a customer may book now. For a one-to-one listed per person
 * (`perPerson`), each start keeps only the people whose own window takes
 * it, and goes when nobody's does; anything else keeps to the business's.
 */
export function bookableStarts<
    T extends { startAt: Date; staffIds?: string[] },
>(slots: readonly T[], now: Date, diary: DiaryRules, perPerson: boolean): T[] {
    const out: T[] = [];
    for (const slot of slots) {
        if (!perPerson || !slot.staffIds || slot.staffIds.length === 0) {
            if (!bookingWindowRefusal(slot.startAt, now, diary.business)) {
                out.push(slot);
            }
            continue;
        }
        const kept = slot.staffIds.filter(
            (id) =>
                !bookingWindowRefusal(slot.startAt, now, ruleFor(diary, id)),
        );
        if (kept.length > 0) out.push({ ...slot, staffIds: kept });
    }
    return out;
}

/**
 * Who of `staffIds` a customer may book at `startAt`, and, when nobody,
 * why — in the first person's words (the one named, when one was).
 * With nobody to ask, the business's rules decide.
 */
export function windowFor(
    startAt: Date,
    now: Date,
    diary: DiaryRules,
    staffIds: readonly string[],
): { kept: string[]; refusal: FieldRefusal | null } {
    if (staffIds.length === 0) {
        return {
            kept: [],
            refusal: bookingWindowRefusal(startAt, now, diary.business),
        };
    }
    const kept = staffIds.filter(
        (id) => !bookingWindowRefusal(startAt, now, ruleFor(diary, id)),
    );
    return {
        kept,
        refusal:
            kept.length > 0
                ? null
                : bookingWindowRefusal(
                      startAt,
                      now,
                      ruleFor(diary, staffIds[0]),
                  ),
    };
}

/**
 * The furthest ahead any of these people can be booked, in days: null
 * when one of them has no limit. With nobody, the business's.
 */
export function furthestAhead(
    diary: DiaryRules,
    staffIds: readonly string[],
): number | null {
    if (staffIds.length === 0) return diary.business.bookAheadDays;
    let most = 0;
    for (const id of staffIds) {
        const days = ruleFor(diary, id).bookAheadDays;
        if (days === null) return null;
        most = Math.max(most, days);
    }
    return most;
}

// ── Changes ────────────────────────────────────────────────────────────────

/** The fields of `asked` that differ from `current`. */
export function changedRules(
    current: PersonRules,
    asked: RuleChanges,
): RuleChanges {
    const out: RuleChanges = {};
    for (const field of PERSON_RULE_FIELDS) {
        const value = asked[field];
        if (value === undefined) continue;
        if (value !== current[field]) out[field] = value;
    }
    return out;
}

/** `current` with `changes` written over it. */
export function applyRuleChanges(
    current: PersonRules,
    changes: RuleChanges,
): PersonRules {
    const out = { ...current };
    for (const field of PERSON_RULE_FIELDS) {
        const value = changes[field];
        if (value !== undefined) out[field] = value;
    }
    return out;
}

/** Whether there is anything to change. */
export function hasChanges(changes: RuleChanges): boolean {
    return PERSON_RULE_FIELDS.some((field) => changes[field] !== undefined);
}

/**
 * A request's stored `changes` read back: known fields only, each a
 * whole number or null. Anything else is dropped, never trusted.
 */
export function storedRuleChanges(value: unknown): RuleChanges {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {};
    }
    const record = value as Record<string, unknown>;
    const out: RuleChanges = {};
    for (const field of PERSON_RULE_FIELDS) {
        if (!(field in record)) continue;
        const v = record[field];
        if (v === null) out[field] = null;
        else if (typeof v === "number" && Number.isInteger(v)) out[field] = v;
    }
    return out;
}

// ── Requests ───────────────────────────────────────────────────────────────

export const RULE_REQUEST_STATUSES = [
    "WAITING",
    "APPROVED",
    "TURNED_DOWN",
    "WITHDRAWN",
    "REPLACED",
] as const;
export type RuleRequestStatus = (typeof RULE_REQUEST_STATUSES)[number];

/**
 * What can happen to a request: decided, withdrawn, asked again, or
 * closed by a newer change (`supersede`).
 */
export type RuleRequestMove =
    "approve" | "turn-down" | "withdraw" | "replace" | "supersede";

/**
 * Where a request goes on `move`, or null when it can't: only a waiting
 * request moves, and once decided it stays decided. Asking again replaces
 * a waiting request, which reads as withdrawn. A newer change closes it as
 * "Replaced by a newer change" (DEC-170, owner 20 Oct 2026): the person's
 * rules changed directly by someone allowed to, or the business switching
 * approval off.
 */
export function nextRequestStatus(
    current: string,
    move: RuleRequestMove,
): RuleRequestStatus | null {
    if (current !== "WAITING") return null;
    switch (move) {
        case "approve":
            return "APPROVED";
        case "turn-down":
            return "TURNED_DOWN";
        case "withdraw":
        case "replace":
            return "WITHDRAWN";
        case "supersede":
            return "REPLACED";
    }
}

/** A request's status as stored; anything unknown reads as withdrawn. */
export function requestStatusOf(value: string): RuleRequestStatus {
    return (RULE_REQUEST_STATUSES as readonly string[]).includes(value)
        ? (value as RuleRequestStatus)
        : "WITHDRAWN";
}

/**
 * What a change to a person's rules does:
 * - `apply`: whoever sets up bookings (`service:write`) changes anyone's,
 *   at once; so does someone changing their own with the switch off.
 * - `request`: their own, with "Members' rule changes need approval" on.
 * - `refuse`: anyone else's, without `service:write`.
 */
export function ruleChangeRoute(input: {
    setsUp: boolean;
    own: boolean;
    needsApproval: boolean;
}): "apply" | "request" | "refuse" {
    if (input.setsUp) return "apply";
    if (!input.own) return "refuse";
    return input.needsApproval ? "request" : "apply";
}

// ── Words ──────────────────────────────────────────────────────────────────

const FIELD_NAMES: Record<PersonRuleField, string> = {
    latestBookingMinutes: "Booking late",
    bookAheadDays: "Booking ahead",
    gapMinutes: "Gap between bookings",
};

/** One rule as the boards say it; null is "same as the business". */
export function ruleWords(
    field: PersonRuleField,
    value: number | null,
): string {
    if (value === null) return `${FIELD_NAMES[field]}: same as the business`;
    switch (field) {
        case "latestBookingMinutes":
            return value === 0
                ? "Booking late: up to the start"
                : `Booking late: up to ${describeMinutes(value)} before the start`;
        case "bookAheadDays":
            return `Booking ahead: up to ${value} ${value === 1 ? "day" : "days"} ahead`;
        case "gapMinutes":
            return value === 0
                ? "No gap needed between bookings"
                : `${value} min between bookings`;
    }
}

/** Every asked change in words, in the boards' order. */
export function changesWords(changes: RuleChanges): string[] {
    const order: PersonRuleField[] = [
        "latestBookingMinutes",
        "bookAheadDays",
        "gapMinutes",
    ];
    return order
        .filter((field) => changes[field] !== undefined)
        .map((field) => ruleWords(field, changes[field] ?? null));
}

// ── Loading ────────────────────────────────────────────────────────────────

type Db = Pick<Prisma.TransactionClient, "bookingRules" | "staffMember">;

const PERSON_RULES_SELECT = {
    id: true,
    bookAheadDays: true,
    latestBookingMinutes: true,
    gapMinutes: true,
} as const;

/** The business's rules and these people's own (everyone's, with none named). */
export async function loadDiaryRules(
    db: Db,
    organizationId: string,
    staffIds?: readonly string[],
): Promise<DiaryRules> {
    if (staffIds?.length === 0) {
        return {
            business: await loadBookingRules(db, organizationId),
            people: new Map(),
        };
    }
    const [business, rows] = await Promise.all([
        loadBookingRules(db, organizationId),
        db.staffMember.findMany({
            where: {
                organizationId,
                ...(staffIds ? { id: { in: [...staffIds] } } : {}),
            },
            select: PERSON_RULES_SELECT,
        }),
    ]);
    return {
        business,
        people: new Map(rows.map((row) => [row.id, personRulesOf(row)])),
    };
}

/** The rules one person's diary keeps, or the business's for nobody. */
export async function loadRulesFor(
    db: Db,
    organizationId: string,
    staffId: string | null | undefined,
): Promise<BookingRulesValue> {
    const diary = await loadDiaryRules(
        db,
        organizationId,
        staffId ? [staffId] : [],
    );
    return ruleFor(diary, staffId);
}
