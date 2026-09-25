import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import {
    firstRow,
    lockProduct,
    lockProductStock,
    lockStockLevels,
} from "../products/stock-levels";
import { clearSoldOut } from "./sold-out";
import { promisedRefusal, TRACKING_OFF_NOTE } from "./stock-words";
import type { StockActor } from "./stock.service";
import { recordEntry } from "./stock.service";

/**
 * Track stock on and off (#515): a product (`Product.stockTracked`) and the
 * whole business (`BusinessProfile.stockTracking`, on when there is no
 * profile). A product counts stock only while both are on; otherwise it
 * sells unless a storefront marked it Sold out by hand
 * (`ProductListing.soldOutAt`, `sold-out.ts`), no order holds or sells from
 * its shelves, and nothing writes an entry for it.
 *
 * The rules, the same for one product and for the business:
 * - Off locks the shelves (StockLevel rows, by id), is refused while any of
 *   them is promised to an open order, and counts every shelf with stock on
 *   it to 0 — a COUNTED entry each — so the log still adds up to what is on
 *   the shelf. The rows stay, at 0, for the log.
 * - On writes nothing: the shelves are at 0 (made at 0 where missing, at
 *   each storefront that sells it), so it reads Sold out until counted.
 *   Its hand-marked Sold out is cleared everywhere: the count says it now.
 * - An order line placed while its product was untracked stays untracked
 *   for life (`stockRow` NONE); reserve re-reads tracking after taking its
 *   row locks, so a hold never lands on a shelf that just stopped counting
 *   (`stock/reserve.ts`).
 *
 * Lock order: Product (or the business's profile) → StockLevel rows by id,
 * after whatever the caller holds — the same as every other stock flow.
 */

type Tx = Prisma.TransactionClient;
type Db = Pick<Tx, "businessProfile" | "product">;

/**
 * StockLevel rows that count: their product tracks stock, and so does its
 * business. Every reader that turns shelves into numbers spreads this, so
 * an untracked product's rows (kept at 0 for the log) read as untracked,
 * never as Sold out.
 */
export const COUNTING_ROWS = {
    product: {
        stockTracked: true,
        organization: {
            OR: [
                { businessProfile: { is: null } },
                { businessProfile: { is: { stockTracking: true } } },
            ],
        },
    },
} satisfies Prisma.StockLevelWhereInput;

/** Whether the business tracks stock (no profile yet: yes). */
export async function businessTracksStock(
    db: Pick<Tx, "businessProfile">,
    organizationId: string,
): Promise<boolean> {
    const profile = await db.businessProfile.findUnique({
        where: { organizationId },
        select: { stockTracking: true },
    });
    return profile?.stockTracking ?? true;
}

/**
 * Of `productIds`, those that count no stock now: their own switch is off,
 * or the business's is. Read after the caller took its row locks, so a
 * switch that went off meanwhile is seen.
 */
export async function untrackedAmong(
    db: Db,
    productIds: readonly string[],
): Promise<Set<string>> {
    const ids = Array.from(new Set(productIds));
    if (ids.length === 0) return new Set();
    const products = await db.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, stockTracked: true, organizationId: true },
    });
    const businesses = new Map<string, boolean>();
    const out = new Set<string>();
    for (const p of products) {
        let on = businesses.get(p.organizationId);
        if (on === undefined) {
            on = await businessTracksStock(db, p.organizationId);
            businesses.set(p.organizationId, on);
        }
        if (!p.stockTracked || !on) out.add(p.id);
    }
    return out;
}

/** Whether one product counts stock now (its switch and the business's). */
export async function tracksStock(db: Db, productId: string): Promise<boolean> {
    return !(await untrackedAmong(db, [productId])).has(productId);
}

/**
 * Empty locked shelves for Track stock going off: refused while any is
 * promised; every shelf with stock on it is counted to 0. Returns how many
 * were counted.
 */
async function emptyShelves(
    tx: Tx,
    actor: StockActor,
    rows: readonly { id: string; onHand: number; promised: number }[],
): Promise<number> {
    const promised = rows.reduce((n, r) => n + r.promised, 0);
    if (promised > 0) {
        throw new ConflictException({
            message: promisedRefusal(promised),
            field: "stockTracked",
        });
    }
    let counted = 0;
    for (const row of rows) {
        if (row.onHand === 0) continue;
        await recordEntry(tx, {
            stockLevelId: row.id,
            kind: "COUNTED",
            quantity: -row.onHand,
            counted: 0,
            actorUserId: actor.userId,
            note: TRACKING_OFF_NOTE,
            // A shelf sold below 0 is counted up to it.
            allowNegative: true,
        });
        counted += 1;
    }
    return counted;
}

/**
 * A shelf at every storefront that sells the product, in the way it counts:
 * per variant (each variant sold there) once any of its shelves names a
 * variant, else as a whole. Missing ones are made at 0; none is changed.
 * The caller holds the product's lock.
 */
export async function ensureShelves(
    tx: Tx,
    organizationId: string,
    productId: string,
): Promise<void> {
    const [listings, rows] = await Promise.all([
        tx.productListing.findMany({
            where: { productId },
            select: {
                storeId: true,
                variants: { select: { variantId: true } },
            },
        }),
        tx.stockLevel.findMany({
            where: { productId },
            select: { storeId: true, variantId: true, lowStockAlert: true },
        }),
    ]);
    const perVariant = rows.some((r) => r.variantId !== null);
    const has = new Set(rows.map((r) => `${r.storeId}:${r.variantId ?? ""}`));
    const warnAt = (variantId: string | null) =>
        rows.find((r) => r.variantId === variantId)?.lowStockAlert ??
        firstRow(rows)?.lowStockAlert;
    for (const listing of listings) {
        const wanted = perVariant
            ? listing.variants.map((v) => v.variantId)
            : [null];
        for (const variantId of wanted) {
            if (has.has(`${listing.storeId}:${variantId ?? ""}`)) continue;
            const lowStockAlert = warnAt(variantId);
            await tx.stockLevel.create({
                data: {
                    organizationId,
                    storeId: listing.storeId,
                    productId,
                    variantId,
                    ...(lowStockAlert === undefined ? {} : { lowStockAlert }),
                },
            });
        }
    }
}

export interface ProductTracking {
    productId: string;
    /** The product's own switch. */
    tracked: boolean;
    /** The business's switch: off, and no product counts stock. */
    businessTracks: boolean;
    /** Shelves counted to 0 by turning it off. */
    counted: number;
}

/**
 * Turn Track stock on or off for one product of `actor`'s business, on the
 * caller's transaction. Turning it to what it already is changes nothing.
 * The caller has checked the actor may change products (`store:write`).
 * `makeShelves: false` leaves making the shelves to a caller that is about
 * to count the product per variant (it calls `ensureShelves` after).
 */
export async function setProductTracking(
    tx: Tx,
    actor: StockActor,
    productId: string,
    tracked: boolean,
    opts: { makeShelves?: boolean } = {},
): Promise<ProductTracking> {
    const { organizationId } = actor;
    await lockProduct(tx, productId);
    const product = await tx.product.findFirst({
        where: { id: productId, organizationId },
        select: { stockTracked: true },
    });
    if (!product) throw new NotFoundException("Product not found");
    const businessTracks = await businessTracksStock(tx, organizationId);
    const result = { productId, tracked, businessTracks, counted: 0 };
    if (product.stockTracked === tracked) return result;

    if (tracked) {
        if (opts.makeShelves ?? true) {
            await ensureShelves(tx, organizationId, productId);
        }
        await tx.product.update({
            where: { id: productId },
            data: { stockTracked: true, stockTrackedAt: new Date() },
        });
        await clearSoldOut(tx, { productId });
        return result;
    }
    const rows = await lockProductStock(tx, productId);
    result.counted = await emptyShelves(tx, actor, rows);
    await tx.product.update({
        where: { id: productId },
        data: { stockTracked: false },
    });
    return result;
}

export interface BusinessTracking {
    tracked: boolean;
    /** Shelves counted to 0 by turning it off. */
    counted: number;
}

/**
 * Turn Track stock on or off for the whole business, on the caller's
 * transaction: the same rules as one product, for every product. Each
 * product keeps its own switch, so turning the business back on counts
 * again exactly the products that counted before — from 0.
 */
export async function setBusinessTracking(
    tx: Tx,
    actor: StockActor,
    tracked: boolean,
): Promise<BusinessTracking> {
    const { organizationId } = actor;
    // The profile is the business's lock for this switch; make it if the
    // business has none yet (it reads as on).
    await tx.businessProfile.upsert({
        where: { organizationId },
        create: { organizationId },
        update: {},
        select: { id: true },
    });
    const [profile] = await tx.$queryRaw<{ stockTracking: boolean }[]>`
        SELECT "stockTracking" FROM "BusinessProfile"
        WHERE "organizationId" = ${organizationId} FOR UPDATE`;
    const result = { tracked, counted: 0 };
    if (profile.stockTracking === tracked) return result;

    if (tracked) {
        await tx.businessProfile.update({
            where: { organizationId },
            data: { stockTracking: true },
        });
        // Counting starts again now: a sale made while it was off isn't a
        // sale the shelf missed.
        await tx.product.updateMany({
            where: { organizationId, stockTracked: true },
            data: { stockTrackedAt: new Date() },
        });
        // Those products count again: their count says Sold out now. One
        // whose own switch is off keeps its hand-marked Sold out.
        await clearSoldOut(tx, {
            organizationId,
            product: { stockTracked: true },
        });
        return result;
    }
    const ids = await tx.stockLevel.findMany({
        where: { organizationId },
        select: { id: true },
    });
    await lockStockLevels(
        tx,
        ids.map((r) => r.id),
    );
    const rows = await tx.stockLevel.findMany({
        where: { organizationId },
        select: { id: true, onHand: true, promised: true },
        orderBy: { id: "asc" },
    });
    result.counted = await emptyShelves(tx, actor, rows);
    await tx.businessProfile.update({
        where: { organizationId },
        data: { stockTracking: false },
    });
    return result;
}
