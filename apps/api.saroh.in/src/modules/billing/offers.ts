import { ConflictException, Logger } from "@nestjs/common";
import type { BillingCheckout, Prisma } from "@saroh/database";
import { outsideOrgContext, prisma } from "@saroh/database";
import type { Addon, BillingCycle, Catalog } from "@saroh/pricing-catalog";
import {
    addonMaxQuantity,
    addonOfferedOn,
    cellOf,
    MAX_ADDON_QUANTITY,
    trialFirstPaise,
    validateCatalog,
} from "@saroh/pricing-catalog";

import { lockCouponPlacesInTx } from "../pricing/coupons.service";
import { prorateDifferencePaise } from "./checkout-quote";
import { offerHeld, samePayer } from "./same-payer";
import { holdXactLock } from "./xact-lock";

type Tx = Prisma.TransactionClient;

const logger = new Logger("Offers");
type Db = Pick<Tx, "pricingCatalogVersion">;

/**
 * The offers' shared rules (pricing catalogue U16): which catalogue a
 * subscription's add-ons and trial come from, who may still have a trial,
 * what an add-on costs for a period, and the coupon's redemption. Pure where
 * it can be; the database reads take the caller's client.
 */

/** How many days before a trial ends its email goes. */
export const TRIAL_ENDING_NOTICE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The most of one add-on a business can hold; an add-on may set less. */
export { MAX_ADDON_QUANTITY };

const parsed = new Map<string, Catalog>();

/** One published version's catalogue, parsed once; null if missing or bad. */
export async function catalogueOfVersion(
    db: Db,
    version: number,
): Promise<Catalog | null> {
    const row = await db.pricingCatalogVersion.findUnique({
        where: { version },
        select: { id: true, catalog: true },
    });
    if (!row) return null;
    const hit = parsed.get(row.id);
    if (hit) return hit;
    const r = validateCatalog(row.catalog);
    if (!r.ok) return null;
    parsed.set(row.id, r.catalog);
    return r.catalog;
}

/**
 * A person may have one free trial (DEC-227, M-2): never again once a trial
 * checkout was completed by this business, or completed, scheduled or still
 * open for any that shares its payer (`same-payer.ts`: an owner, a billing
 * profile's person, a GSTIN), whatever happened after (KTD-18's "the client
 * names a plan, the server decides"). It is the offer of the plan first
 * started with one (DEC-159): a plan with no offer starts at its full price
 * and uses nothing up.
 *
 * "this": this business had it; "other": a business sharing its payer did
 * or is checking out with it (said at checkout); null: none has.
 */
export async function trialTakenBy(
    db: Pick<Tx, "billingCheckout">,
    organizationId: string,
    now: Date = new Date(),
): Promise<"this" | "other" | null> {
    const own = await db.billingCheckout.findFirst({
        where: { organizationId, kind: "TRIAL", status: "COMPLETED" },
        select: { id: true },
    });
    if (own) return "this";
    // Other businesses' rows: outside this one's row-level security.
    const other = await outsideOrgContext(async () => {
        const others = (await samePayer(prisma, organizationId)).filter(
            (id) => id !== organizationId,
        );
        if (others.length === 0) return null;
        return prisma.billingCheckout.findFirst({
            where: {
                organizationId: { in: others },
                kind: "TRIAL",
                ...offerHeld(now),
            },
            select: { id: true },
        });
    });
    return other ? "other" : null;
}

/**
 * Hold the business's payer group (`same-payer.ts`) for the rest of the
 * transaction that records a checkout, one lock per business in one order,
 * then ask again whether the trial is still this business's to have (N3).
 * Read on its own connection, outside the business's row-level security,
 * while the locks are held, as `takeCouponPlaceInTx` reads a coupon's
 * places. Refuses (409) a trial another business of the payer took first.
 */
export async function holdPayerOffersInTx(
    tx: Pick<Tx, "$executeRaw" | "$queryRaw">,
    organizationId: string,
    trial: boolean,
    now: Date,
): Promise<void> {
    const ids = await outsideOrgContext(() =>
        samePayer(prisma, organizationId),
    );
    for (const id of [...ids].sort()) {
        await holdXactLock(tx, `offer-payer:${id}`);
    }
    if (
        trial &&
        (await outsideOrgContext(() =>
            trialTakenBy(prisma, organizationId, now),
        ))
    ) {
        throw new ConflictException({
            message: `${TRIAL_USED_ELSEWHERE} Reload to see the price without it.`,
            details: { field: "plan", reason: "trial-taken" },
        });
    }
}

/** Said at checkout when the trial went to a business sharing this one's payer. */
export const TRIAL_USED_ELSEWHERE =
    "The free trial is once per person, and you've already had one with another business.";

/** {@link trialTakenBy}, as a yes or no. */
export async function hadTrial(
    db: Pick<Tx, "billingCheckout" | "organization">,
    organizationId: string,
): Promise<boolean> {
    return (await trialTakenBy(db, organizationId)) !== null;
}

/**
 * Whether the business's trial was DEC-093's nominal first month: its
 * trial checkout (one per business, `hadTrial`) took a charge as it was
 * authorised. A trial that cost nothing is a free trial, worded as one.
 * One checkout starts it and no other plan continues it (DEC-159), so any
 * completed trial checkout with a charge counts.
 */
export async function paidFirstMonth(
    db: Pick<Tx, "billingCheckout">,
    organizationId: string,
): Promise<boolean> {
    const paid = await db.billingCheckout.findFirst({
        where: {
            organizationId,
            kind: "TRIAL",
            status: "COMPLETED",
            chargeNowPaise: { gt: 0 },
        },
        select: { id: true },
    });
    return paid !== null;
}

/** The plan's trial in days, when the catalogue offers one; else null. */
export function planTrialDays(catalog: Catalog, planId: string): number | null {
    const plan = catalog.plans.find((p) => p.id === planId);
    if (!plan || plan.pricePaise === 0 || !plan.trial?.on) return null;
    return plan.trial.days;
}

/**
 * What the plan's trial days cost, before GST (DEC-093's nominal first
 * month, from the catalogue's offer); zero when they're free.
 */
export function planFirstPaise(catalog: Catalog, planId: string): number {
    const plan = catalog.plans.find((p) => p.id === planId);
    return plan ? trialFirstPaise(plan) : 0;
}

/** When the trial-ending email goes: some days ahead, never in the past. */
export function trialNoticeAt(endsAt: Date, now: Date): Date {
    const at = new Date(endsAt.getTime() - TRIAL_ENDING_NOTICE_DAYS * DAY_MS);
    return at > now ? at : now;
}

// ── Add-ons ────────────────────────────────────────────────────────────

/**
 * Why an add-on can't be held on a plan, or null when it can: only on a
 * plan it is offered on and up to its own maximum (DEC-157); a module
 * add-on only where the plan leaves its module out (and one of it), a pack
 * or unit only where the plan has a cap on what it raises.
 *
 * This is asked when more is bought. What is already held is never judged
 * by it: a maximum lowered since leaves a holding as it is.
 */
export function addonProblem(
    catalog: Catalog,
    planId: string,
    addon: Addon,
    quantity: number,
): string | null {
    if (
        !Number.isSafeInteger(quantity) ||
        quantity < 0 ||
        quantity > MAX_ADDON_QUANTITY
    ) {
        return `Choose from 0 to ${MAX_ADDON_QUANTITY}.`;
    }
    const planName = catalog.plans.find((p) => p.id === planId)?.name ?? "";
    if (!addonOfferedOn(addon, planId)) {
        return `${addon.name} isn't offered on ${planName || "your plan"}.`;
    }
    if (addon.kind === "module") {
        const mod = catalog.modules.find((m) => m.id === addon.module);
        if (!mod) return `${addon.name} isn't offered.`;
        if (cellOf(mod, planId).inc) {
            return `${planName} already includes ${mod.name}.`;
        }
        if (quantity > 1) return `${addon.name} is one per business.`;
        return null;
    }
    const mod = catalog.modules.find((m) => m.id === addon.kind);
    const cell = mod ? cellOf(mod, planId) : null;
    if (!mod || !cell?.inc) {
        return `${planName} doesn't include ${mod?.name ?? addon.name}.`;
    }
    if (cell.limit === null) {
        return `${planName} has no cap on ${mod.name}.`;
    }
    const max = addonMaxQuantity(addon);
    if (quantity > max) {
        return `You can have up to ${max} of ${addon.name} on ${planName}.`;
    }
    return null;
}

/** An add-on's price for one period of a cycle, per pack or unit, before GST. */
export function addonPeriodUnitPaise(
    addon: Addon,
    cycle: BillingCycle,
): number {
    return addon.pricePaise * (cycle === "year" ? 12 : 1);
}

/** What an add-on charge row holds, before it is written. */
export interface AddonChargeLine {
    addonId: string;
    description: string;
    quantity: number;
    unitPaise: number;
    periodStart: Date;
    periodEnd: Date;
}

/**
 * An add-on as Saroh's invoice names it, from its kind (the owner's words,
 * 14 Oct 2026): a seat, or more capacity of a limit. A module or
 * integration add-on is named by its catalogue name.
 */
export function addonInvoiceName(
    addon: Pick<Addon, "kind" | "name">,
    cycle: BillingCycle,
): string {
    switch (addon.kind) {
        case "members":
            return `Additional Team Member — ${cycle === "year" ? "Annual" : "Monthly"} Seat`;
        case "products":
            return "Additional Product Capacity";
        case "orders":
            return "Additional Order Capacity";
        case "bookings":
            return "Additional Booking Capacity";
        default:
            return addon.name;
    }
}

/** A whole period of an add-on held at its start. */
export function addonPeriodLine(
    addon: Addon,
    quantity: number,
    cycle: BillingCycle,
    periodStart: Date,
    periodEnd: Date,
): AddonChargeLine {
    return {
        addonId: addon.id,
        description: addonInvoiceName(addon, cycle),
        quantity,
        unitPaise: addonPeriodUnitPaise(addon, cycle),
        periodStart,
        periodEnd,
    };
}

/**
 * More of an add-on bought part-way through a period: what is left of the
 * period, rounded half-up once (`prorateDifferencePaise`). Null when nothing
 * is left to charge.
 */
export function addonProratedLine(input: {
    addon: Addon;
    added: number;
    cycle: BillingCycle;
    periodStart: Date;
    periodEnd: Date;
    now: Date;
}): AddonChargeLine | null {
    const full =
        addonPeriodUnitPaise(input.addon, input.cycle) *
        Math.max(0, input.added);
    const amount = prorateDifferencePaise({
        fromPaise: 0,
        toPaise: full,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        now: input.now,
    });
    if (amount <= 0 || input.now >= input.periodEnd) return null;
    return {
        addonId: input.addon.id,
        description: `${addonInvoiceName(input.addon, input.cycle)} × ${input.added}, from the day it was bought`,
        quantity: 1,
        unitPaise: amount,
        periodStart: input.now,
        periodEnd: input.periodEnd,
    };
}

// ── Coupons ────────────────────────────────────────────────────────────

/**
 * The checkout's coupon, redeemed: one row per coupon and business, written
 * with the first discounted charge (never at checkout), on the webhook's
 * transaction. Storing the whole discount the coupon gives, before GST. A
 * repeat (a redelivered or second event) writes nothing.
 *
 * Under the coupon's places lock (`lockCouponPlacesInTx`), and re-counted
 * after: the checkout held its place when it was made, so a redemption past
 * `maxRedemptions` can't be refused here (the discount is already charged)
 * and is a WARN for the team to look at (F3).
 */
export async function redeemCouponInTx(
    tx: Pick<Tx, "pricingCouponRedemption" | "pricingCoupon" | "$executeRaw">,
    checkout: Pick<
        BillingCheckout,
        "couponId" | "organizationId" | "discountPaise" | "discountCharges"
    >,
    subscriptionId: string,
): Promise<boolean> {
    if (!checkout.couponId || checkout.discountCharges <= 0) return false;
    await lockCouponPlacesInTx(tx, checkout.couponId);
    const made = await tx.pricingCouponRedemption.createMany({
        data: [
            {
                couponId: checkout.couponId,
                organizationId: checkout.organizationId,
                subscriptionId,
                discountPaise:
                    checkout.discountPaise * checkout.discountCharges,
            },
        ],
        skipDuplicates: true,
    });
    if (made.count > 0) {
        const coupon = await tx.pricingCoupon.findUnique({
            where: { id: checkout.couponId },
            select: {
                code: true,
                maxRedemptions: true,
                _count: { select: { redemptions: true } },
            },
        });
        if (coupon && coupon._count.redemptions > coupon.maxRedemptions) {
            logger.warn(
                `coupon_redeemed_past_max coupon=${coupon.code} uses=${coupon._count.redemptions} max=${coupon.maxRedemptions} org=${checkout.organizationId}`,
            );
        }
    }
    return made.count > 0;
}
