import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { PricingCoupon, Prisma } from "@saroh/database";
import {
    liveCatalogueVersion,
    outsideOrgContext,
    prisma,
} from "@saroh/database";
import { validateCatalog } from "@saroh/pricing-catalog";

import {
    AdminAuditOutcome,
    AdminAuditService,
} from "../admin/admin-audit.service";
import { AdminPermission } from "../admin/admin-permissions";

type Tx = Prisma.TransactionClient;

/** One coupon as the Offers tab shows it. */
export interface AdminCoupon {
    id: string;
    code: string;
    discountPaise: number;
    months: number;
    planIds: string[];
    active: boolean;
    maxRedemptions: number;
    expiresAt: string | null;
    /** Businesses that have used it (one use each). */
    uses: number;
    createdAt: string;
    updatedAt: string;
}

export interface CouponFields {
    discountPaise: number;
    months: number;
    planIds: string[];
    maxRedemptions: number;
    expiresAt: Date | null;
}

type CouponRow = Prisma.PricingCouponGetPayload<{
    include: { _count: { select: { redemptions: true } } };
}>;

function view(row: CouponRow): AdminCoupon {
    return {
        id: row.id,
        code: row.code,
        discountPaise: row.discountPaise,
        months: row.months,
        planIds: row.planIds,
        active: row.active,
        maxRedemptions: row.maxRedemptions,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        uses: row._count.redemptions,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

const withUses = { _count: { select: { redemptions: true } } } as const;

/**
 * Coupons (plans catalogue U4, KTD-5): global, outside versions, applied
 * the moment they are saved. Codes are upper-cased (the column's CHECK) and
 * unique for good, archived ones included, so a code once handed out never
 * means a different discount. A coupon someone has redeemed is archived on
 * delete, never removed: its redemptions are history (a RESTRICT key).
 *
 * The discount is checked against the live catalogue on save: every plan it
 * names must be a paid plan there, and the monthly discount can't be more
 * than the cheapest of them costs a month. Redeeming (one use per business,
 * within `maxRedemptions`, before `expiresAt`) is U16's checkout: it asks
 * {@link findUsableCoupon} and the billing webhook writes the redemption
 * when the first discounted charge is paid.
 */
@Injectable()
export class CouponsService {
    constructor(private readonly audit: AdminAuditService) {}

    /** Every coupon that isn't archived, newest first. */
    async list(): Promise<AdminCoupon[]> {
        const rows = await prisma.pricingCoupon.findMany({
            where: { archivedAt: null },
            orderBy: { createdAt: "desc" },
            include: withUses,
        });
        return rows.map(view);
    }

    async create(
        actorUserId: string,
        input: CouponFields & {
            code: string;
            active: boolean;
            reason: string;
            idempotencyKey: string;
        },
        now: Date,
    ): Promise<AdminCoupon> {
        const code = input.code.trim().toUpperCase();
        await this.checkFields(input, now);
        return prisma.$transaction(async (tx) => {
            // Insert-or-nothing: a caught unique violation would abort the
            // transaction, so a taken code is read from the count.
            const made = await tx.pricingCoupon.createMany({
                data: [
                    {
                        code,
                        discountPaise: input.discountPaise,
                        months: input.months,
                        planIds: input.planIds,
                        maxRedemptions: input.maxRedemptions,
                        expiresAt: input.expiresAt,
                        active: input.active,
                        createdByUserId: actorUserId,
                    },
                ],
                skipDuplicates: true,
            });
            if (made.count === 0) {
                throw new ConflictException({
                    message: `There's already a coupon ${code}. Codes can't be used twice, even after one is deleted.`,
                    details: { field: "code" },
                });
            }
            const row = await tx.pricingCoupon.findUniqueOrThrow({
                where: { code },
                include: withUses,
            });
            await this.write(
                tx,
                actorUserId,
                "pricing.coupon.create",
                row.id,
                input,
                {
                    code,
                    discountPaise: row.discountPaise,
                    months: row.months,
                    planIds: row.planIds,
                    maxRedemptions: row.maxRedemptions,
                    expiresAt: row.expiresAt?.toISOString() ?? null,
                    active: row.active,
                },
            );
            return view(row);
        });
    }

    async update(
        actorUserId: string,
        id: string,
        input: Partial<CouponFields> & {
            active?: boolean;
            reason: string;
            idempotencyKey: string;
        },
        now: Date,
    ): Promise<AdminCoupon> {
        return prisma.$transaction(async (tx) => {
            const row = await this.lock(tx, id);
            const next: CouponFields = {
                discountPaise: input.discountPaise ?? row.discountPaise,
                months: input.months ?? row.months,
                planIds: input.planIds ?? row.planIds,
                maxRedemptions: input.maxRedemptions ?? row.maxRedemptions,
                expiresAt:
                    input.expiresAt === undefined
                        ? row.expiresAt
                        : input.expiresAt,
            };
            await this.checkFields(next, now, {
                // An expiry already passed may stay as it is (pausing an
                // expired coupon, say); only a new one must be ahead.
                expiryChanged: input.expiresAt !== undefined,
            });
            if (next.maxRedemptions < row._count.redemptions) {
                throw new BadRequestException({
                    message: `${row._count.redemptions} businesses have used this coupon already, so it can't allow fewer uses than that.`,
                    details: { field: "maxRedemptions" },
                });
            }
            const saved = await tx.pricingCoupon.update({
                where: { id },
                data: {
                    ...next,
                    ...(input.active === undefined
                        ? {}
                        : { active: input.active }),
                },
                include: withUses,
            });
            const changed: Record<string, unknown> = {};
            for (const key of [
                "discountPaise",
                "months",
                "planIds",
                "maxRedemptions",
                "expiresAt",
                "active",
            ] as const) {
                if (input[key] !== undefined) {
                    const v = saved[key];
                    changed[key] = v instanceof Date ? v.toISOString() : v;
                }
            }
            await this.write(
                tx,
                actorUserId,
                "pricing.coupon.update",
                id,
                input,
                {
                    code: saved.code,
                    ...changed,
                },
            );
            return view(saved);
        });
    }

    /**
     * Delete a coupon nobody has used; archive one somebody has, or one a
     * checkout was quoted with (its row keeps the coupon, RESTRICT).
     */
    async remove(
        actorUserId: string,
        id: string,
        input: { reason: string; idempotencyKey: string },
        now: Date,
    ): Promise<{ id: string; code: string; outcome: "deleted" | "archived" }> {
        return prisma.$transaction(async (tx) => {
            const row = await this.lock(tx, id);
            const used =
                row._count.redemptions > 0 ||
                (await tx.billingCheckout.count({ where: { couponId: id } })) >
                    0;
            if (used) {
                await tx.pricingCoupon.update({
                    where: { id },
                    data: { archivedAt: now, active: false },
                });
            } else {
                await tx.pricingCoupon.delete({ where: { id } });
            }
            await this.write(
                tx,
                actorUserId,
                used ? "pricing.coupon.archive" : "pricing.coupon.delete",
                id,
                input,
                { code: row.code, uses: row._count.redemptions },
            );
            return {
                id,
                code: row.code,
                outcome: used ? ("archived" as const) : ("deleted" as const),
            };
        });
    }

    /** The coupon, locked for this transaction; an archived one is gone. */
    private async lock(tx: Tx, id: string): Promise<CouponRow> {
        await tx.$queryRaw`SELECT "id" FROM "PricingCoupon" WHERE "id" = ${id} FOR UPDATE`;
        const row = await tx.pricingCoupon.findUnique({
            where: { id },
            include: withUses,
        });
        if (!row || row.archivedAt) {
            throw new NotFoundException("There's no such coupon.");
        }
        return row;
    }

    /** The plans and discount make sense against the live catalogue. */
    private async checkFields(
        f: CouponFields,
        now: Date,
        opts: { expiryChanged: boolean } = { expiryChanged: true },
    ): Promise<void> {
        if (
            opts.expiryChanged &&
            f.expiresAt &&
            f.expiresAt.getTime() <= now.getTime()
        ) {
            throw new BadRequestException({
                message: "Pick an expiry date that hasn't passed.",
                details: { field: "expiresAt" },
            });
        }
        const live = await liveCatalogueVersion(prisma, now);
        const check = live ? validateCatalog(live.catalog) : null;
        if (!check?.ok) {
            throw new ConflictException(
                "There's no published pricing for a coupon to apply to.",
            );
        }
        const plans = new Map(check.catalog.plans.map((p) => [p.id, p]));
        const ids = [...new Set(f.planIds)];
        for (const planId of ids) {
            const plan = plans.get(planId);
            if (!plan) {
                throw new BadRequestException({
                    message: `There's no plan "${planId}" in the live pricing.`,
                    details: { field: "planIds" },
                });
            }
            if (plan.pricePaise === 0) {
                throw new BadRequestException({
                    message: `${plan.name} is free, so a coupon can't take anything off it.`,
                    details: { field: "planIds" },
                });
            }
            if (f.discountPaise > plan.pricePaise) {
                throw new BadRequestException({
                    message: `The discount is more than ${plan.name} costs a month.`,
                    details: { field: "discountPaise" },
                });
            }
        }
        f.planIds = ids;
    }

    private async write(
        tx: Tx,
        actorUserId: string,
        action: string,
        couponId: string,
        input: { reason: string; idempotencyKey: string },
        metadata: Record<string, unknown>,
    ): Promise<void> {
        await this.audit.write(tx, {
            actorUserId,
            permission: AdminPermission.CouponsManage,
            action,
            targetType: "pricing_coupon",
            targetId: couponId,
            reason: input.reason,
            outcome: AdminAuditOutcome.Success,
            idempotencyKey: [actorUserId, action, input.idempotencyKey].join(
                ":",
            ),
            metadata,
        });
    }
}

/**
 * A coupon a business may use on a plan now (U16), or a 400 saying why not:
 * no such code (or archived), paused, expired, not for this plan, used by
 * this business already, or used up. "Used up" counts the redemptions and
 * the other businesses' checkouts waiting with it, so a coupon can't be
 * promised past `maxRedemptions` while checkouts are open. Read against the
 * live catalogue's plan id, as the coupon's own checks on save are.
 *
 * Those two counts are across businesses, so they are read outside the
 * request's organization (`outsideOrgContext`): under row-level security a
 * business sees only its own redemptions and checkouts.
 */
export async function findUsableCoupon(input: {
    code: string;
    organizationId: string;
    /** The catalogue plan id (`grow`), not the `Plan` row. */
    planId: string;
    planName: string;
    now: Date;
}): Promise<PricingCoupon> {
    const code = input.code.trim().toUpperCase();
    const refuse = (message: string): never => {
        throw new BadRequestException({
            message,
            details: { field: "coupon" },
        });
    };
    const coupon = code
        ? await prisma.pricingCoupon.findUnique({ where: { code } })
        : null;
    if (!coupon || coupon.archivedAt) {
        return refuse(`There's no coupon ${code || "with that code"}.`);
    }
    if (!coupon.active) return refuse(`Coupon ${code} isn't available now.`);
    if (coupon.expiresAt && coupon.expiresAt.getTime() <= input.now.getTime()) {
        return refuse(`Coupon ${code} has expired.`);
    }
    if (!coupon.planIds.includes(input.planId)) {
        return refuse(`Coupon ${code} doesn't apply to ${input.planName}.`);
    }
    const mine = await prisma.pricingCouponRedemption.findUnique({
        where: {
            couponId_organizationId: {
                couponId: coupon.id,
                organizationId: input.organizationId,
            },
        },
        select: { id: true },
    });
    if (mine) return refuse(`You've used coupon ${code} already.`);
    const [used, waiting] = await outsideOrgContext(() =>
        Promise.all([
            prisma.pricingCouponRedemption.count({
                where: { couponId: coupon.id },
            }),
            prisma.billingCheckout.count({
                where: {
                    couponId: coupon.id,
                    status: "OPEN",
                    organizationId: { not: input.organizationId },
                },
            }),
        ]),
    );
    if (used + waiting >= coupon.maxRedemptions) {
        return refuse(`Coupon ${code} has been used up.`);
    }
    return coupon;
}
