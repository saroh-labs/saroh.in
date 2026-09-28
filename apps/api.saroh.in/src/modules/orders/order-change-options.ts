import type { Prisma } from "@saroh/database";

import type { OrderStage } from "./dto";
import type { FulfilmentType } from "./fulfilment";
import {
    allowedTypes,
    FULFILMENT_RULES,
    FULFILMENT_TYPES,
    isHandedOver,
    NEW_STOREFRONT_TYPES,
    stepsFor,
    storefrontTypesOf,
    typeOf,
} from "./fulfilment";
import { cancelPendingInTx, cancelRefusal } from "./order-cancel";
import type { ChangeOptions, FulfilmentOption } from "./order-change-types";
import { customerThreadOpen } from "./order-customer-note";
import { isServiceLine } from "./order-line";

export type { ChangeOptions, FulfilmentOption } from "./order-change-types";

/*
 * What Order Detail's "Change how it's fulfilled…" and "Cancel order…" may
 * offer now (round-2 B9), worked out by the API so the app keeps no rule of
 * its own. Added to the order read's `next`; an app from before B9 ignores
 * it. The shapes are in `order-change-types.ts`.
 */

type Db = Pick<
    Prisma.TransactionClient,
    "order" | "booking" | "paymentRefund" | "customerAccount"
>;

/** The order's change options; null when there is no such order. */
export async function changeOptionsFor(
    db: Db,
    organizationId: string,
    orderId: string,
): Promise<ChangeOptions | null> {
    const order = await db.order.findFirst({
        where: { id: orderId, organizationId },
        select: {
            status: true,
            paymentStatus: true,
            stage: true,
            fulfilment: true,
            store: {
                select: {
                    settings: {
                        select: {
                            fulfilmentTypes: true,
                            collectionEnabled: true,
                            shippingEnabled: true,
                        },
                    },
                },
            },
            items: {
                select: {
                    productId: true,
                    serviceId: true,
                    product: { select: { name: true, fulfilmentTypes: true } },
                },
            },
            customer: {
                select: {
                    identityLinks: {
                        orderBy: { createdAt: "asc" },
                        take: 1,
                        select: { contactId: true },
                    },
                },
            },
        },
    });
    if (!order) return null;
    const [attended, pending, tell] = await Promise.all([
        db.booking.count({ where: { orderId, outcome: "ATTENDED" } }),
        cancelPendingInTx(db, orderId),
        customerThreadOpen(
            db,
            organizationId,
            order.customer.identityLinks[0]?.contactId ?? null,
        ),
    ]);
    const cancelled = order.status === "CANCELLED";
    return {
        fulfilment: fulfilmentChoices(order),
        cancel: {
            refusal: cancelRefusal({ ...order, treatmentBegun: attended > 0 }),
            pending: pending && !cancelled,
        },
        tell,
    };
}

/** The ways it can change to, and why not when it can't. */
export function fulfilmentChoices(order: {
    status: string;
    stage: string;
    fulfilment: string;
    store: {
        settings: {
            fulfilmentTypes: string[];
            collectionEnabled: boolean;
            shippingEnabled: boolean;
        } | null;
    };
    items: {
        productId: string | null;
        serviceId: string | null;
        product: { name: string; fulfilmentTypes: string[] } | null;
    }[];
}): ChangeOptions["fulfilment"] {
    const current = typeOf(order.fulfilment);
    const stage = order.stage as OrderStage;
    const own: FulfilmentOption = {
        type: current,
        label: FULFILMENT_RULES[current].label,
    };
    const refusal =
        order.status === "CANCELLED"
            ? "It was cancelled."
            : order.status === "SHIPPED" ||
                order.status === "DELIVERED" ||
                isHandedOver(current, stage)
              ? "It has already been handed over."
              : order.items.some(isServiceLine)
                ? "A treatment changes through its visits."
                : null;
    if (refusal) return { options: [own], refusal };
    const settings = order.store.settings;
    const offered = settings
        ? storefrontTypesOf(settings.fulfilmentTypes, settings)
        : NEW_STOREFRONT_TYPES;
    const products = order.items.flatMap((i) => (i.product ? [i.product] : []));
    // Only a way that has the step the order is at: the steps already done
    // stay done.
    const others = allowedTypes(products, offered).filter(
        (t) =>
            t !== current && stepsFor(t, stage).some((s) => s.stage === stage),
    );
    const ways = new Set<FulfilmentType>([current, ...others]);
    const options = FULFILMENT_TYPES.filter((t) => ways.has(t)).map((t) => ({
        type: t,
        label: FULFILMENT_RULES[t].label,
    }));
    return {
        options,
        refusal:
            options.length < 2
                ? "These items can only be fulfilled one way."
                : null,
    };
}
