import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { CREDIT_GONE } from "../class-packs/redeem-pack";
import {
    ALLOWANCE_SELECT,
    classesAllowance,
} from "../subscriptions/classes-allowance";

type Tx = Prisma.TransactionClient;

/** What a booking asks of a membership. */
export interface MembershipUse {
    organizationId: string;
    bookingId: string;
    contactId: string;
    subscriptionId: string;
    startAt: Date;
    /**
     * Who is spending the class: the team (the default), or the customer on
     * the business's site (A10). For a customer, someone else's membership
     * is missing (404), one with no classes a month pays no class online —
     * a plan with no allowance is not a class plan — and every refusal says
     * `credit-gone` in their own words.
     */
    actor?: "team" | "customer";
}

function refuse(message: string, actor: MembershipUse["actor"]): never {
    if (actor === "customer") {
        throw new BadRequestException({
            message,
            details: { field: "subscriptionId", reason: CREDIT_GONE },
        });
    }
    throw new BadRequestException({ message, field: "subscriptionId" });
}

function missing(actor: MembershipUse["actor"]): never {
    throw new NotFoundException(
        actor === "customer"
            ? {
                  message: "That membership was not found",
                  details: { field: "subscriptionId", reason: CREDIT_GONE },
              }
            : {
                  message: "That membership was not found",
                  field: "subscriptionId",
              },
    );
}

/**
 * Pay a booking with one of a membership's classes, on the caller's
 * transaction (U3). The membership must be the booker's own and active, and —
 * when its period includes classes a month (D10: the subscription's own
 * allowance, taken from its plan at each renewal, so a plan's new number
 * reaches a member at their next renewal) — have a class left in the calendar
 * month of the session, counted in the membership's own timezone. A class
 * cancelled late stays used, so it counts too.
 *
 * The subscription row is locked before counting, so two bookings racing for
 * the month's last class queue on it and the second finds none left.
 */
export async function useMembershipInTx(
    tx: Tx,
    input: MembershipUse,
): Promise<void> {
    const customer = input.actor === "customer";
    const sub = await tx.customerSubscription.findFirst({
        where: {
            id: input.subscriptionId,
            organizationId: input.organizationId,
        },
        select: {
            id: true,
            contactId: true,
            status: true,
            timezone: true,
            ...ALLOWANCE_SELECT,
            plan: { select: { name: true, classesPerMonth: true } },
        },
    });
    if (!sub) missing(input.actor);
    if (sub.contactId !== input.contactId) {
        // A customer is never told whose it is, or that it exists.
        if (customer) missing(input.actor);
        refuse("That membership belongs to someone else.", input.actor);
    }
    if (sub.status !== "ACTIVE") {
        const paused = sub.status === "PAUSED";
        refuse(
            customer
                ? paused
                    ? "Your membership is paused."
                    : "Your membership has ended."
                : paused
                  ? "That membership is paused."
                  : "That membership has ended.",
            input.actor,
        );
    }
    await tx.$queryRaw`SELECT id FROM "CustomerSubscription" WHERE id = ${sub.id} FOR UPDATE`;

    const allowance = classesAllowance(sub);
    if (allowance === null && customer) {
        refuse(
            "Your membership doesn't include classes to book online.",
            input.actor,
        );
    }
    if (allowance !== null) {
        const used = await classesUsedInMonth(
            tx,
            sub,
            input.startAt,
            input.bookingId,
        );
        if (used >= allowance) {
            throw new ConflictException(
                customer
                    ? {
                          message:
                              "Your membership's classes for that month are used.",
                          details: {
                              field: "subscriptionId",
                              reason: CREDIT_GONE,
                          },
                      }
                    : {
                          message: `${sub.plan.name} includes ${allowance} ${allowance === 1 ? "class" : "classes"} a month, and this month's are used.`,
                          field: "subscriptionId",
                      },
            );
        }
    }
}

/**
 * The membership's classes used in the calendar month of `startAt`, in its
 * own timezone: confirmed bookings and classes cancelled late. The booking
 * being paid is left out. Shared with the credit read (A10), so the page
 * offers exactly what this would allow.
 */
export async function classesUsedInMonth(
    db: Pick<Prisma.TransactionClient, "booking">,
    sub: { id: string; timezone: string },
    startAt: Date,
    excludeBookingId?: string,
): Promise<number> {
    const local = DateTime.fromJSDate(startAt, { zone: sub.timezone });
    const monthStart = local.startOf("month").toUTC().toJSDate();
    const monthEnd = local.endOf("month").toUTC().toJSDate();
    return db.booking.count({
        where: {
            subscriptionId: sub.id,
            ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
            startAt: { gte: monthStart, lte: monthEnd },
            OR: [{ status: "CONFIRMED" }, { cancelledLate: true }],
        },
    });
}
