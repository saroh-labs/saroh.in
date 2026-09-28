import { notFound } from "next/navigation";

import { OrderDetail } from "@/components/commerce/order-detail/order-detail";
import { OrderLocked } from "@/components/commerce/orders/orders-states";
import { OrderReviews } from "@/components/stores/order-reviews";
import { customerHref } from "@/lib/customers/links";
import { hasPaymentProvider } from "@/lib/invoices/tax";
import { orderLockedText, ordersAccess } from "@/lib/orders/access";
import { getAllergyNotes, getOrderRead } from "@/lib/orders/kitchen-service";
import type { AllergyNote } from "@/lib/orders/read";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { getOrderPayments } from "@/lib/payments/service";
import { invitationState } from "@/lib/product-reviews/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Order" };

/**
 * Sell → Orders → one order, after the "Saroh Order Detail" design, layout
 * 1d (U14, ADR-008).
 *
 * Reads the organization-scoped order (`GET organizations/:org/orders/:id`),
 * which a Member at the counter reaches with `order:stage` and which leaves
 * money out, in the API, for anyone without a money read. The old
 * store-scoped read sent prices and totals to every role that can read the
 * store, so this page no longer uses it. `?storefront=` in older links is
 * ignored: the organization scopes the read.
 *
 * Beside it, each read on its own so one failing costs only its panel: the
 * customer's allergy notes (the contact's detail read, U8 — only for a
 * customer confirmed as a contact), the provider's payment attempts (money
 * roles), and the review invitation (`order:read`).
 *
 * Someone holding neither `order:read` nor `order:stage` gets the design's
 * locked card before the order is read (B7), rather than the generic denial
 * its 403 would bring.
 */
export default async function OrderPage({
    params,
}: {
    params: Promise<{ orderId: string }>;
}) {
    await requireSession();
    const [{ orderId }, organization] = await Promise.all([
        params,
        resolveActiveOrganization(),
    ]);
    if (organization && !ordersAccess(organization).open) {
        return <OrderLocked text={orderLockedText(organization)} />;
    }
    const order = await getOrderRead(orderId);
    if (!order) notFound();

    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

    const contactId = order.customer?.contactId ?? null;
    // A pay link (B11) is offered only to someone who may change the order,
    // on an order that shows money, and only while a provider can open the
    // checkout window (DEC-054).
    const payOnline =
        may("order:write") && order.money
            ? hasPaymentProvider().catch(() => false)
            : Promise.resolve(false);
    const [notes, payments, reviewState, canPayOnline] = await Promise.all([
        contactId
            ? getAllergyNotes(contactId)
            : Promise.resolve<AllergyNote[]>([]),
        order.money
            ? getOrderPayments(order.id).catch(() => null)
            : Promise.resolve(null),
        // Unknown on failure: the section is left out rather than guessing.
        may("order:read")
            ? invitationState(order.id).catch(() => null)
            : Promise.resolve(null),
        payOnline,
    ]);

    return (
        <OrderDetail
            order={order}
            notes={notes ?? "unavailable"}
            payments={payments}
            can={{
                stage: may("order:stage"),
                write: may("order:write"),
                refund: may("payment:manage"),
                payOnline: canPayOnline,
                manageProviders: may("payment:manage"),
            }}
            customerHref={
                contactId
                    ? `/customers/${encodeURIComponent(contactId)}`
                    : order.customer
                      ? customerHref(order.store.id, order.customer.id)
                      : null
            }
            aside={
                reviewState ? (
                    <OrderReviews
                        orderId={order.id}
                        state={reviewState}
                        canWrite={
                            may("product-review:write") && may("order:read")
                        }
                    />
                ) : null
            }
        />
    );
}
