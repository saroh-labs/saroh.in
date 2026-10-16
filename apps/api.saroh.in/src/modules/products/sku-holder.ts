import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

/**
 * A SKU names one variant in the business (products audit, 16 Oct 2026):
 * the import and the barcode scan look a SKU up across every product, so a
 * second product's variant can't take one another product already has.
 * Within one product the unique index says so (`SKU_TAKEN`); across
 * products this check does, naming the holder. Pure words first; tested in
 * `sku-holder.spec.ts`.
 */

/** "PT-BRN is already Packing Tape · Brown." */
export function skuTakenMessage(
    sku: string,
    productName: string,
    variantTitle: string,
): string {
    const title = variantTitle.trim();
    const holder =
        title && title !== productName
            ? `${productName} · ${title}`
            : productName;
    return `${sku} is already ${holder}.`;
}

/**
 * Refuse `sku` when a variant of another product of the business has it
 * (letter case aside, as people read a SKU). The product's own variants
 * are the unique index's to judge.
 */
export async function assertSkuFreeInBusiness(
    organizationId: string,
    productId: string,
    sku: string,
): Promise<void> {
    const wanted = sku.trim();
    if (!wanted) return;
    const holder = await prisma.productVariant.findFirst({
        where: {
            sku: { equals: wanted, mode: "insensitive" },
            productId: { not: productId },
            product: { organizationId },
        },
        select: { title: true, product: { select: { name: true } } },
    });
    // Read with its product, as selected; a row without one names nobody.
    if (!holder?.product) return;
    throw new ConflictException({
        message: skuTakenMessage(wanted, holder.product.name, holder.title),
        field: "sku",
    });
}
