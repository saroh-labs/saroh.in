/**
 * The old `storefronts` plan floor (ADR-010, `LEGACY_FLOOR_ENTITLEMENTS`),
 * where the catalogue's `locations` row doesn't govern a business: the
 * switch off, or a business the catalogue doesn't reach yet.
 *
 * It caps what the catalogue caps: places customers visit (owner, 8 Oct).
 * An online-only storefront is 0 locations, so it never meets this floor;
 * a storefront meets it only as it becomes a `SHOP`: created as one (Sell's
 * setup with a registered address) or its kind changed to one
 * (`StorefrontsService.update`). The count is metering's own
 * (`countUsage(…, "shopLocations")`), so the floor, the catalogue and the
 * console can't disagree on what a location is.
 */
import { ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import type { EntitlementService } from "./entitlement.service";
import type { MeterDb } from "./metering";
import { METER_WORDS, countUsage } from "./metering";
import { lockMeter } from "./metering.service";

/** The entitlement key the old floor sells locations under. */
export const LEGACY_LOCATIONS_KEY = "storefronts";

/** The floor's refusal, in the catalogue's words for a location. */
export function legacyLocationRefusal(limit: number): ForbiddenException {
    const words = METER_WORDS.shopLocations;
    return new ForbiddenException({
        message:
            limit < 1
                ? `Your plan doesn't include a ${words.one}. A bigger plan adds one.`
                : `Your plan includes ${limit === 1 ? `one ${words.one}` : `${limit} ${words.what}`}. A bigger plan adds more.`,
    });
}

/**
 * Before one more storefront becomes a place customers visit, on the
 * write's own transaction: refuse (403, in the merchant's words) when the
 * plan's floor is full. Takes the `shopLocations` meter's lock first, the
 * same one the catalogue path takes, so two at once can't both pass.
 * A plan with no number there is uncapped.
 */
export async function assertLegacyLocationRoom(
    tx: MeterDb & Pick<Prisma.TransactionClient, "$executeRaw">,
    organizationId: string,
    entitlements: Pick<EntitlementService, "getEntitlements">,
): Promise<void> {
    const limit = (await entitlements.getEntitlements(organizationId))[
        LEGACY_LOCATIONS_KEY
    ];
    if (typeof limit !== "number") return;
    await lockMeter(tx, organizationId, "shopLocations");
    const used = await countUsage(tx, organizationId, "shopLocations");
    if (used >= limit) throw legacyLocationRefusal(limit);
}
