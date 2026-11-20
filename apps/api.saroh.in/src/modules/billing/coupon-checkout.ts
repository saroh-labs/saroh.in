import type { Logger } from "@nestjs/common";
import { ConflictException } from "@nestjs/common";
import type { PricingCoupon, Prisma } from "@saroh/database";
import { outsideOrgContext, prisma } from "@saroh/database";

import {
    AUTOMATIC_COUPON_HOLD_MS,
    couponPlacesTaken,
    couponUsedByPayer,
    lockCouponPlacesInTx,
} from "../pricing/coupons.service";
import { raiseBillingActionInTx } from "./billing-actions";

/**
 * A coupon a checkout couldn't keep (409 on the `coupon` field): the
 * provider refused its discount (`refused`; on Razorpay, its Offer), or
 * another business took its last place first (`used-up`). A typed code
 * says so to the business; the automatic coupon gives way to the full
 * price instead (`CheckoutService.changePlan`, review 18 Nov 2026, F1).
 */
export class CouponNotTaken extends ConflictException {
    constructor(
        readonly why: "refused" | "used-up",
        message: string,
        /** The provider's own words for a refusal, for the log. */
        readonly said?: string,
    ) {
        super({ message, details: { field: "coupon" } });
    }
}

/**
 * When a checkout with this coupon lapses: an automatic coupon's holds its
 * place an hour (`AUTOMATIC_COUPON_HOLD_MS`, F4), never longer than it
 * would otherwise live.
 */
export function couponCheckoutExpiresAt(
    expiresAt: Date,
    coupon: Pick<PricingCoupon, "automatic"> | null,
    now: Date,
): Date {
    if (!coupon?.automatic) return expiresAt;
    const held = new Date(now.getTime() + AUTOMATIC_COUPON_HOLD_MS);
    return held.getTime() < expiresAt.getTime() ? held : expiresAt;
}

/**
 * The checkout's place, taken under the coupon's lock on the transaction
 * that records it: re-counted there, so two businesses at once can't both
 * take the last one (F3). The count is read outside the business's
 * row-level security (every business's places), on its own connection,
 * while this transaction holds the lock.
 */
export async function takeCouponPlaceInTx(
    tx: Pick<Prisma.TransactionClient, "$executeRaw">,
    coupon: Pick<PricingCoupon, "id" | "code" | "maxRedemptions">,
    organizationId: string,
    now: Date,
): Promise<void> {
    await lockCouponPlacesInTx(tx, coupon.id);
    // Once per person, asked again under the payer's locks
    // (`holdPayerOffersInTx`, taken first): another of their businesses
    // may have taken it since the quote (N3).
    if (
        await outsideOrgContext(() =>
            couponUsedByPayer(coupon.id, organizationId, now),
        )
    ) {
        throw new CouponNotTaken(
            "used-up",
            `You've used coupon ${coupon.code} already.`,
        );
    }
    const taken = await couponPlacesTaken(coupon.id, organizationId, now);
    if (taken >= coupon.maxRedemptions) {
        throw new CouponNotTaken(
            "used-up",
            `Coupon ${coupon.code} has just been used up.`,
        );
    }
}

/**
 * Razorpay refused an automatic coupon's Offer (expired, used up, deleted,
 * or not for this plan at Razorpay) and the checkout went ahead at the full
 * price: a WARN naming the coupon for every such checkout, and one row in
 * Admin › Billing › Needs action per coupon and Offer, so the team fixes
 * the Offer or pauses the coupon. Never stops the checkout: a failure to
 * raise it is only logged.
 */
export async function couponOfferRefused(
    logger: Pick<Logger, "warn">,
    coupon: Pick<PricingCoupon, "id" | "code" | "razorpayOfferId">,
    organizationId: string,
    said?: string,
): Promise<void> {
    logger.warn(
        `billing_automatic_coupon_refused coupon=${coupon.code} offer=${coupon.razorpayOfferId ?? "none"} org=${organizationId}${said ? ` said=${JSON.stringify(said)}` : ""}`,
    );
    try {
        await outsideOrgContext(() =>
            raiseBillingActionInTx(prisma, {
                organizationId: null,
                code: "billing_coupon_offer_refused",
                refs: { coupon: coupon.code, offer: coupon.razorpayOfferId },
                note: `Razorpay refused the Offer of automatic coupon ${coupon.code}${said ? ` ("${said}")` : ""}, so businesses starting a plan pay the full price. Fix the Offer in Razorpay (its dates, usage limit and plans) or paste a new one's ID on the coupon, or pause the coupon in Plans › Offers.`,
                dedupeKey: `coupon-offer-refused:${coupon.id}:${coupon.razorpayOfferId ?? "none"}`,
            }),
        );
    } catch (error) {
        logger.warn(
            `billing_automatic_coupon_alert_failed coupon=${coupon.code}: ${error instanceof Error ? error.message : "unknown"}`,
        );
    }
}
