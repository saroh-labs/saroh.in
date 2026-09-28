import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Service } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { BookingRulesValue } from "../bookings/booking-rules";
import { loadBookingRules } from "../bookings/booking-rules";
import type { Ctx } from "./account-booking-rules";
import { businessName, first, ownBookingsWhere } from "./account-booking-rules";
import type { AccountTreatment } from "./account-bookings-view";
import { treatmentView } from "./account-bookings-view";
import { ownOrdersWhere } from "./account-orders.service";

/*
 * A treatment in the customer's account (round-2 plan A, A6; E9, E10): a
 * service of more than one visit, sold once as an order, shown as its
 * visits. The customer books the next visit themselves once none is
 * waiting, with whoever took the last one while they still take it.
 */

/** Treatments listed, newest first. */
const TREATMENT_ROWS = 10;

/** The customer's treatments, or one of them, newest first. */
export async function readTreatments(
    ctx: Ctx,
    now: Date,
    orderId?: string,
): Promise<AccountTreatment[]> {
    const booked = await prisma.booking.findMany({
        where: { ...ownBookingsWhere(ctx), orderId: { not: null } },
        select: { orderId: true },
        distinct: ["orderId"],
    });
    const ids = booked.flatMap((b) => (b.orderId ? [b.orderId] : []));
    const rows = await prisma.order.findMany({
        where: {
            organizationId: ctx.organizationId,
            status: { not: "CANCELLED" },
            items: { some: { serviceId: { not: null } } },
            ...(orderId ? { id: orderId } : {}),
            OR: [{ id: { in: ids } }, await ownOrdersWhere(ctx)],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: TREATMENT_ROWS,
        select: {
            id: true,
            total: true,
            currency: true,
            status: true,
            paymentStatus: true,
            items: {
                where: { serviceId: { not: null } },
                take: 1,
                select: {
                    service: { select: { name: true, visits: true } },
                },
            },
            bookings: {
                where: { visitNumber: { not: null } },
                orderBy: [{ visitNumber: "asc" }, { startAt: "asc" }],
                select: {
                    id: true,
                    visitNumber: true,
                    startAt: true,
                    timezone: true,
                    status: true,
                    outcome: true,
                    locationType: true,
                    staff: { select: { name: true } },
                },
            },
        },
    });
    return rows.flatMap((order) => {
        const service = order.items[0]?.service;
        // A treatment is a service of more than one visit (E9).
        if (!service || service.visits <= 1) return [];
        return [treatmentView({ ...order, service }, now)];
    });
}

/** A treatment whose next visit the customer may book now, and with whom. */
export interface BookableTreatment {
    orderId: string;
    visit: number;
    service: Service;
    rules: BookingRulesValue;
    /** Whoever took the last visit, while they still take it. */
    staffId: string | undefined;
    staffName: string | null;
}

/** The customer's treatment whose next visit they may book now. */
export async function bookableTreatment(
    ctx: Ctx,
    orderRef: string,
    now: Date,
): Promise<BookableTreatment> {
    const treatment = first(await readTreatments(ctx, now, orderRef));
    if (!treatment) throw new NotFoundException();
    if (treatment.bookNext === null) {
        throw new ConflictException({
            message: `Your next visit is planned with ${await businessName(ctx)} at the one before.`,
            details: { reason: "not-yet" },
        });
    }
    const order = await prisma.order.findFirstOrThrow({
        where: { id: treatment.ref, organizationId: ctx.organizationId },
        select: {
            items: {
                where: { serviceId: { not: null } },
                take: 1,
                select: { serviceId: true },
            },
            bookings: {
                where: { status: "CONFIRMED", staffId: { not: null } },
                orderBy: { startAt: "desc" },
                take: 1,
                select: {
                    staffId: true,
                    staff: { select: { name: true } },
                },
            },
        },
    });
    const service = await prisma.service.findFirst({
        where: {
            id: order.items[0]?.serviceId ?? "",
            organizationId: ctx.organizationId,
            deletedAt: null,
            status: "ACTIVE",
        },
    });
    if (!service) {
        throw new ConflictException({
            message: `This can't be booked online. Call ${await businessName(ctx)} to book it.`,
            details: { reason: "service-closed" },
        });
    }
    // With whoever took the last visit, while they still take it.
    const last = first(order.bookings);
    const takes = last?.staffId
        ? await prisma.staffService.findFirst({
              where: { serviceId: service.id, staffId: last.staffId },
              select: { staffId: true },
          })
        : null;
    const rules = await loadBookingRules(prisma, ctx.organizationId);
    return {
        orderId: treatment.ref,
        visit: treatment.bookNext,
        service,
        rules,
        staffId: takes ? (last?.staffId ?? undefined) : undefined,
        staffName: takes ? (last?.staff?.name ?? null) : null,
    };
}
