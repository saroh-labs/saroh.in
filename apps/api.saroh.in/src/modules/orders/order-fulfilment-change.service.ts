import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { gstInsideOrder } from "../invoices/order-invoice";
import {
    correctOrderInvoiceForEdit,
    loadTaxProfile,
    settleSupplementaryInvoices,
} from "../invoices/order-invoicing";
import { allows, authorize } from "../organizations/organization-policy";
import {
    DIFFERENCE_KEY_PREFIX,
    supersedeOpenDifferenceIntents,
} from "../payments/intent-state";
import { PaymentsService } from "../payments/payments.service";
import type { FulfilmentType } from "./fulfilment";
import {
    allowedTypes,
    assertItemsAllow,
    FULFILMENT_RULES,
    isHandedOver,
    NEW_STOREFRONT_TYPES,
    shipsToAddress,
    stepsFor,
    storedValueFor,
    storefrontTypesOf,
    typeOf,
} from "./fulfilment";
import type { ChangeFulfilmentDto } from "./order-change.dto";
import { fulfilmentNote, tellOrderCustomer } from "./order-customer-note";
import { lockOrder } from "./order-kitchen.service";
import { isServiceLine } from "./order-line";
import { fromCents, toCents, withGstRates } from "./order-pricing";

/** What a change of how an order is fulfilled did. */
export interface FulfilmentChangeOutcome {
    id: string;
    eventId: string;
    from: FulfilmentType;
    to: FulfilmentType;
    /** How much the order's total moved: the delivery charge's change. */
    differenceCents: number;
    /**
     * Still to take on the order (+), now due — paid by a pay link or at the
     * counter — or handed back (-). 0 when nothing was paid yet, or when it
     * was paid by hand (the counter settles it: `byHand`).
     */
    settleCents: number;
    /** Paid by hand: any difference is taken or given back at the counter. */
    byHand: boolean;
    refund: { refundId: string; amountCents: number; status: string } | null;
    /** The change stands; handing the difference back didn't. */
    moneyError: string | null;
    /** A note went into the customer's message thread. */
    told: boolean;
}

/**
 * "Change how it's fulfilled…" on Order Detail (round-2 B9, option B;
 * R6, default 17). `order:write`; moving money on a paid order also takes
 * `payment:manage`.
 *
 * Allowed until handover, in one transaction under the order's row lock:
 * the new way must be one every item allows (B12) and, for Pick-up, Local
 * delivery and Shipping, one the storefront offers (B2a); a delivery needs
 * an address. Staff type the new delivery charge (decided 2026-09-27) and
 * the difference is worked out here from `order.shipping`:
 *
 * - more, on an order paid online: a supplementary invoice, and the
 *   difference is due — sent as the order's pay link (B11) or recorded at
 *   the counter;
 * - less, paid online: the difference is refunded through the one refund
 *   path (DEC-026), with a credit note;
 * - paid by hand: the invoice is corrected the same way, and the counter
 *   takes or gives the difference;
 * - not paid yet: the total simply changes.
 *
 * The step on the timeline reads "Changed from Pick-up to Local delivery".
 * A treatment changes through its visits (E9), never here.
 */
@Injectable()
export class OrderFulfilmentChangeService {
    private readonly logger = new Logger(OrderFulfilmentChangeService.name);

    constructor(@Optional() private readonly payments?: PaymentsService) {}

    async change(
        ctx: OrganizationContext,
        orderId: string,
        dto: ChangeFulfilmentDto,
    ): Promise<FulfilmentChangeOutcome> {
        authorize(ctx, "order:write");
        const newShippingCents = toCents(dto.shipping);

        const result = await prisma.$transaction(async (tx) => {
            const order = await lockOrder(tx, ctx, orderId);
            if (order.status === "CANCELLED") {
                throw new ConflictException({
                    message: "This order was cancelled, so it can't change.",
                    field: "status",
                });
            }
            const was = typeOf(order.fulfilment);
            if (
                order.status === "SHIPPED" ||
                order.status === "DELIVERED" ||
                isHandedOver(was, order.stage)
            ) {
                throw new ConflictException({
                    message:
                        "It has been handed over, so how it's fulfilled can't change. Refund it instead if something was wrong.",
                    field: "fulfilment",
                });
            }
            if (order.items.some(isServiceLine)) {
                throw new ConflictException({
                    message:
                        "A treatment's order changes through its visits, not here.",
                    field: "fulfilment",
                });
            }
            const type = typeOf(dto.fulfilment);
            if (type === was) {
                throw new BadRequestException({
                    message: `It's already ${FULFILMENT_RULES[type].label.toLowerCase()}.`,
                    field: "fulfilment",
                });
            }
            const stored = storedValueFor(type);
            // The steps already done stay done: the new way must have the
            // step the order is at (Digital has no Preparing or Ready).
            if (
                !stepsFor(type, order.stage).some(
                    (s) => s.stage === order.stage,
                )
            ) {
                throw new ConflictException({
                    message: `${FULFILMENT_RULES[type].label} has no step for where this order is now, so it can't change to that.`,
                    field: "fulfilment",
                });
            }
            const products = order.items.flatMap((i) =>
                i.product ? [i.product] : [],
            );
            assertItemsAllow(products, type);
            const store = await tx.store.findUniqueOrThrow({
                where: { id: order.storeId },
                select: {
                    name: true,
                    settings: {
                        select: {
                            fulfilmentTypes: true,
                            collectionEnabled: true,
                            shippingEnabled: true,
                        },
                    },
                },
            });
            const offered = store.settings
                ? storefrontTypesOf(store.settings.fulfilmentTypes, {
                      collectionEnabled: store.settings.collectionEnabled,
                      shippingEnabled: store.settings.shippingEnabled,
                  })
                : NEW_STOREFRONT_TYPES;
            if (!(allowedTypes(products, offered) as string[]).includes(type)) {
                throw new ConflictException({
                    message:
                        type === "DIGITAL"
                            ? "Only an order whose items are all digital can be sent digitally."
                            : `${store.name} doesn't offer ${FULFILMENT_RULES[type].label.toLowerCase()}. Turn it on in the storefront's settings first.`,
                    field: "fulfilment",
                });
            }
            const address = dto.address
                ? {
                      deliveryName: dto.address.name ?? null,
                      deliveryPhone: dto.address.phone ?? null,
                      deliveryLine1: dto.address.line1,
                      deliveryLine2: dto.address.line2 ?? null,
                      deliveryCity: dto.address.city,
                      deliveryState: dto.address.state,
                      deliveryPostalCode: dto.address.postalCode,
                  }
                : {};
            if (shipsToAddress(type) && !dto.address && !order.deliveryLine1) {
                throw new BadRequestException({
                    message: "A delivery needs an address.",
                    field: "address",
                });
            }

            // The money, worked out here under the lock (ADR-008's formula,
            // as an edit works it): a registered business's prices include
            // GST, so its tax is the GST inside the new total.
            const profile = await loadTaxProfile(tx, ctx.organizationId);
            const subtotalCents = toCents(order.subtotal.toString());
            const discountCents = toCents(order.discount.toString());
            const oldTotalCents = toCents(order.total.toString());
            const totalCents = Math.max(
                0,
                subtotalCents +
                    (profile.registered ? 0 : toCents(order.tax.toString())) +
                    newShippingCents -
                    discountCents,
            );
            const differenceCents = totalCents - oldTotalCents;
            let gstCents: number | null = null;
            if (profile.registered) {
                const lines = await tx.orderItem.findMany({
                    where: { orderId: order.id },
                    select: {
                        productId: true,
                        serviceId: true,
                        quantity: true,
                        price: true,
                    },
                });
                gstCents = gstInsideOrder(
                    await withGstRates(
                        lines.map((l) => ({
                            productId: l.productId,
                            serviceId: l.serviceId,
                            quantity: l.quantity,
                            priceCents: toCents(l.price.toString()),
                        })),
                    ),
                    {
                        shippingCents: newShippingCents,
                        discountCents,
                        deliveryState: shipsToAddress(type)
                            ? (dto.address?.state ?? order.deliveryState)
                            : null,
                        profile,
                    },
                );
            }

            const paid = order.paymentStatus === "PAID";
            const payments = paid
                ? await tx.paymentIntent.findMany({
                      where: {
                          orderId: order.id,
                          organizationId: ctx.organizationId,
                          status: "SUCCEEDED",
                      },
                      select: {
                          amountCents: true,
                          refunds: {
                              where: {
                                  status: { not: "FAILED" },
                                  forEdit: true,
                              },
                              select: { amountCents: true },
                          },
                      },
                  })
                : [];
            const byHand = paid && payments.length === 0;
            if (
                paid &&
                differenceCents !== 0 &&
                !allows(ctx, "payment:manage")
            ) {
                authorize(ctx, "payment:manage");
            }
            // What to take or hand back comes from the ledger (as an edit's
            // does): an earlier edit's charge may never have been paid, and
            // it is superseded first, so one charge at most is asked for.
            let settleCents = 0;
            if (paid && !byHand) {
                await supersedeOpenDifferenceIntents(
                    tx,
                    ctx.organizationId,
                    order.id,
                );
                const kept = payments.reduce(
                    (s, p) =>
                        s +
                        p.amountCents -
                        p.refunds.reduce((r, x) => r + x.amountCents, 0),
                    0,
                );
                settleCents = totalCents - kept;
                if (settleCents <= 0) {
                    await settleSupplementaryInvoices(tx, order.id);
                }
            }

            await tx.order.update({
                where: { id: order.id },
                data: {
                    fulfilment: stored,
                    shipping: fromCents(newShippingCents),
                    total: fromCents(totalCents),
                    ...(gstCents !== null ? { tax: fromCents(gstCents) } : {}),
                    ...address,
                },
            });
            const note = `Changed from ${FULFILMENT_RULES[was].label} to ${FULFILMENT_RULES[type].label}`;
            const event = await tx.orderEvent.create({
                data: {
                    organizationId: ctx.organizationId,
                    orderId: order.id,
                    kind: "EDIT",
                    actorUserId: ctx.userId,
                    fromStage: order.stage,
                    toStage: order.stage,
                    note,
                    amountCents: differenceCents || null,
                },
                select: { id: true },
            });
            // An issued invoice is never edited (ADR-008): more delivery is
            // a supplementary invoice, less a credit note, both on it.
            // Nothing when there is no invoice yet (unpaid).
            if (paid && differenceCents !== 0) {
                await correctOrderInvoiceForEdit(tx, {
                    orderId: order.id,
                    changes: [
                        {
                            orderItemId: null,
                            productId: null,
                            description: "Delivery",
                            deltaQuantity: differenceCents > 0 ? 1 : -1,
                            unitCents: Math.abs(differenceCents),
                            rateBps: profile.deliveryRateBps,
                            code: profile.deliverySac,
                        },
                    ],
                    note,
                    createdByUserId: ctx.userId,
                    settled: byHand || settleCents <= 0,
                });
            }
            return {
                id: order.id,
                orderNumber: order.orderId,
                currency: order.currency,
                customerId: order.customerId,
                eventId: event.id,
                was,
                type,
                differenceCents,
                settleCents,
                byHand,
            };
        });

        // Handing the difference back is a provider call, which does not
        // belong inside the order's lock: made after commit, like an edit's.
        let refund: FulfilmentChangeOutcome["refund"] = null;
        let moneyError: string | null = null;
        if (result.settleCents < 0) {
            try {
                if (!this.payments) {
                    throw new Error("Payments are not available");
                }
                const r = await this.payments.refundOrderDifference(
                    ctx,
                    result.id,
                    -result.settleCents,
                    `${DIFFERENCE_KEY_PREFIX}${result.eventId}`,
                );
                refund = {
                    refundId: r.refundId,
                    amountCents: r.amountCents,
                    status: r.status,
                };
            } catch (err) {
                moneyError =
                    err instanceof Error ? err.message : "The refund failed";
                this.logger.warn(
                    `Order ${result.id} changed how it's fulfilled; handing back the difference failed: ${moneyError}`,
                );
            }
        }

        const told = dto.tell
            ? await tellOrderCustomer(
                  {
                      organizationId: ctx.organizationId,
                      actorUserId: ctx.userId,
                      customerId: result.customerId,
                      body: fulfilmentNote(result),
                      event: "ORDER_FULFILMENT_CHANGED",
                  },
                  this.logger,
              )
            : false;
        return {
            id: result.id,
            eventId: result.eventId,
            from: result.was,
            to: result.type,
            differenceCents: result.differenceCents,
            settleCents: result.settleCents,
            byHand: result.byHand,
            refund,
            moneyError,
            told,
        };
    }
}
