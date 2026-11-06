import { ConflictException } from "@nestjs/common";
import type { Edition } from "@saroh/edition";
import { editionProfile } from "@saroh/edition";

export const SAROH_BILLS_ONLY_IN_INDIA =
    "Saroh's plans aren't available for businesses outside India yet.";

/**
 * Refuse (409) a plan, a charge or a billing profile for a business whose
 * edition Saroh doesn't bill (DEC-204: Global has no billing profile until
 * Saroh's own billing abroad exists). Called first in every such write and
 * quote, after the permission check. Unset is India.
 */
export function assertSarohBills(edition: Edition | null | undefined): void {
    if (editionProfile(edition).sarohBilling) return;
    throw new ConflictException({
        message: SAROH_BILLS_ONLY_IN_INDIA,
        details: { code: "saroh-billing-unavailable" },
    });
}
