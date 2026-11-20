import type { Prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";
import type { Catalog } from "@saroh/pricing-catalog";
import { addMonthsUtc } from "@saroh/pricing-catalog";

import { COUPON_KINDS } from "./checkout-quote";
import type { AddonChargeLine } from "./offers";

type Tx = Prisma.TransactionClient;

/**
 * The launch offer on extras of a yearly plan at its yearly offer price
 * (DEC-231, owner 20 Nov 2026). The plan's year skips the automatic coupon,
 * but its extras (packs, seats) get the coupon's percent for what falls in
 * the subscription's first `months` months, counted from the day the yearly
 * plan started, never from the extra's own start. From then on every extra
 * is at its regular price, including ones added later.
 *
 * Not today's monthly behaviour: a coupon only ever comes off the plan's
 * own charge, never an add-on's, so nothing is reused here.
 */
export interface LaunchWindow {
    percentOff: number;
    start: Date;
    end: Date;
}

/**
 * An add-on line with the launch percent taken off the part of it that
 * falls inside the window: per unit, half up to the paisa. A line wholly
 * outside the window is returned as it was.
 */
export function withLaunchOff(
    line: AddonChargeLine,
    window: LaunchWindow | null,
): AddonChargeLine {
    if (!window) return line;
    const from = Math.max(line.periodStart.getTime(), window.start.getTime());
    const to = Math.min(line.periodEnd.getTime(), window.end.getTime());
    const span = line.periodEnd.getTime() - line.periodStart.getTime();
    if (to <= from || span <= 0) return line;
    const a =
        BigInt(line.unitPaise) * BigInt(to - from) * BigInt(window.percentOff);
    const b = BigInt(span) * 100n;
    const off = Number((2n * a + b) / (2n * b));
    if (off <= 0) return line;
    return {
        ...line,
        unitPaise: line.unitPaise - off,
        description: `${line.description}, launch offer`,
    };
}

/**
 * The window for a business's yearly subscription, or null when its extras
 * get no launch offer: not on a year at its plan's yearly offer, no
 * percent automatic coupon for the plan now, or a business that had paid
 * Saroh or had a launch offer before this year started (the rule the
 * coupon itself keeps, `hadPaidPlanOrLaunchOffer`). Extras taking the
 * offer don't take a place of the coupon's.
 */
export async function yearlyExtrasLaunch(
    tx: Pick<
        Tx,
        | "billingCheckout"
        | "pricingCoupon"
        | "pricingCouponRedemption"
        | "sarohInvoice"
    >,
    input: {
        organizationId: string;
        edition: Edition;
        planRowId: string;
        planId: string;
        cycle: string;
        catalog: Pick<Catalog, "plans">;
        now: Date;
    },
): Promise<LaunchWindow | null> {
    if (input.cycle !== "year") return null;
    const plan = input.catalog.plans.find((p) => p.id === input.planId);
    if (plan?.yearlyOfferPaise === undefined) return null;
    // The checkout that started this yearly plan (a renewal doesn't).
    const started = await tx.billingCheckout.findFirst({
        where: {
            organizationId: input.organizationId,
            planId: input.planRowId,
            cycle: "year",
            status: "COMPLETED",
            kind: { in: [...COUPON_KINDS] },
        },
        orderBy: { completedAt: "desc" },
        select: { createdAt: true, startAt: true, completedAt: true },
    });
    const start = started?.startAt ?? started?.completedAt;
    if (!started || !start) return null;
    const coupon = await tx.pricingCoupon.findFirst({
        where: {
            automatic: true,
            active: true,
            archivedAt: null,
            edition: input.edition,
            planIds: { has: input.planId },
            percentOff: { gt: 0 },
            OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
        },
        orderBy: { createdAt: "desc" },
        select: { percentOff: true, months: true },
    });
    if (!coupon?.percentOff) return null;
    const [paidBefore, launchBefore] = await Promise.all([
        tx.sarohInvoice.findFirst({
            where: {
                organizationId: input.organizationId,
                source: { not: "TOPUP" },
                createdAt: { lt: started.createdAt },
            },
            select: { id: true },
        }),
        tx.pricingCouponRedemption.findFirst({
            where: {
                organizationId: input.organizationId,
                coupon: { automatic: true },
            },
            select: { id: true },
        }),
    ]);
    if (paidBefore || launchBefore) return null;
    return {
        percentOff: coupon.percentOff,
        start,
        end: addMonthsUtc(start, coupon.months),
    };
}
