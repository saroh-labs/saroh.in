import type { Prisma } from "@saroh/database";

import type { BackInStockPayload } from "./stock-watch-rules";
import {
    BACK_IN_STOCK_DELAY_MS,
    BACK_IN_STOCK_TYPE,
} from "./stock-watch-rules";

/**
 * The one hook every way a product can become sellable again calls (DEC-174
 * U23, #1154), on the caller's transaction: a stock entry that adds units
 * (a delivery, a count up, a return, a move in, an undo, `recordEntry` and
 * the many-at-once writer in `stock.service.ts`), a promise given back (an
 * order cancelled or a line refunded, `reserve.ts`), a hand-marked Sold out
 * cleared (`products/sold-out.service.ts`), and Track stock switched
 * (`tracking.ts`). `on-sellable-again.guard.spec.ts` fails for a writer
 * that doesn't call it.
 *
 * It decides nothing about stock: while the product has a watch still
 * waiting (one is only taken while it is sold out on the site, so a waiting
 * watch means it was sold out), it queues one `stock.back-in-stock` run,
 * held {@link BACK_IN_STOCK_DELAY_MS} so a count typed wrong can be put
 * right first. That run reads the stock again and tells only the watches
 * whose product, or option, sells on their site by then. A product with no
 * one waiting (nearly every write) costs one indexed read and queues
 * nothing; one already queued queues no second.
 */

type Tx = Pick<Prisma.TransactionClient, "stockWatch" | "job">;

/** Queue the held run for one product if anyone waits for it. */
export async function onSellableAgain(
    tx: Tx,
    organizationId: string,
    productId: string,
    now: Date = new Date(),
): Promise<boolean> {
    const waiting = await tx.stockWatch.findFirst({
        where: {
            organizationId,
            productId,
            toldAt: null,
            cancelledAt: null,
        },
        select: { id: true },
    });
    if (!waiting) return false;
    return queueBackInStock(tx, organizationId, productId, now);
}

/** {@link onSellableAgain} for several products, each once. */
export async function onSellableAgainAll(
    tx: Tx,
    organizationId: string,
    productIds: Iterable<string>,
    now: Date = new Date(),
): Promise<void> {
    const ids = Array.from(new Set(productIds));
    if (ids.length === 0) return;
    const waiting = await tx.stockWatch.findMany({
        where: {
            organizationId,
            productId: { in: ids },
            toldAt: null,
            cancelledAt: null,
        },
        distinct: ["productId"],
        select: { productId: true },
    });
    for (const w of waiting) {
        await queueBackInStock(tx, organizationId, w.productId, now);
    }
}

/**
 * {@link onSellableAgain} for every product anyone waits for in the
 * business: Track stock switched for the whole business.
 */
export async function onSellableAgainForBusiness(
    tx: Tx,
    organizationId: string,
    now: Date = new Date(),
): Promise<void> {
    const waiting = await tx.stockWatch.findMany({
        where: { organizationId, toldAt: null, cancelledAt: null },
        distinct: ["productId"],
        select: { productId: true },
    });
    for (const w of waiting) {
        await queueBackInStock(tx, organizationId, w.productId, now);
    }
}

/**
 * The held run for a product, unless one is already waiting to run: the
 * first rise holds the run; a later one before it runs adds nothing.
 */
async function queueBackInStock(
    tx: Pick<Prisma.TransactionClient, "job">,
    organizationId: string,
    productId: string,
    now: Date,
): Promise<boolean> {
    const queued = await tx.job.findFirst({
        where: {
            organizationId,
            type: BACK_IN_STOCK_TYPE,
            status: "PENDING",
            payload: { path: ["productId"], equals: productId },
        },
        select: { id: true },
    });
    if (queued) return false;
    const payload: BackInStockPayload = { productId };
    await tx.job.create({
        data: {
            organizationId,
            type: BACK_IN_STOCK_TYPE,
            payload: payload as unknown as Prisma.InputJsonObject,
            runAt: new Date(now.getTime() + BACK_IN_STOCK_DELAY_MS),
        },
        select: { id: true },
    });
    return true;
}
