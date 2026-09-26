import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { COUNTING_ROWS } from "../stock/tracking";
import { assertSameCurrency } from "../stores/currency";
import type { StockCounts } from "./stock-levels";
import {
    asCounts,
    firstRow,
    lockProduct,
    STOCK_LEVEL_SELECT,
} from "./stock-levels";

/**
 * One storefront's view of a catalogue product (#510): whether it sells the
 * product and which variants, and the shelf there. A variant the storefront
 * does not sell reads "Not sold here" (`soldHere: false`), with any stock
 * still on its shelf shown.
 */
export interface ListingView {
    storeId: string;
    storeName: string;
    /** The storefront sells the product. */
    listed: boolean;
    /** The product counted as a whole here; null per variant or untracked. */
    stock: StockCounts | null;
    variants: {
        variantId: string;
        soldHere: boolean;
        stock: StockCounts | null;
    }[];
}

/**
 * List a product at a storefront of its business, inside the caller's
 * transaction. Reuses the listing and every StockLevel row the storefront
 * already has (with its stock); makes the missing ones at 0 when the product
 * counts stock, in the way it counts (whole, or per variant sold there).
 * `variantIds` names the variants sold there; left out, a new listing sells
 * every variant and an existing one keeps its choice. The caller has
 * checked the storefront and product belong to `organizationId`.
 */
export async function listAt(
    tx: Prisma.TransactionClient,
    input: {
        organizationId: string;
        productId: string;
        storeId: string;
        variantIds?: readonly string[];
    },
): Promise<void> {
    const { organizationId, productId, storeId } = input;
    // Lock order: Product before its StockLevel rows (stock-levels.ts).
    await lockProduct(tx, productId);
    const variants = await tx.productVariant.findMany({
        where: { productId },
        select: { id: true },
    });
    const known = new Set(variants.map((v) => v.id));
    if (input.variantIds?.some((id) => !known.has(id))) {
        throw new BadRequestException({
            message: "Pick variants of this product.",
            field: "variantIds",
        });
    }

    let listing = await tx.productListing.findUnique({
        where: { storeId_productId: { storeId, productId } },
        select: { id: true },
    });
    const isNew = listing === null;
    if (isNew) {
        // A business sells in one currency (DEC-030): a product priced in
        // another than the storefront's isn't listed there.
        const product = await tx.product.findUniqueOrThrow({
            where: { id: productId },
            select: { name: true, currency: true },
        });
        await assertSameCurrency(tx, { storeId, product });
    }
    listing ??= await tx.productListing.create({
        data: { organizationId, storeId, productId },
        select: { id: true },
    });
    const listingId = listing.id;
    const sold =
        input.variantIds ?? (isNew ? variants.map((v) => v.id) : undefined);
    if (sold) {
        await tx.productListingVariant.deleteMany({
            where: { listingId, variantId: { notIn: [...sold] } },
        });
        await tx.productListingVariant.createMany({
            data: sold.map((variantId) => ({
                organizationId,
                listingId,
                productId,
                variantId,
            })),
            skipDuplicates: true,
        });
    }

    // Its shelf here, in the way it counts everywhere else — for a product
    // that tracks stock (#515); one that doesn't gets a shelf when Track
    // stock goes on.
    const product = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { stockTracked: true },
    });
    if (!product.stockTracked) return;
    const rows = await tx.stockLevel.findMany({
        where: { productId },
        select: STOCK_LEVEL_SELECT,
        orderBy: { id: "asc" },
    });
    const perVariant = rows.some((r) => r.variantId !== null);
    const here = rows.filter((r) => r.storeId === storeId);
    // A new row warns where the same shelf warns at another storefront.
    const warnAt = (variantId: string | null) =>
        rows.find((r) => r.variantId === variantId)?.lowStockAlert ??
        firstRow(rows)?.lowStockAlert;

    if (!perVariant) {
        if (here.length === 0) {
            const lowStockAlert = warnAt(null);
            await tx.stockLevel.create({
                data: {
                    organizationId,
                    storeId,
                    productId,
                    ...(lowStockAlert === undefined ? {} : { lowStockAlert }),
                },
            });
        }
        return;
    }
    const soldNow = await tx.productListingVariant.findMany({
        where: { listingId },
        select: { variantId: true },
    });
    const counted = new Set(here.map((r) => r.variantId));
    for (const { variantId } of soldNow) {
        if (counted.has(variantId)) continue;
        await tx.stockLevel.create({
            data: {
                organizationId,
                storeId,
                productId,
                variantId,
                lowStockAlert: warnAt(variantId),
            },
        });
    }
}

/**
 * Where a catalogue product is sold. Authorization belongs to the caller
 * (the organization routes, #531); every method takes the business and
 * answers 404 for a storefront or product of another one.
 */
@Injectable()
export class ListingsService {
    /** List the product at `storeId` (see `listAt`), and read it back. */
    async list(
        organizationId: string,
        productId: string,
        storeId: string,
        variantIds?: readonly string[],
    ): Promise<ListingView> {
        await this.assertOwned(organizationId, productId, storeId);
        await prisma.$transaction((tx) =>
            listAt(tx, { organizationId, productId, storeId, variantIds }),
        );
        return this.at(organizationId, productId, storeId);
    }

    /** Choose the variants `storeId` sells; the rest read "Not sold here". */
    async setVariants(
        organizationId: string,
        productId: string,
        storeId: string,
        variantIds: readonly string[],
    ): Promise<ListingView> {
        await this.assertOwned(organizationId, productId, storeId);
        const listed = await prisma.productListing.count({
            where: { storeId, productId },
        });
        if (listed === 0) {
            throw new NotFoundException("This storefront doesn't sell it");
        }
        return this.list(organizationId, productId, storeId, variantIds);
    }

    /**
     * Stop selling the product at `storeId`. Its StockLevel rows stay, with
     * their stock, so listing it again picks up where it left off; open
     * orders there still fulfil from them.
     */
    async unlist(
        organizationId: string,
        productId: string,
        storeId: string,
    ): Promise<ListingView> {
        await this.assertOwned(organizationId, productId, storeId);
        await prisma.productListing.deleteMany({
            where: { organizationId, storeId, productId },
        });
        return this.at(organizationId, productId, storeId);
    }

    /** The product at every open storefront of its business. */
    async storefronts(
        organizationId: string,
        productId: string,
    ): Promise<ListingView[]> {
        const product = await prisma.product.findFirst({
            where: { id: productId, organizationId },
            select: { id: true },
        });
        if (!product) throw new NotFoundException("Product not found");
        const stores = await prisma.store.findMany({
            where: { organizationId, deletedAt: null },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true },
        });
        return Promise.all(
            stores.map((s) => this.at(organizationId, productId, s.id)),
        );
    }

    /** The product at one storefront. */
    async at(
        organizationId: string,
        productId: string,
        storeId: string,
    ): Promise<ListingView> {
        const [store, variants, listing, rows] = await Promise.all([
            prisma.store.findFirst({
                where: { id: storeId, organizationId },
                select: { id: true, name: true },
            }),
            prisma.productVariant.findMany({
                where: { productId, product: { organizationId } },
                orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                select: { id: true },
            }),
            prisma.productListing.findFirst({
                where: { storeId, productId, organizationId },
                select: { variants: { select: { variantId: true } } },
            }),
            prisma.stockLevel.findMany({
                where: { storeId, productId, organizationId, ...COUNTING_ROWS },
                select: STOCK_LEVEL_SELECT,
            }),
        ]);
        if (!store) throw new NotFoundException("Store not found");
        const sold = new Set(listing?.variants.map((v) => v.variantId) ?? []);
        const whole = rows.find((r) => r.variantId === null);
        return {
            storeId: store.id,
            storeName: store.name,
            listed: listing !== null,
            stock:
                whole && !rows.some((r) => r.variantId)
                    ? asCounts(whole)
                    : null,
            variants: variants.map((v) => {
                const row = rows.find((r) => r.variantId === v.id);
                return {
                    variantId: v.id,
                    soldHere: listing !== null && sold.has(v.id),
                    stock: row ? asCounts(row) : null,
                };
            }),
        };
    }

    private async assertOwned(
        organizationId: string,
        productId: string,
        storeId: string,
    ): Promise<void> {
        const [store, product] = await Promise.all([
            prisma.store.findFirst({
                where: { id: storeId, organizationId, deletedAt: null },
                select: { id: true },
            }),
            prisma.product.findFirst({
                where: { id: productId, organizationId },
                select: { id: true },
            }),
        ]);
        if (!store) throw new NotFoundException("Store not found");
        if (!product) throw new NotFoundException("Product not found");
    }
}
