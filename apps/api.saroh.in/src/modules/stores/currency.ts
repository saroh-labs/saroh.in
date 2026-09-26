import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

/**
 * A business sells in one currency, and every storefront uses it (DEC-030,
 * amended 2026-09-26). A product is priced in its business's currency
 * (`Product.currency`), and a storefront says its own in `StoreSettings`.
 */

type Db = Pick<
    Prisma.TransactionClient,
    "storeSettings" | "store" | "order" | "product"
>;

/**
 * The currency a storefront has settled on: its settings'. Null before it
 * saved any — it then reads as its latest order's, or the column default,
 * which is a guess, so nothing is refused on it.
 */
export async function storefrontCurrency(
    db: Pick<Db, "storeSettings">,
    storeId: string,
): Promise<string | null> {
    const settings = await db.storeSettings.findUnique({
        where: { storeId },
        select: { currency: true },
    });
    return settings?.currency ?? null;
}

/**
 * The business's currency, for a storefront it opens: its first
 * storefront's settings, else the currency its orders were taken in, else
 * the one its products are priced in. Null for a business with none of
 * those yet (its first storefront chooses).
 */
export async function businessCurrency(
    db: Db,
    organizationId: string,
): Promise<string | null> {
    const first = await db.store.findFirst({
        where: { organizationId, deletedAt: null, settings: { isNot: null } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { settings: { select: { currency: true } } },
    });
    if (first?.settings) return first.settings.currency;
    const order = await db.order.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        select: { currency: true },
    });
    if (order) return order.currency;
    const product = await db.product.findFirst({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
        select: { currency: true },
    });
    return product?.currency ?? null;
}

/** Why a product can't be sold at a storefront in another currency. */
export function currencyMismatch(input: {
    product: string;
    productCurrency: string;
    storefront: string;
    storefrontCurrency: string;
}): string {
    return `${input.product} is priced in ${input.productCurrency}, but ${input.storefront} sells in ${input.storefrontCurrency}. A business sells in one currency at every storefront.`;
}

/**
 * Refuse (409) selling a product at a storefront whose currency differs
 * from the product's. A storefront that hasn't settled its currency yet
 * (no settings) is not refused.
 */
export async function assertSameCurrency(
    db: Pick<Db, "storeSettings" | "store">,
    input: {
        storeId: string;
        product: { name: string; currency: string };
        field?: string;
    },
): Promise<void> {
    const currency = await storefrontCurrency(db, input.storeId);
    if (currency === null || currency === input.product.currency) return;
    const store = await db.store.findUnique({
        where: { id: input.storeId },
        select: { name: true },
    });
    throw new ConflictException({
        message: currencyMismatch({
            product: input.product.name,
            productCurrency: input.product.currency,
            storefront: store?.name ?? "this storefront",
            storefrontCurrency: currency,
        }),
        field: input.field ?? "storeId",
    });
}
