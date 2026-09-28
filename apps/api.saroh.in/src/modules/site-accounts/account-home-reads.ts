import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import {
    ALLOWANCE_SELECT,
    classesAllowance,
    HAS_ALLOWANCE_WHERE,
} from "../subscriptions/classes-allowance";
import type { CustomerContext } from "./customer-context.decorator";
import type {
    AccountBooking,
    AccountClasses,
    AccountOrder,
    AccountPlan,
} from "./customer-view";
import {
    bookingView,
    ORDER_ROW_ITEMS,
    orderView,
    packView,
    planView,
} from "./customer-view";

/**
 * Home's reads in the customer's account (round-2 plan A, A5), one per
 * block: each scoped to the signed-in customer's business and contact, each
 * leaving through `customer-view.ts`. `AccountHomeService.home` runs them
 * one by one, so one that fails fails alone.
 */

type Ctx = Pick<CustomerContext, "organizationId" | "contactId">;

/** How many orders Home lists. */
export const HOME_ORDERS = 2;

/** The next confirmed booking from now on, or null. */
export async function readNextBooking(
    ctx: Ctx,
    now: Date,
): Promise<AccountBooking | null> {
    const row = await prisma.booking.findFirst({
        where: {
            organizationId: ctx.organizationId,
            contactId: ctx.contactId,
            status: "CONFIRMED",
            startAt: { gte: now },
        },
        orderBy: { startAt: "asc" },
        select: {
            id: true,
            startAt: true,
            endAt: true,
            timezone: true,
            locationType: true,
            service: { select: { name: true } },
            staff: { select: { name: true } },
        },
    });
    return row ? bookingView(row) : null;
}

/**
 * Classes left: this month's membership allowance (D10) and every live
 * pack with classes in it. Null when there is neither.
 */
export async function readClasses(
    ctx: Ctx,
    now: Date,
): Promise<AccountClasses | null> {
    const { organizationId, contactId } = ctx;
    const [sub, packs] = await Promise.all([
        prisma.customerSubscription.findFirst({
            where: {
                organizationId,
                contactId,
                status: { not: "CANCELLED" },
                ...HAS_ALLOWANCE_WHERE,
            },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                status: true,
                timezone: true,
                ...ALLOWANCE_SELECT,
                plan: { select: { name: true, classesPerMonth: true } },
            },
        }),
        prisma.packPurchase.findMany({
            where: { organizationId, contactId, expiresAt: { gt: now } },
            orderBy: { expiresAt: "asc" },
            select: {
                credits: true,
                expiresAt: true,
                pack: { select: { name: true } },
                _count: {
                    select: {
                        redemptions: { where: { reversedAt: null } },
                    },
                },
            },
        }),
    ]);

    let membership: AccountClasses["membership"] = null;
    const perMonth = sub ? classesAllowance(sub) : null;
    if (sub && perMonth !== null) {
        const month = DateTime.fromJSDate(now)
            .setZone(sub.timezone)
            .startOf("month");
        const next = month.plus({ months: 1 });
        const used = await prisma.booking.count({
            where: {
                organizationId,
                subscriptionId: sub.id,
                startAt: {
                    gte: month.toUTC().toJSDate(),
                    lt: next.toUTC().toJSDate(),
                },
                OR: [{ status: "CONFIRMED" }, { cancelledLate: true }],
            },
        });
        const paused = sub.status === "PAUSED";
        membership = {
            plan: sub.plan.name,
            perMonth,
            left: paused ? 0 : Math.max(0, perMonth - used),
            resetsAt: next.toUTC().toJSDate().toISOString(),
            paused,
        };
    }
    const livePacks = packs
        .map((p) =>
            packView({
                credits: p.credits,
                used: p._count.redemptions,
                expiresAt: p.expiresAt,
                pack: p.pack,
            }),
        )
        .filter((p) => p.left > 0);
    if (!membership && livePacks.length === 0) return null;
    return { membership, packs: livePacks };
}

/**
 * The customer's latest orders: those of every store customer linked to
 * their contact (C2's identity links, confirmed by staff or made while
 * signed in).
 */
export async function readLatestOrders(
    ctx: Ctx,
    take: number = HOME_ORDERS,
): Promise<AccountOrder[]> {
    const links = await prisma.customerIdentityLink.findMany({
        where: {
            organizationId: ctx.organizationId,
            contactId: ctx.contactId,
        },
        select: { customerId: true },
    });
    if (links.length === 0) return [];
    const rows = await prisma.order.findMany({
        where: {
            organizationId: ctx.organizationId,
            customerId: { in: links.map((l) => l.customerId) },
        },
        orderBy: { createdAt: "desc" },
        take,
        select: {
            id: true,
            orderId: true,
            createdAt: true,
            total: true,
            currency: true,
            status: true,
            paymentStatus: true,
            stage: true,
            _count: { select: { items: true } },
            items: {
                take: ORDER_ROW_ITEMS,
                orderBy: { id: "asc" },
                select: {
                    quantity: true,
                    product: { select: { name: true } },
                },
            },
        },
    });
    return rows.map(orderView);
}

/** The customer's live membership, or null. */
export async function readPlan(ctx: Ctx): Promise<AccountPlan | null> {
    const row = await prisma.customerSubscription.findFirst({
        where: {
            organizationId: ctx.organizationId,
            contactId: ctx.contactId,
            status: { in: ["ACTIVE", "PAUSED"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            status: true,
            price: true,
            currency: true,
            interval: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            pausedUntil: true,
            plan: { select: { name: true } },
        },
    });
    return row ? planView(row) : null;
}
