"use client";

import type { ComponentProps } from "react";

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
 * page's, decided on the server.
 */
export function OrderDetailContainer({
    ask,
    can,
    arrival,
    reviews,
}: {
    ask: OrderAsk;
    can: Detail["can"];
    arrival: Detail["arrival"];
    /** Who may invite a review, and what its email note may offer. */
    reviews: Omit<ComponentProps<typeof OrderReviews>, "orderId" | "state">;
}) {
    const { data } = useOrder(ask);
    // Hydrated by the page, so only a failed read again is missing: the
    // last answer stays (react-query keeps it).
    if (!data) return null;
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
