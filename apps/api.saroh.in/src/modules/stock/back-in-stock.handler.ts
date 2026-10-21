import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { emailRoute } from "../communications/email-route";
import { noticeOn } from "../communications/notice-settings";
import { enqueueCustomerNotice } from "../site-accounts/customer-notify-queue";
import type { BackInStockPayload } from "./stock-watch-rules";
import {
    BACK_IN_STOCK_BATCH,
    BACK_IN_STOCK_TYPE,
    backInStockNoticeKey,
} from "./stock-watch-rules";
import { readWatchable } from "./watchable";

type Tx = Prisma.TransactionClient;

/** What one run did. */
export interface BackInStockRun {
    /** Watches marked told, each with a BACK_IN_STOCK notice queued. */
    told: number;
    /** More were sellable than one run tells: another run is queued now. */
    more: boolean;
}

const NONE: BackInStockRun = { told: 0, more: false };

/**
 * `stock.back-in-stock` (DEC-174 U23, #1154): tells the people waiting for
 * a product that it can be bought again. Queued by `onSellableAgain`, held
 * ten minutes after stock came back. On one transaction, in the business's
 * RLS context:
 *
 *  1. The BACK_IN_STOCK switch off, or no email provider of the business's
 *     own: nobody is told and every watch keeps waiting.
 *  2. The stock is read again, per site and option the watches were taken
 *     on (`readWatchable`, as the site's shop reads it): sold out again
 *     since says nothing, and those watches keep waiting. A variant's watch
 *     hears only about that variant; a product's, about any option.
 *  3. Each watch whose product sells now (oldest first, at most
 *     {@link BACK_IN_STOCK_BATCH}) is marked told and gets one
 *     `customer.notify` BACK_IN_STOCK, keyed to the watch, so it is told
 *     once whatever runs twice. The rest are told by a run queued at once.
 *
 * Two runs for one product wait for each other on a lock, so the second
 * finds the first's watches told.
 */
export async function runBackInStock(
    tx: Tx,
    organizationId: string,
    productId: string,
    now: Date,
): Promise<BackInStockRun> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`back-in-stock:${organizationId}:${productId}`}))`;
    if (!(await noticeOn(tx, organizationId, "BACK_IN_STOCK"))) return NONE;
    if ((await emailRoute(tx, organizationId)) === null) return NONE;

    const open = {
        organizationId,
        productId,
        toldAt: null,
        cancelledAt: null,
    } satisfies Prisma.StockWatchWhereInput;
    const groups = await tx.stockWatch.groupBy({
        by: ["siteId", "variantId"],
        where: open,
    });
    const sellable: { siteId: string; variantId: string | null }[] = [];
    for (const g of groups) {
        const item = await readWatchable(tx, organizationId, {
            siteId: g.siteId,
            productId,
            variantId: g.variantId,
        });
        if (item?.sellable) {
            sellable.push({ siteId: g.siteId, variantId: g.variantId });
        }
    }
    if (sellable.length === 0) return NONE;

    const due = await tx.stockWatch.findMany({
        where: { ...open, OR: sellable },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: BACK_IN_STOCK_BATCH + 1,
        select: { id: true },
    });
    const batch = due.slice(0, BACK_IN_STOCK_BATCH);
    let told = 0;
    for (const watch of batch) {
        const marked = await tx.stockWatch.updateMany({
            where: { id: watch.id, toldAt: null, cancelledAt: null },
            data: { toldAt: now },
        });
        if (marked.count === 0) continue;
        await enqueueCustomerNotice(tx, organizationId, {
            kind: "BACK_IN_STOCK",
            eventKey: backInStockNoticeKey(watch.id),
            stockWatchId: watch.id,
        });
        told += 1;
    }
    const more = due.length > BACK_IN_STOCK_BATCH;
    if (more) {
        // The rest now: the stock was already held and read.
        const payload: BackInStockPayload = { productId };
        await tx.job.create({
            data: {
                organizationId,
                type: BACK_IN_STOCK_TYPE,
                payload: payload as unknown as Prisma.InputJsonObject,
                runAt: now,
            },
            select: { id: true },
        });
    }
    return { told, more };
}

/** The `stock.back-in-stock` job: {@link runBackInStock} per product. */
@Injectable()
export class BackInStockHandler {
    private readonly logger = new Logger(BackInStockHandler.name);

    readonly handle = async (job: Job): Promise<void> => {
        const productId = payloadOf(job.payload);
        if (!productId || !job.organizationId) {
            this.logger.warn(
                `${BACK_IN_STOCK_TYPE} job ${job.id} names no product; nothing to tell`,
            );
            return;
        }
        const organizationId = job.organizationId;
        await runInOrgContext(organizationId, () =>
            prisma.$transaction((tx) =>
                runBackInStock(tx, organizationId, productId, new Date()),
            ),
        );
    };
}

function payloadOf(value: unknown): string | null {
    if (typeof value !== "object" || value === null) return null;
    const p = value as Partial<BackInStockPayload>;
    return typeof p.productId === "string" && p.productId.length > 0
        ? p.productId
        : null;
}
