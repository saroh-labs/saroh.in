import type { Prisma } from "@saroh/database";

import type { ItemCap } from "../billing/item-limits";
import { assertItemRoom } from "../billing/item-limits";
import { planMeter } from "../billing/metering.service";

/** The catalogue row that caps a product's variants (DEC-158). */
export const VARIANTS_ROW = "variants";

/**
 * The plan's cap on one product's variants, for every write that can add
 * one (a new variant, a copy). Variants never count as products; this is
 * its own cap, inside each product. Null when nothing caps them
 * (`MeteringService.itemCap`): the write then counts nothing.
 */
export function variantCap(organizationId: string): Promise<ItemCap | null> {
    return planMeter.itemCap(organizationId, VARIANTS_ROW);
}

/**
 * Refuse adding `adding` variants to a product when it would then hold
 * more than the cap. Call it under the product's lock (`lockProduct`), so
 * two adds at once can't both fit the last place. A product already past
 * the cap is refused only this; every other save of it goes through.
 */
export async function assertVariantRoom(
    tx: Pick<Prisma.TransactionClient, "productVariant">,
    cap: ItemCap | null,
    productId: string,
    adding = 1,
): Promise<void> {
    if (!cap) return;
    const has = await tx.productVariant.count({ where: { productId } });
    assertItemRoom(cap, has, adding);
}

/**
 * Refuse a copy that would start with more variants than the cap. The
 * original is untouched, whatever it holds.
 */
export function assertCopyFits(cap: ItemCap | null, variants: number): void {
    assertItemRoom(
        cap,
        0,
        variants,
        `A copy would have ${variants.toLocaleString("en-IN")}, so it can't be made.`,
    );
}
