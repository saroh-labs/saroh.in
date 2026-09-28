import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { gstInsideOrder } from "../invoices/order-invoice";
import { loadTaxProfile } from "../invoices/order-invoicing";
import type { ShopScope } from "./checkout-bag";
import type { QuotedLine } from "./checkout-quote";
import type { CheckoutStartDto } from "./checkout.dto";
import type { StorefrontFulfilmentType } from "./fulfilment";
import { shipsToAddress, storedValueFor } from "./fulfilment";
import {
    CHECKOUT_OPEN_MS,
    CLOSE_ABANDONED_CHECKOUT_TYPE,
} from "./online-checkout";
import { fromCents, withGstRates } from "./order-pricing";

/** The signed-in site account a checkout is for (ADR-011). */
export interface SiteAccount {
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
        const count = await prisma.order.count({ where: { storeId } });
        const orderNumber = `ORD-${String(count + 1 + attempt).padStart(3, "0")}`;
        try {
            return await prisma.$transaction(async (tx) => {
                const customer = await tx.customer.upsert({
                    where: {
                        storeId_email: { storeId, email: account.email },
                    },
                    create: {
                        storeId,
                        organizationId: scope.organizationId,
                        email: account.email,
                        firstName: account.firstName,
                        lastName: account.lastName,
                    },
                    update: {},
                    select: { id: true },
                });
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
            // stands. Otherwise another order took the number.
            const raced = await prisma.order.findUnique({
                where: {
                    storeId_checkoutKey: { storeId, checkoutKey: dto.key },
                },
                select: { id: true },
            });
            if (raced) return raced.id;
            if (attempt === 4) throw err;
        }
    }
    throw new ConflictException("Couldn't start the checkout. Try again.");
}
