import type { BillingCheckout, Prisma } from "@saroh/database";
import type { Addon, BillingCycle, Catalog } from "@saroh/pricing-catalog";
import { cellOf, validateCatalog } from "@saroh/pricing-catalog";

import { prorateDifferencePaise } from "./checkout-quote";

type Tx = Prisma.TransactionClient;
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

/** The most of one add-on a business can hold. */
export const MAX_ADDON_QUANTITY = 99;

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
 * A business may have one free trial: never again once a trial checkout of
 * its own was completed, whatever happened after (KTD-18's "the client
 * names a plan, the server decides").
 */
export async function hadTrial(
    db: Pick<Tx, "billingCheckout">,
    organizationId: string,
): Promise<boolean> {
    const done = await db.billingCheckout.findFirst({
        where: { organizationId, kind: "TRIAL", status: "COMPLETED" },
        select: { id: true },
    });
    return Boolean(done);
}

/** The plan's trial in days, when the catalogue offers one; else null. */
export function planTrialDays(catalog: Catalog, planId: string): number | null {
    const plan = catalog.plans.find((p) => p.id === planId);
    if (!plan || plan.pricePaise === 0 || !plan.trial?.on) return null;
    return plan.trial.days;
}

/** When the trial-ending email goes: some days ahead, never in the past. */
export function trialNoticeAt(endsAt: Date, now: Date): Date {
    const at = new Date(endsAt.getTime() - TRIAL_ENDING_NOTICE_DAYS * DAY_MS);
    return at > now ? at : now;
}

// ── Add-ons ────────────────────────────────────────────────────────────

/**
 * Why an add-on can't be held on a plan, or null when it can: a module
 * add-on only where the plan leaves its module out (and one of it), a pack
 * or unit only where the plan has a cap on what it raises.
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
        description: `${addon.name} (add-on)`,
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
        description: `${input.addon.name} (add-on) × ${input.added}, from the day it was bought`,
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
 */
export async function redeemCouponInTx(
    tx: Pick<Tx, "pricingCouponRedemption">,
    checkout: Pick<
        BillingCheckout,
        "couponId" | "organizationId" | "discountPaise" | "discountCharges"
    >,
    subscriptionId: string,
): Promise<boolean> {
    if (!checkout.couponId || checkout.discountCharges <= 0) return false;
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
    return made.count > 0;
}
