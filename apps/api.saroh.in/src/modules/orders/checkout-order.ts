import { ConflictException, HttpException } from "@nestjs/common";
import { nextOrderNumberInTx, prisma } from "@saroh/database";

import { planMeter } from "../billing/metering.service";
import { gstInsideOrder } from "../invoices/order-invoice";
import { loadTaxProfile } from "../invoices/order-invoicing";
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
} from "./online-checkout";
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
 * UNPAID and `placedOnline`, each line priced from its listing and
 * holding nothing, for the account's store customer at that storefront —
 * linked to the account's contact (`SITE_ACCOUNT`, no team member) when
 * it has no link yet. Its close a day later is written in the same
 * transaction.
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
    },
): Promise<string> {
    const { lines, type, shippingCents, dto } = input;
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
                // business is told instead. It counts once paid (OQ-7).
                await planMeter.roomInTx(tx, scope.organizationId, "orders", {
                    soft: true,
                });
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
                            firstName: account.firstName,
                            lastName: account.lastName,
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
                // that still reaches a closed one is refunded (DEC-032).
                const older = await tx.order.findMany({
                    where: {
                        storeId,
                        customerId: customer.id,
                        placedOnline: true,
                        status: "PENDING",
                        paymentStatus: { in: ["UNPAID", "FAILED"] },
                    },
                    orderBy: { createdAt: "asc" },
                    select: { id: true },
                });
                for (const o of older) {
                    await closeCheckoutInTx(tx, o.id, CHECKOUT_REPLACED);
                }
                const open = await tx.order.count({
                    where: {
                        organizationId: scope.organizationId,
                        placedOnline: true,
                        status: "PENDING",
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
                    throw new HttpException(CHECKOUT_OPEN_ALREADY, 429);
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
                        // No stockRow: nothing is held until it is paid.
                        items: {
                            create: sold.map((l) => ({
                                productId: l.productId,
                                variantId: l.variantId,
                                quantity: l.quantity,
                                price: fromCents(l.priceCents),
                            })),
                        },
                    },
                    select: { id: true },
                });
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
