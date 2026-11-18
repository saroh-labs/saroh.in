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
import type { Edition } from "@saroh/edition";
import { editionProfile } from "@saroh/edition";
import { validateCatalog } from "@saroh/pricing-catalog";

import {
    AdminAuditOutcome,
    AdminAuditService,
} from "../admin/admin-audit.service";
import { AdminPermission } from "../admin/admin-permissions";
import { autopayTakes } from "../billing/autopay-currency";
import { RAZORPAY_OFFER_ID } from "./dto";
import type { PublicOffer } from "./public-catalog";

type Tx = Prisma.TransactionClient;

/** One coupon as the Offers tab shows it. */
export interface AdminCoupon {
    id: string;
    code: string;
    /** Off each month before tax; 0 on a percent coupon. */
    discountPaise: number;
    /** A whole percent off the plan's monthly price; null: an amount. */
    percentOff: number | null;
    months: number;
    planIds: string[];
    /**
     * The Razorpay Offer that takes the same discount off on Razorpay's
     * side, made in the Razorpay Dashboard; null: the coupon can't be used
     * with a Razorpay checkout.
     */
    razorpayOfferId: string | null;
    active: boolean;
    /** Taken off at checkout with no code typed (one per plan). */
    automatic: boolean;
    maxRedemptions: number;
    expiresAt: string | null;
    /** Businesses that have used it (one use each). */
    uses: number;
    createdAt: string;
    updatedAt: string;
}

export interface CouponFields {
    discountPaise: number;
    percentOff: number | null;
    months: number;
    planIds: string[];
    maxRedemptions: number;
    expiresAt: Date | null;
    razorpayOfferId: string | null;
}

type CouponRow = Prisma.PricingCouponGetPayload<{
    include: { _count: { select: { redemptions: true } } };
}>;

function view(row: CouponRow): AdminCoupon {
    return {
        id: row.id,
        code: row.code,
        discountPaise: row.discountPaise,
        percentOff: row.percentOff,
        months: row.months,
        planIds: row.planIds,
        razorpayOfferId: row.razorpayOfferId,
        active: row.active,
        automatic: row.automatic,
        maxRedemptions: row.maxRedemptions,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        uses: row._count.redemptions,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

const withUses = { _count: { select: { redemptions: true } } } as const;

/**
 * The first plan of `planIds` another active automatic coupon already
 * covers, with that coupon's code; null: none clashes. One automatic
 * coupon per edition and plan, so checkout never has to choose.
 */
export function automaticClash(
    others: { code: string; planIds: string[] }[],
    planIds: string[],
): { code: string; planId: string } | null {
    for (const planId of planIds) {
        const other = others.find((o) => o.planIds.includes(planId));
        if (other) return { code: other.code, planId };
    }
    return null;
}

/** The most a percent coupon may take off (the column's CHECK). */
export const PERCENT_OFF_MAX = 90;

/**
 * Why a coupon's discount can't be saved, or null: an amount off (paise,
 * no percent) or a whole percent off (1 to `PERCENT_OFF_MAX`, amount 0),
 * never both or neither.
 */
export function discountProblem(f: {
    discountPaise: number;
    percentOff: number | null;
}): { field: "discountPaise" | "percentOff"; message: string } | null {
    if (f.percentOff === null) {
        return Number.isInteger(f.discountPaise) && f.discountPaise > 0
            ? null
            : {
                  field: "discountPaise",
                  message: "Enter an amount off each month.",
              };
    }
    if (
        !Number.isInteger(f.percentOff) ||
        f.percentOff < 1 ||
        f.percentOff > PERCENT_OFF_MAX
    ) {
        return {
            field: "percentOff",
            message: `A percent off is a whole number from 1 to ${PERCENT_OFF_MAX}.`,
        };
    }
    return f.discountPaise === 0
        ? null
        : {
              field: "discountPaise",
              message: "A coupon takes an amount or a percent off, not both.",
          };
}

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
    async list(edition: Edition): Promise<AdminCoupon[]> {
        const rows = await prisma.pricingCoupon.findMany({
            where: { edition, archivedAt: null },
            orderBy: { createdAt: "desc" },
            include: withUses,
        });
        return rows.map(view);
    }

    async create(
        edition: Edition,
        actorUserId: string,
        input: CouponFields & {
            code: string;
            active: boolean;
            automatic?: boolean;
            reason: string;
            idempotencyKey: string;
        },
        now: Date,
    ): Promise<AdminCoupon> {
        const code = input.code.trim().toUpperCase();
        const automatic = input.automatic ?? false;
        await this.checkFields(edition, input, now);
        checkAutomaticOffer(edition, automatic, input.razorpayOfferId);
        return prisma.$transaction(async (tx) => {
            if (automatic && input.active) {
                await this.checkOneAutomatic(tx, edition, input.planIds, null);
            }
            // Insert-or-nothing: a caught unique violation would abort the
            // transaction, so a taken code is read from the count.
            const made = await tx.pricingCoupon.createMany({
                data: [
                    {
                        code,
                        edition,
                        discountPaise: input.discountPaise,
                        percentOff: input.percentOff,
                        months: input.months,
                        planIds: input.planIds,
                        maxRedemptions: input.maxRedemptions,
                        expiresAt: input.expiresAt,
                        razorpayOfferId: input.razorpayOfferId,
                        active: input.active,
                        automatic,
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
                    percentOff: row.percentOff,
                    months: row.months,
                    planIds: row.planIds,
                    maxRedemptions: row.maxRedemptions,
                    expiresAt: row.expiresAt?.toISOString() ?? null,
                    razorpayOfferId: row.razorpayOfferId,
                    active: row.active,
                    automatic: row.automatic,
                },
            );
            return view(row);
        });
    }

    async update(
        edition: Edition,
        actorUserId: string,
        id: string,
        input: Partial<CouponFields> & {
            active?: boolean;
            automatic?: boolean;
            reason: string;
            idempotencyKey: string;
        },
        now: Date,
    ): Promise<AdminCoupon> {
        return prisma.$transaction(async (tx) => {
            const row = await this.lock(tx, edition, id);
            const next: CouponFields = {
                discountPaise: input.discountPaise ?? row.discountPaise,
                percentOff:
                    input.percentOff === undefined
                        ? row.percentOff
                        : input.percentOff,
                months: input.months ?? row.months,
                planIds: input.planIds ?? row.planIds,
                maxRedemptions: input.maxRedemptions ?? row.maxRedemptions,
                expiresAt:
                    input.expiresAt === undefined
                        ? row.expiresAt
                        : input.expiresAt,
                razorpayOfferId:
                    input.razorpayOfferId === undefined
                        ? row.razorpayOfferId
                        : input.razorpayOfferId,
            };
            await this.checkFields(edition, next, now, {
                // An expiry already passed may stay as it is (pausing an
                // expired coupon, say); only a new one must be ahead.
                expiryChanged: input.expiresAt !== undefined,
            });
            const automatic = input.automatic ?? row.automatic;
            checkAutomaticOffer(edition, automatic, next.razorpayOfferId);
            if (automatic && (input.active ?? row.active)) {
                await this.checkOneAutomatic(tx, edition, next.planIds, id);
            }
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
                    ...(input.automatic === undefined
                        ? {}
                        : { automatic: input.automatic }),
                },
                include: withUses,
            });
            const changed: Record<string, unknown> = {};
            for (const key of [
                "discountPaise",
                "percentOff",
                "months",
                "planIds",
                "maxRedemptions",
                "expiresAt",
                "razorpayOfferId",
                "active",
                "automatic",
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
        edition: Edition,
        actorUserId: string,
        id: string,
        input: { reason: string; idempotencyKey: string },
        now: Date,
    ): Promise<{ id: string; code: string; outcome: "deleted" | "archived" }> {
        return prisma.$transaction(async (tx) => {
            const row = await this.lock(tx, edition, id);
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
    private async lock(
        tx: Tx,
        edition: Edition,
        id: string,
    ): Promise<CouponRow> {
        await tx.$queryRaw`SELECT "id" FROM "PricingCoupon" WHERE "id" = ${id} FOR UPDATE`;
        const row = await tx.pricingCoupon.findUnique({
            where: { id },
            include: withUses,
        });
        // Another edition's coupon is no coupon in this console.
        if (!row || row.archivedAt || row.edition !== edition) {
            throw new NotFoundException("There's no such coupon.");
        }
        return row;
    }

    /**
     * Refuses a second active automatic coupon on a plan of this edition.
     * Saves are serialised on an advisory lock per edition, so two at once
     * can't both pass.
     */
    private async checkOneAutomatic(
        tx: Tx,
        edition: Edition,
        planIds: string[],
        exceptId: string | null,
    ): Promise<void> {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pricing_coupon_automatic:${edition}`}))`;
        const others = await tx.pricingCoupon.findMany({
            where: {
                edition,
                automatic: true,
                active: true,
                archivedAt: null,
                planIds: { hasSome: planIds },
                ...(exceptId ? { id: { not: exceptId } } : {}),
            },
            select: { code: true, planIds: true },
        });
        const clash = automaticClash(others, planIds);
        if (clash) {
            throw new ConflictException({
                message: `Coupon ${clash.code} already applies automatically to the "${clash.planId}" plan. Pause it or turn its "Applies automatically" off first.`,
                details: { field: "automatic" },
            });
        }
    }

    /** The plans and discount make sense against the live catalogue. */
    private async checkFields(
        edition: Edition,
        f: CouponFields,
        now: Date,
        opts: { expiryChanged: boolean } = { expiryChanged: true },
    ): Promise<void> {
        if (
            f.razorpayOfferId !== null &&
            !RAZORPAY_OFFER_ID.test(f.razorpayOfferId)
        ) {
            throw new BadRequestException({
                message:
                    "A Razorpay offer ID is offer_ and 14 letters or digits, like offer_ABCDEFGHIJKLMN.",
                details: { field: "razorpayOfferId" },
            });
        }
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
        const live = await liveCatalogueVersion(prisma, edition, now);
        const check = live ? validateCatalog(live.catalog) : null;
        if (!check?.ok) {
            throw new ConflictException(
                "There's no published pricing for a coupon to apply to.",
            );
        }
        const problem = discountProblem(f);
        if (problem) {
            throw new BadRequestException({
                message: problem.message,
                details: { field: problem.field },
            });
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
            if (f.percentOff === null && f.discountPaise > plan.pricePaise) {
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
 * An automatic coupon on autopay (India's rupee plans) goes through
 * Razorpay, which refuses a discount without its Offer: required up front,
 * so the coupon never silently falls back to full price for want of one.
 */
function checkAutomaticOffer(
    edition: Edition,
    automatic: boolean,
    razorpayOfferId: string | null,
): void {
    const autopay = autopayTakes(
        editionProfile(edition).sarohPlanMoney.currency,
    );
    if (automatic && autopay && !razorpayOfferId) {
        throw new BadRequestException({
            message:
                "A coupon that applies automatically needs its Razorpay offer ID: without it Razorpay refuses the discount.",
            details: { field: "razorpayOfferId" },
        });
    }
}

interface CouponAsk {
    organizationId: string;
    /** The business's edition: a coupon redeems only in its own (stage 9). */
    edition: Edition;
    /** The catalogue plan id (`grow`), not the `Plan` row. */
    planId: string;
    planName: string;
    now: Date;
}

/**
 * Why `coupon` can't be used by this business on this plan now, or null
 * when it can: archived or another edition's, paused, expired, not for
 * this plan, used by this business already, or used up. "Used up" counts
 * the redemptions and the other businesses' checkouts waiting with it, so
 * a coupon can't be promised past `maxRedemptions` while checkouts are
 * open. Read against the live catalogue's plan id, as the coupon's own
 * checks on save are. One check for a typed code and an automatic coupon.
 *
 * Those two counts are across businesses, so they are read outside the
 * request's organization (`outsideOrgContext`): under row-level security a
 * business sees only its own redemptions and checkouts.
 */
async function couponProblem(
    coupon: PricingCoupon,
    input: CouponAsk,
): Promise<string | null> {
    const { code } = coupon;
    if (coupon.archivedAt || coupon.edition !== input.edition) {
        return `There's no coupon ${code}.`;
    }
    if (!coupon.active) return `Coupon ${code} isn't available now.`;
    if (coupon.expiresAt && coupon.expiresAt.getTime() <= input.now.getTime()) {
        return `Coupon ${code} has expired.`;
    }
    if (!coupon.planIds.includes(input.planId)) {
        return `Coupon ${code} doesn't apply to ${input.planName}.`;
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
    if (mine) return `You've used coupon ${code} already.`;
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
        return `Coupon ${code} has been used up.`;
    }
    return null;
}

/**
 * A coupon a business may use on a plan now (U16), or a 400 saying why not
 * (`couponProblem`), "no such code" included.
 */
export async function findUsableCoupon(
    input: CouponAsk & { code: string },
): Promise<PricingCoupon> {
    const code = input.code.trim().toUpperCase();
    const coupon = code
        ? await prisma.pricingCoupon.findUnique({ where: { code } })
        : null;
    const refuse = (message: string): never => {
        throw new BadRequestException({
            message,
            details: { field: "coupon" },
        });
    };
    if (!coupon)
        return refuse(`There's no coupon ${code || "with that code"}.`);
    const problem = await couponProblem(coupon, input);
    return problem ? refuse(problem) : coupon;
}

/**
 * The plan's automatic coupon (owner, 18 Nov 2026) when this business may
 * use it now, else null: never an error, the business just pays the full
 * price. One per edition and plan (`CouponsService`).
 */
export async function findAutomaticCoupon(
    input: CouponAsk,
): Promise<PricingCoupon | null> {
    const coupon = await prisma.pricingCoupon.findFirst({
        where: {
            automatic: true,
            active: true,
            archivedAt: null,
            edition: input.edition,
            planIds: { has: input.planId },
        },
        orderBy: { createdAt: "desc" },
    });
    if (!coupon) return null;
    return (await couponProblem(coupon, input)) ? null : coupon;
}

/**
 * Each plan's automatic coupon a new business could still get now, for
 * the pricing page: active, not archived or expired, not used up. Only
 * what it takes off and for how long, never the code.
 */
export async function automaticOffers(
    edition: Edition,
    now: Date,
): Promise<PublicOffer[]> {
    // The uses are every business's: read outside any one's (RLS).
    const rows = await outsideOrgContext(() =>
        prisma.pricingCoupon.findMany({
            where: {
                edition,
                automatic: true,
                active: true,
                archivedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            orderBy: { createdAt: "desc" },
            include: withUses,
        }),
    );
    const seen = new Set<string>();
    const offers: PublicOffer[] = [];
    for (const row of rows) {
        if (row._count.redemptions >= row.maxRedemptions) continue;
        for (const planId of row.planIds) {
            if (seen.has(planId)) continue;
            seen.add(planId);
            offers.push({
                planId,
                discountPaise: row.discountPaise,
                months: row.months,
                ...(row.percentOff ? { percentOff: row.percentOff } : {}),
            });
        }
    }
    return offers;
}
