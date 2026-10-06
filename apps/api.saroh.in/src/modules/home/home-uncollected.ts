import type { prisma } from "@saroh/database";

import { toMinor } from "../../common/money";
import { payOnHandoverWords } from "../orders/online-checkout";
import {
    uncollectedDays,
    uncollectedTag,
    uncollectedWhere,
} from "../orders/uncollected";
import { orderPartyName } from "../orders/walk-in";
import type { HomeAction, HomeEvidence } from "./home-model";
import { EVIDENCE_LIMIT } from "./home-model";
import { placedWords } from "./home-needs";

type Db = Pick<typeof prisma, "order">;

/** The action's code, and where Needs you ranks it. */
export const UNCOLLECTED_CODE = "COMMERCE_UNCOLLECTED_ORDERS";

/**
 * Website orders to be paid on collection or delivery that nobody came for
 * (R34, `orders/uncollected.ts`): still unpaid and not handed over three
 * days after they were placed, in the business's zone. One row each, oldest
 * first, "Not collected: 4 days" counting up until the order is paid,
 * handed over or cancelled; it opens the order, where staff cancel it (the
 * stock goes back) or keep waiting. Nothing here, or anywhere, cancels it.
 *
 * The caller has checked the order reads (`order:read` or `order:stage`);
 * the amount goes only to `order:read` (`money`). A staff member's Home
 * reads only their storefronts' orders (F11, `storeIds`).
 */
export async function uncollectedOrders(
    db: Db,
    organizationId: string,
    view: {
        now: Date;
        zone: string;
        money: boolean;
        storeIds?: readonly string[] | null;
    },
): Promise<HomeAction | null> {
    const where = {
        ...uncollectedWhere(organizationId, view.now, view.zone),
        ...(view.storeIds ? { storeId: { in: [...view.storeIds] } } : {}),
    };
    const [count, rows] = await Promise.all([
        db.order.count({ where }),
        db.order.findMany({
            where,
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: EVIDENCE_LIMIT,
            select: {
                id: true,
                orderId: true,
                total: true,
                currency: true,
                createdAt: true,
                status: true,
                paymentStatus: true,
                payOnHandover: true,
                fulfilment: true,
                customerId: true,
                walkInName: true,
                customer: {
                    select: { firstName: true, lastName: true, email: true },
                },
            },
        }),
    ]);
    if (count === 0) return null;

    const evidence: HomeEvidence[] = rows.map((o) => {
        // The where already holds it; the count is the same rule, in words.
        const days = uncollectedDays(o, view.now, view.zone) ?? 0;
        const who = orderPartyName(o);
        const pickup = o.fulfilment === "PICKUP";
        return {
            id: o.id,
            title: `#${o.orderId}`,
            subtitle: who,
            at: o.createdAt.toISOString(),
            amountMinor: view.money ? toMinor(o.total) : null,
            currency: view.money ? o.currency : null,
            href: `/commerce/orders/${o.id}`,
            tag: uncollectedTag(o.fulfilment, days),
            tone: "bad",
            headline: pickup
                ? `${who} hasn't collected order #${o.orderId}`
                : `Order #${o.orderId} to ${who} hasn't been delivered`,
            detail: `${placedWords(o.createdAt.toISOString(), view.now, view.zone)} to ${payOnHandoverWords(o.fulfilment)}, not paid yet. Cancel it to put the stock back, or keep waiting.`,
        };
    });

    return {
        code: UNCOLLECTED_CODE,
        title:
            count === 1
                ? "An order hasn't been collected"
                : `${count} orders haven't been collected`,
        // One order opens it; more (or one gone between the reads) the list.
        href:
            count === 1 && evidence[0] ? evidence[0].href : "/commerce/orders",
        severity: "ATTENTION",
        moduleKey: "COMMERCE",
        count,
        evidence,
        tone: "bad",
    };
}
