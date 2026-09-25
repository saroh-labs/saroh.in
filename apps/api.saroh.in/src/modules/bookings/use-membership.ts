import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

type Tx = Prisma.TransactionClient;

/** What a booking asks of a membership. */
export interface MembershipUse {
    organizationId: string;
    bookingId: string;
    contactId: string;
    subscriptionId: string;
    startAt: Date;
}

function refuse(message: string): never {
    throw new BadRequestException({ message, field: "subscriptionId" });
}

/**
 * Pay a booking with one of a membership's classes, on the caller's
 * transaction (U3). The membership must be the booker's own and active, and —
 * when its plan has a monthly allowance — have a class left in the calendar
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
            plan: { select: { name: true, classesPerMonth: true } },
        },
    });
    if (!sub) {
        throw new NotFoundException({
            message: "That membership was not found",
            field: "subscriptionId",
        });
    }
    if (sub.contactId !== input.contactId) {
        refuse("That membership belongs to someone else.");
    }
    if (sub.status !== "ACTIVE") {
        refuse(
            sub.status === "PAUSED"
                ? "That membership is paused."
                : "That membership has ended.",
        );
    }
    await tx.$queryRaw`SELECT id FROM "CustomerSubscription" WHERE id = ${sub.id} FOR UPDATE`;

    const allowance = sub.plan.classesPerMonth;
    if (allowance !== null) {
        const local = DateTime.fromJSDate(input.startAt, {
            zone: sub.timezone,
        });
        const monthStart = local.startOf("month").toUTC().toJSDate();
        const monthEnd = local.endOf("month").toUTC().toJSDate();
        const used = await tx.booking.count({
            where: {
                subscriptionId: sub.id,
                id: { not: input.bookingId },
                startAt: { gte: monthStart, lte: monthEnd },
                OR: [{ status: "CONFIRMED" }, { cancelledLate: true }],
            },
        });
        if (used >= allowance) {
            throw new ConflictException({
                message: `${sub.plan.name} includes ${allowance} ${allowance === 1 ? "class" : "classes"} a month, and this month's are used.`,
                field: "subscriptionId",
            });
        }
    }
}
