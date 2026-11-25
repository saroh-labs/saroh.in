"use client";

import type { ComponentProps, ReactNode } from "react";

import { OrderReviews } from "@/components/stores/reviews/order-reviews";
import { personHref } from "@/lib/contacts/person-href";
import { customerHref } from "@/lib/customers/links";
import type { OrderAsk } from "@/lib/orders/queries";
import { useOrder } from "@/lib/orders/use-orders";

import { OrderDetail } from "./order-detail";

type Detail = ComponentProps<typeof OrderDetail>;

/**
 * One order on React Query (DEC-259): `OrderDetail` drawn from the order's
 * query (the order, its allergy check, payments, review invitation and what
 * "Add an item" offers), so a step, a payment or a refund reads it again
 * (`useOrderSave`), never the whole page. What the person may do is the
 * page's, decided on the server; the order is read in the browser, behind
 * the route's loader (`skeleton`).
 */
export function OrderDetailContainer({
    ask,
    can,
    arrival,
    reviews,
    skeleton,
}: {
    ask: OrderAsk;
    /** The route's loader, until the order is read. */
    skeleton: ReactNode;
    can: Detail["can"];
    arrival: Detail["arrival"];
    /** Who may invite a review, and what its email note may offer. */
    reviews: Omit<ComponentProps<typeof OrderReviews>, "orderId" | "state">;
}) {
    const read = useOrder(ask);
    const { data } = read;
    // A first read that failed is the page failing (`error.tsx`); a read
    // again that fails keeps the last answer (react-query keeps it).
    if (read.isError && !data) throw read.error;
    if (!data) return skeleton;
    const { order } = data;
    const contactId = order.customer?.contactId ?? null;

    return (
        <OrderDetail
            order={order}
            notes={data.notes ?? "unavailable"}
            payments={data.payments}
            can={can}
            customerHref={
                contactId
                    ? personHref(contactId)
                    : order.customer
                      ? customerHref(order.store.id, order.customer.id)
                      : null
            }
            addable={data.addable}
            arrival={arrival}
            aside={
                data.review ? (
                    <OrderReviews
                        orderId={order.id}
                        state={data.review}
                        {...reviews}
                    />
                ) : null
            }
        />
    );
}
