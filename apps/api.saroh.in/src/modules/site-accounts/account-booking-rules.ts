import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma, Service } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { BookingRulesValue } from "../bookings/booking-rules";
import {
    bookingWindowRefusal,
    withinBookingWindow,
} from "../bookings/booking-rules";
import { openSlots } from "../bookings/booking-slots";
import { bookingPaymentInTx } from "../payments/booking-refund";
import type { AccountCancelTerms } from "./account-bookings-view";
import type { CustomerContext } from "./customer-context.decorator";

/*
 * The customer's own rules for their bookings (round-2 plan A, A6): which
 * bookings are theirs, what can't be changed from the account, a new time
 * they could book on the booking page, what a cancel would do, and the
 * free times a sheet offers. `AccountBookingsService` applies them.
 */

export type Ctx = Pick<
    CustomerContext,
    "organizationId" | "contactId" | "accountId"
>;

/** How far ahead free times are offered: the booking page's two weeks. */
const TIMES_DAYS = 14;
/** At most this many free times a day, and in all (the design's sheet). */
const TIMES_PER_DAY = 3;
const TIMES_MAX = 12;

/** What a customer hears when the time went while they chose. */
export const TIME_WENT = "That time just went. Pick another one.";

const DAY = 86_400_000;

/** What a booking row reads, for the lists and every change. */
export const ROW_SELECT = {
    id: true,
    startAt: true,
    endAt: true,
    timezone: true,
    status: true,
    outcome: true,
    locationType: true,
    cancelledLate: true,
    visitNumber: true,
    orderId: true,
    freeCancelUntil: true,
    courseEnrollmentId: true,
    paidWith: true,
    service: {
        select: { id: true, name: true, capacity: true, visits: true },
    },
    staff: { select: { name: true } },
    order: { select: { status: true, paymentStatus: true } },
    packRedemption: { select: { reversedAt: true } },
} as const satisfies Prisma.BookingSelect;

export type Row = Prisma.BookingGetPayload<{ select: typeof ROW_SELECT }>;

/** The business's name, for "Call ‹business› to change this". */
export async function businessName(ctx: Ctx): Promise<string> {
    const org = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { name: true },
    });
    return org?.name ?? "the business";
}

/** A signed-in customer's own bookings: their business and their contact. */
export function ownBookingsWhere(ctx: Ctx): Prisma.BookingWhereInput {
    return { organizationId: ctx.organizationId, contactId: ctx.contactId };
}

/** Refused before anything else: what has started, or a course's session. */
export function refuseUnchangeable(row: Row, now: Date): void {
    if (row.status === "CANCELLED") {
        throw new ConflictException({
            message: "This booking was cancelled. Book a new time instead.",
            details: { reason: "cancelled" },
        });
    }
    if (row.startAt.getTime() <= now.getTime()) {
        throw new ConflictException({
            message: "This booking has already started.",
            details: { reason: "started" },
        });
    }
    if (row.courseEnrollmentId) {
        throw new ConflictException({
            message:
                "This is a session of a course. Its sessions change together, with the business.",
            details: { reason: "course" },
        });
    }
}

/** A new time a customer couldn't book on the booking page is refused. */
export function refuseOutsideWindow(
    startAt: Date,
    now: Date,
    rules: BookingRulesValue,
): void {
    if (startAt.getTime() <= now.getTime()) {
        throw new BadRequestException({
            message: "That time has passed. Pick a later one.",
            field: "startAt",
        });
    }
    const refusal = bookingWindowRefusal(startAt, now, rules);
    if (refusal) throw new BadRequestException(refusal);
}

/** What cancelling now does — see {@link AccountCancelTerms}. */
export async function cancelTerms(
    ctx: Ctx,
    row: Row,
    rules: BookingRulesValue,
    late: boolean,
): Promise<AccountCancelTerms> {
    const credit =
        row.paidWith === "MEMBERSHIP" ||
        (row.packRedemption !== null && row.packRedemption.reversedAt === null)
            ? late
                ? "kept"
                : "back"
            : null;
    let money: AccountCancelTerms["money"] = "none";
    if (row.orderId) {
        money = "order";
    } else {
        const paid = await bookingPaymentInTx(
            prisma,
            ctx.organizationId,
            row.id,
        );
        if (paid && paid.leftCents > 0) {
            money = late
                ? "kept-late"
                : rules.refundInTimeCancels
                  ? "refund"
                  : "kept-policy";
        }
    }
    return {
        late,
        freeUntil: row.freeCancelUntil?.toISOString() ?? null,
        money,
        credit,
    };
}

/**
 * Free starts over the next two weeks — with one person, when named — that
 * the customer could book now: a few a day, as the sheet lists them.
 */
export async function freeTimes(
    service: Service,
    rules: BookingRulesValue,
    now: Date,
    staffId?: string,
): Promise<string[]> {
    const windows = await prisma.availabilityRule.findMany({
        where: { serviceId: service.id },
    });
    const slots = await openSlots(
        service,
        windows,
        now,
        new Date(now.getTime() + TIMES_DAYS * DAY),
        staffId,
    );
    const perDay = new Map<string, number>();
    const out: string[] = [];
    for (const slot of [...slots].sort(
        (a, b) => a.startAt.getTime() - b.startAt.getTime(),
    )) {
        if (slot.startAt.getTime() <= now.getTime()) continue;
        if (!withinBookingWindow(slot.startAt, now, rules)) continue;
        // A one-to-one listed per person: only the named person's starts.
        if (staffId && slot.staffIds && !slot.staffIds.includes(staffId)) {
            continue;
        }
        const day = dayIn(slot.startAt, service.timezone);
        const n = perDay.get(day) ?? 0;
        if (n >= TIMES_PER_DAY) continue;
        perDay.set(day, n + 1);
        out.push(slot.startAt.toISOString());
        if (out.length >= TIMES_MAX) break;
    }
    return out;
}

export function first<T>(list: readonly T[]): T | undefined {
    return list.length > 0 ? list[0] : undefined;
}

function dayIn(at: Date, timeZone: string): string {
    try {
        return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
    } catch {
        return at.toISOString().slice(0, 10);
    }
}
