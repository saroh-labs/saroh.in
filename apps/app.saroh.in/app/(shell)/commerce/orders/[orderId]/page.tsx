import { notFound } from "next/navigation";

import { OrderDetail } from "@/components/commerce/order-detail/order-detail";
import { OrderLocked } from "@/components/commerce/orders/orders-states";
import { OrderReviews } from "@/components/stores/order-reviews";
import { ownAccountsRoom, takesOnlinePayment } from "@/lib/billing/access";
import { personHref } from "@/lib/contacts/person-href";
import { customerHref } from "@/lib/customers/links";
import { hasPaymentProvider } from "@/lib/invoices/tax";
import {
    orderLockedText,
    orderPowers,
    ordersAccess,
} from "@/lib/orders/access";
import { allergyNotesOf } from "@/lib/orders/attention";
import {
    getAttentionAllergies,
    getOrderRead,
} from "@/lib/orders/kitchen-service";
import type { AllergyNote } from "@/lib/orders/read";
import { arrivalOf } from "@/lib/orders/row-menu";
import { sellablesOf } from "@/lib/orders/sellables";
import { permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { refundsOnlineOrUnknown } from "@/lib/payments/refunds-online";
import { getOrderPayments } from "@/lib/payments/service";
import { invitationState } from "@/lib/product-reviews/service";
import { listProducts } from "@/lib/products/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
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
 * The allergy check reads the customer's Needs attention from the order
 * read itself (B15), so the kitchen's view has it too. Beside it, each read
 * on its own so one failing costs only its panel: the provider's payment
 * attempts (money roles) and the review invitation (`order:read`) — and,
 * from an API before B15 only, the contact's Needs attention (C1).
 *
 * Someone holding neither `order:read` nor `order:stage` gets the design's
 * locked card before the order is read (B7), rather than the generic denial
 * its 403 would bring.
 */
export default async function OrderPage({
    params,
    searchParams,
}: {
    params: Promise<{ orderId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [{ orderId }, organization, query] = await Promise.all([
        params,
        resolveActiveOrganization(),
        searchParams,
    ]);
    if (organization && !ordersAccess(organization).open) {
        return <OrderLocked text={orderLockedText(organization)} />;
    }
    const order = await getOrderRead(orderId);
    if (!order) notFound();

    const may = permitsFor(organization);
    // What this person may do to it, each the power its endpoint asks (B16).
    // A pay link is offered only on a plan that takes payment online
    // (R33): elsewhere the order is paid in cash or at the counter, and no
    // link is drawn at all.
    const powers = orderPowers(organization);
    const billing = await billingAccessOrNull();
    const linkable = powers.payLink && takesOnlinePayment(billing);
    // With no provider and a plan that can't connect one (DEC-091), "Connect
    // one" would lead to a key form the connect refuses (UX-017): no block.
    const connectable = ownAccountsRoom(billing);

    const contactId = order.customer?.contactId ?? null;
    // A pay link (B11) is offered only to someone who may take or change
    // orders, on an order that shows money, and only while a provider can
    // open the checkout window (DEC-054).
    const payOnline =
        linkable && order.money
            ? hasPaymentProvider().catch(() => false)
            : Promise.resolve(false);
    // The allergy check reads the order's own Needs attention (B15), which
    // reaches the kitchen too; an API before B15 sends none, and the
    // contact's Needs attention is read instead (Z2a: never the notes).
    const fromOrder = allergyNotesOf(order.attention);
    const [notes, payments, reviewState, canPayOnline, addable, refundOnline] =
        await Promise.all([
            fromOrder !== undefined
                ? Promise.resolve(fromOrder)
                : contactId
                  ? getAttentionAllergies(contactId)
                  : Promise.resolve<AllergyNote[]>([]),
            order.money
                ? getOrderPayments(order.id).catch(() => null)
                : Promise.resolve(null),
            // Unknown on failure: the section is left out rather than guessing.
            may("order:read")
                ? invitationState(order.id).catch(() => null)
                : Promise.resolve(null),
            payOnline,
            // "Add an item" (B8): only while items can change, for someone who
            // may change them — from the order's own storefront (DEC-032).
            powers.edit && order.next.editable
                ? listProducts({ storefront: order.store.id })
                      .then((products) =>
                          // Set to Not sold (archived): nobody orders it.
                          sellablesOf(
                              products
                                  .filter((p) => p.status !== "ARCHIVED")
                                  .map((p) => ({
                                      id: p.id,
                                      name: p.name,
                                      price: p.price,
                                      variants: p.variants,
                                      soldOut:
                                          p.soldOut === true ||
                                          (p.inventory !== null &&
                                              p.inventory.quantity <= 0),
                                  })),
                          ),
                      )
                      .catch(() => "unavailable" as const)
                : Promise.resolve(null),
            // Whether a refund can still go back online (DEC-117): asked
            // only of someone who may refund an order that shows money.
            powers.refund && order.money
                ? refundsOnlineOrUnknown()
                : Promise.resolve(undefined),
        ]);

    return (
        <OrderDetail
            order={order}
            notes={notes ?? "unavailable"}
            payments={payments}
            can={{
                stage: powers.stage,
                edit: powers.edit,
                payLink: linkable && (canPayOnline || connectable),
                refund: powers.refund,
                payOnline: canPayOnline,
                refundOnline,
                manageProviders: may("payment:manage"),
                contact: may("contact:read"),
                // A treatment's visits (B14): open one, book the next.
                bookingRead: may("booking:read"),
                bookingWrite: may("booking:write"),
            }}
            customerHref={
                contactId
                    ? personHref(contactId)
                    : order.customer
                      ? customerHref(order.store.id, order.customer.id)
                      : null
            }
            addable={addable}
            // From the Orders list's row menu or quick view (B5): open the
            // refund or courier panel, or print the ticket, once.
            arrival={arrivalOf(query)}
            aside={
                reviewState ? (
                    <OrderReviews
                        orderId={order.id}
                        state={reviewState}
                        canWrite={
                            may("product-review:write") && may("order:read")
                        }
                        may={{
                            connect: may("comms:manage"),
                            plans: may("billing:read"),
                        }}
                    />
                ) : null
            }
        />
    );
}
