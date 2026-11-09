import { ConflictException } from "@nestjs/common";
import { liveCatalogueVersion, prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";
import { editionProfile } from "@saroh/edition";
import { CATALOG_PLAN_KEY_PREFIX } from "@saroh/pricing-catalog";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";

export const SAROH_BILLS_ONLY_IN_INDIA =
    "Saroh's plans aren't available for businesses outside India yet.";

function unavailable(): ConflictException {
    return new ConflictException({
        message: SAROH_BILLS_ONLY_IN_INDIA,
        details: { code: "saroh-billing-unavailable" },
    });
}

/**
 * Refuse (409) what only an edition Saroh bills from the start may do: the
 * launch offer, India's alone (KTD3c). Unset is India. Saroh's plans
 * abroad are asked per business ({@link assertSarohSells}).
 */
export function assertSarohBills(edition: Edition | null | undefined): void {
    if (editionProfile(edition).sarohBilling) return;
    throw unavailable();
}

const defaultFlags = new FeatureFlagService();

/**
 * Whether Saroh sells its plans to this business now (stage 9, KTD3,
 * DEC-211): always in an edition it bills from the start (India); abroad,
 * only with `SAROH_BILLING_GLOBAL` on for the business and a live catalogue
 * of its edition that has a paid plan. Both gates, so a release changes
 * nothing for Global until the owner opens it (R8).
 */
export async function sarohSells(
    business: { organizationId: string; edition?: Edition | null },
    now: Date,
    flags: Pick<FeatureFlagService, "isEnabled"> = defaultFlags,
): Promise<boolean> {
    const edition = business.edition ?? "INDIA";
    if (editionProfile(edition).sarohBilling) return true;
    if (
        !(await flags.isEnabled(
            FlagKey.SAROH_BILLING_GLOBAL,
            business.organizationId,
        ))
    ) {
        return false;
    }
    const live = await liveCatalogueVersion(prisma, edition, now);
    if (!live) return false;
    const paid = await prisma.plan.count({
        where: {
            key: { startsWith: CATALOG_PLAN_KEY_PREFIX },
            version: live.version,
            active: true,
            priceCents: { gt: 0 },
        },
    });
    return paid > 0;
}

/**
 * Refuse (409, as before) a purchase Saroh doesn't sell this business: a
 * paid plan, an upgrade, an add-on, a one-off charge (stage 9, KTD3).
 */
export async function assertSarohSells(
    business: { organizationId: string; edition?: Edition | null },
    now: Date,
    flags?: Pick<FeatureFlagService, "isEnabled">,
): Promise<void> {
    if (await sarohSells(business, now, flags)) return;
    throw unavailable();
}

/**
 * Refuse (409, as before) upkeep for a business Saroh neither sells to nor
 * already bills: reading a quote, moving to Free or a cheaper plan,
 * confirming a payment, editing or choosing a billing profile (KTD3). A
 * business already on a paid plan keeps all of it when the switch is
 * turned off, so turning it off never traps a payer.
 */
export async function assertSarohKeeps(
    business: { organizationId: string; edition?: Edition | null },
    now: Date,
    flags?: Pick<FeatureFlagService, "isEnabled">,
): Promise<void> {
    if (await sarohSells(business, now, flags)) return;
    const paying = await prisma.subscription.count({
        where: {
            organizationId: business.organizationId,
            status: { not: "CANCELLED" },
            plan: { priceCents: { gt: 0 } },
        },
    });
    if (paying > 0) return;
    throw unavailable();
}
