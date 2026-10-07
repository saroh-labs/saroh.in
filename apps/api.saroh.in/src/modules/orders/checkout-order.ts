import { ConflictException, HttpException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { nextOrderNumberInTx, prisma } from "@saroh/database";

import { planMeter } from "../billing/metering.service";
import { splitName } from "../bookings/reservation";
import { resolveContact } from "../customer-workspace/resolve-contact";
import { gstInsideOrder } from "../invoices/order-invoice";
import { loadTaxProfile } from "../invoices/order-invoicing";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { queueUncollectedAlert } from "../notifications/uncollected-alert";
import { enqueueOrderPlacedNotice } from "../site-accounts/customer-notify-queue";
import type { ShopScope } from "./checkout-bag";
import type { QuotedLine } from "./checkout-quote";
import type { CheckoutStartDto } from "./checkout.dto";
import type { StorefrontFulfilmentType } from "./fulfilment";
import { shipsToAddress, storedValueFor } from "./fulfilment";
import {
    CHECKOUT_OPEN_ALREADY,
    CHECKOUT_OPEN_MS,
    CHECKOUT_REPLACED,
    CLOSE_ABANDONED_CHECKOUT_TYPE,
    closeCheckoutInTx,
    MAX_OPEN_CHECKOUTS,
    PAY_ON_HANDOVER_WAITING,
} from "./online-checkout";
import { applyInventoryTransition } from "./order-inventory";
import { fromCents, withGstRates } from "./order-pricing";

/** The signed-in site account a checkout is for (ADR-011). */
export interface SiteAccount {
    /** The account itself, named on the order it places (A7). */
    accountId: string;
    email: string;
    contactId: string;
    firstName: string | null;
    lastName: string | null;
}

/**
 * The order, in one transaction at the sells-from storefront: PENDING,
 * UNPAID and `placedOnline`, each line priced from its listing, for the
 * account's store customer at that storefront — linked to the account's
 * contact (`SITE_ACCOUNT`, no team member) when it has no link yet.
 *
 * Paid online, its lines hold nothing until the payment lands, and its
 * close a day later is written in the same transaction. Paid on handover
 * ("Pay when you collect", "Pay on delivery"), it is made as a staff
 * pay-later order is (DEC-032's "when stock is promised"): its lines
 * promise their units now — refused past what the storefront can sell —
 * it never closes on its own, and the team is told of it at once. Its
 * invoice is made when staff mark it paid (DEC-023), as a pay-later
 * order's is.
 */
export async function createCheckoutOrder(
    scope: ShopScope,
    account: SiteAccount,
    input: {
        lines: QuotedLine[];
        type: StorefrontFulfilmentType;
        shippingCents: number;
        currency: string;
        dto: CheckoutStartDto;
        /** Paid when it is collected or delivered, not online. */
        payOnHandover?: boolean;
    },
): Promise<string> {
    const { lines, type, shippingCents, dto } = input;
    const onHandover = input.payOnHandover === true;
    const storeId = scope.storefront.id;
    const sold = lines.flatMap((l) =>
        l.productId
            ? [
                  {
                      productId: l.productId,
                      variantId: l.variantId,
                      quantity: l.quantity,
                      priceCents: l.unitCents,
                  },
              ]
            : [],
    );
    const subtotalCents = sold.reduce(
        (sum, l) => sum + l.priceCents * l.quantity,
        0,
    );
    // A GST-registered business's prices include GST: `tax` records the
    // GST inside the total instead of adding to it (ADR-008, DEC-023).
    const profile = await loadTaxProfile(prisma, scope.organizationId);
    const address = shipsToAddress(type) ? (dto.address ?? null) : null;
    const taxCents = profile.registered
        ? gstInsideOrder(await withGstRates(sold), {
              shippingCents,
              discountCents: 0,
              deliveryState: address?.state ?? null,
              profile,
          })
        : 0;
    const totalCents = subtotalCents + shippingCents;

    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            return await prisma.$transaction(async (tx) => {
                // The plan's monthly orders cap is soft here (U13, OQ-8):
                // the site never turns a customer away; at the cap the
                // business is told instead. It counts once paid (OQ-7), or
                // from the start when it is paid on handover.
                await planMeter.roomInTx(tx, scope.organizationId, "orders", {
                    soft: true,
                });
                const named = await nameContactInTx(
                    tx,
                    scope.organizationId,
                    account,
                    address?.name,
                );
                // Found whatever case staff typed it in, as a treatment's
                // customer is; made only when there is none.
                const customer =
                    (await tx.customer.findFirst({
                        where: {
                            storeId,
                            email: {
                                equals: account.email,
                                mode: "insensitive",
                            },
                        },
                        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                        select: { id: true },
                    })) ??
                    (await tx.customer.create({
                        data: {
                            storeId,
                            organizationId: scope.organizationId,
                            email: account.email,
                            firstName: named.firstName,
                            lastName: named.lastName,
                        },
                        select: { id: true },
                    }));
                // One start at a time per customer at this storefront: the
                // close, the count and the new order below are decided under
                // the customer's lock, so two starts can't both pass the cap.
                await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customer.id} FOR UPDATE`;
                // A new checkout replaces the account's older unpaid ones
                // here: a changed bag makes a new one, and must not pile up
                // checkouts until the cap locks the customer out. A payment
                // that still reaches a closed one is refunded (DEC-032). An
                // order to be paid on handover is a real order, never
                // replaced.
                const older = await tx.order.findMany({
                    where: {
                        storeId,
                        customerId: customer.id,
                        placedOnline: true,
                        payOnHandover: false,
                        status: "PENDING",
                        paymentStatus: { in: ["UNPAID", "FAILED"] },
                    },
                    orderBy: { createdAt: "asc" },
                    select: { id: true },
                });
                for (const o of older) {
                    await closeCheckoutInTx(tx, o.id, CHECKOUT_REPLACED);
                }
                // At most a few at once, business-wide: unpaid online
                // checkouts, or — since each holds its units — orders
                // waiting to be paid on handover, each counted on its own.
                const open = await tx.order.count({
                    where: {
                        organizationId: scope.organizationId,
                        placedOnline: true,
                        payOnHandover: onHandover,
                        status: onHandover
                            ? { in: ["PENDING", "PROCESSING"] }
                            : "PENDING",
                        paymentStatus: { in: ["UNPAID", "FAILED"] },
                        customer: {
                            email: {
                                equals: account.email,
                                mode: "insensitive",
                            },
                        },
                    },
                });
                if (open >= MAX_OPEN_CHECKOUTS) {
                    throw new HttpException(
                        onHandover
                            ? PAY_ON_HANDOVER_WAITING
                            : CHECKOUT_OPEN_ALREADY,
                        429,
                    );
                }
                // Linked to the account's contact, unless it already
                // stands for someone (staff linked it, or a payment did).
                const linked = await tx.customerIdentityLink.count({
                    where: { customerId: customer.id },
                });
                if (linked === 0) {
                    await tx.customerIdentityLink.create({
                        data: {
                            organizationId: scope.organizationId,
                            contactId: account.contactId,
                            customerId: customer.id,
                            reason: "SITE_ACCOUNT",
                            linkedByUserId: null,
                        },
                    });
                }
                // The business's next number, whichever storefront sells
                // it (P3, DEC-066): taken last, so its lock is held briefly.
                const orderNumber = await nextOrderNumberInTx(
                    tx,
                    scope.organizationId,
                );
                const order = await tx.order.create({
                    data: {
                        storeId,
                        organizationId: scope.organizationId,
                        orderId: orderNumber,
                        customerId: customer.id,
                        currency: input.currency,
                        subtotal: fromCents(subtotalCents),
                        tax: fromCents(taxCents),
                        shipping: fromCents(shippingCents),
                        discount: "0.00",
                        total: fromCents(totalCents),
                        fulfilment: storedValueFor(type),
                        notes: dto.notes ?? null,
                        placedOnline: true,
                        payOnHandover: onHandover,
                        checkoutKey: dto.key,
                        // The account's Orders find it by this (A7).
                        customerAccountId: account.accountId,
                        ...(address
                            ? {
                                  deliveryName: address.name ?? null,
                                  deliveryPhone: address.phone ?? null,
                                  deliveryLine1: address.line1,
                                  deliveryLine2: address.line2 ?? null,
                                  deliveryCity: address.city,
                                  deliveryState: address.state,
                                  deliveryPostalCode: address.postalCode,
                              }
                            : {}),
                        // Paid online: no stockRow, nothing is held until
                        // it is paid. On handover: held just below.
                        items: {
                            create: sold.map((l) => ({
                                productId: l.productId,
                                variantId: l.variantId,
                                quantity: l.quantity,
                                price: fromCents(l.priceCents),
                            })),
                        },
                    },
                    select: {
                        id: true,
                        createdAt: true,
                        items: { select: { id: true } },
                    },
                });
                if (onHandover) {
                    // Promised now, as a staff pay-later order's units are
                    // (DEC-032); the last unit gone meanwhile refuses the
                    // order (409) and nothing is written.
                    await applyInventoryTransition(
                        tx,
                        order.items,
                        "RELEASED",
                        "RESERVED",
                    );
                    // The team's "New order" (F14), now: no payment is
                    // coming to tell them.
                    await enqueueTeamAlert(tx, scope.organizationId, {
                        event: "order",
                        orderId: order.id,
                        actorUserId: null,
                    });
                    // And the customer hears it is in (UX-042).
                    await enqueueOrderPlacedNotice(
                        tx,
                        scope.organizationId,
                        order.id,
                    );
                    // And, three days on in the business's zone, the
                    // team's "Not collected" if it is still waiting (R34).
                    // It only tells: nothing cancels it on its own.
                    await queueUncollectedAlert(
                        tx,
                        scope.organizationId,
                        order,
                    );
                    return order.id;
                }
                await tx.job.create({
                    data: {
                        organizationId: scope.organizationId,
                        type: CLOSE_ABANDONED_CHECKOUT_TYPE,
                        payload: { orderId: order.id },
                        runAt: new Date(Date.now() + CHECKOUT_OPEN_MS),
                    },
                });
                return order.id;
            });
        } catch (err) {
            if ((err as { code?: string }).code !== "P2002") throw err;
            // A double tap raced this one with the same key: its order
            // stands. Otherwise an order the API before P3 numbered took
            // the number: the next attempt takes another.
            const raced = await prisma.order.findUnique({
                where: {
                    storeId_checkoutKey: { storeId, checkoutKey: dto.key },
                },
                select: { id: true, customer: { select: { email: true } } },
            });
            if (raced) {
                // Only this account's own twin: a key another account used
                // is never handed over.
                if (
                    raced.customer?.email.trim().toLowerCase() !==
                    account.email.trim().toLowerCase()
                ) {
                    throw new ConflictException(
                        "That checkout isn't yours. Start again.",
                    );
                }
                return raced.id;
            }
            if (attempt === 4) throw err;
        }
    }
    throw new ConflictException("Couldn't start the checkout. Try again.");
}

/**
 * The name the delivery was addressed to, given to the account's contact
 * when it has none — so "My details" shows who signed in at the checkout,
 * as a first booking names it. A name the contact already has is kept, and
 * nothing else about it changes. The id comes from the session, so it goes
 * through `resolveContact` (C9): a checkout racing a merge names the
 * survivor, never the tombstone.
 */
async function nameContactInTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    account: SiteAccount,
    given: string | null | undefined,
): Promise<{ firstName: string | null; lastName: string | null }> {
    const kept = { firstName: account.firstName, lastName: account.lastName };
    const { first, last } = splitName(given ?? undefined);
    if (!first || account.firstName?.trim() || account.lastName?.trim()) {
        return kept;
    }
    const resolved = await resolveContact(
        tx,
        account.contactId,
        organizationId,
    );
    if (!resolved || resolved.removed) return kept;
    // Only while still unnamed: a name staff gave it meanwhile stands.
    await tx.contact.updateMany({
        where: {
            id: resolved.id,
            organizationId,
            AND: [
                { OR: [{ firstName: null }, { firstName: "" }] },
                { OR: [{ lastName: null }, { lastName: "" }] },
            ],
        },
        data: { firstName: first, lastName: last ?? null },
    });
    return { firstName: first, lastName: last ?? null };
}
