import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { nextOrderNumberInTx, Prisma, prisma } from "@saroh/database";

import { isSerializationFailure } from "../../common/prisma-errors";
import { ActivationEvents } from "../analytics/activation-events";
import { planMeter } from "../billing/metering.service";
import { assertPlanTakesOnlinePayment } from "../billing/online-payments-plan";
import type { AppliedDiscount } from "../discounts/discounts.service";
import { DiscountsService } from "../discounts/discounts.service";
import { assertBusinessDetails } from "../invoices/business-details";
import { formatMoney } from "../invoices/invoice-send.service";
import { gstInsideOrder } from "../invoices/order-invoice";
import {
    creditRestOfOrder,
    ensureOrderInvoice,
    loadTaxProfile,
} from "../invoices/order-invoicing";
import { assertPaymentsOn } from "../invoices/payments-on";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { requireOrderRead } from "../stores/order-read-access";
import { StoresService } from "../stores/stores.service";
import type {
    CreateOrderDto,
    OrderStatus,
    PaymentStatus,
    UpdateOrderDto,
} from "./dto";
import {
    assertItemsAllow,
    shipsToAddress,
    storedValueFor,
    typeOf,
} from "./fulfilment";
import {
    heldCents,
    markedPaidNote,
    recordPaidByHandInTx,
    refundedByHandNote,
} from "./hand-payments";
import {
    assertHandedOver,
    assertOneParty,
    assertStorefrontOffers,
    cashReceivedCents,
    handOverAtCounterInTx,
    isCounterPayment,
    newOrderLines,
    orderPartyInTx,
    storefrontOffers,
    takeCounterPaymentInTx,
} from "./new-order";
import { applyInventoryTransition, phaseOf } from "./order-inventory";
import type { OrderListCaller, OrderListQuery } from "./order-list";
import { listOrderRows } from "./order-list";
import { orderFilterOptions, searchOrderProducts } from "./order-list-options";
import { retireOrderPayLinkInTx } from "./order-pay-link";
import { issueOrderPayLinkInTx } from "./order-pay-link.service";
import {
    fromCents,
    priceOrderLines,
    toCents,
    withGstRates,
} from "./order-pricing";
import { stageForStatus } from "./order-stage";
import { assertPaymentTransition, assertStatusTransition } from "./order-state";
import { assertNotPayingOnlineInTx } from "./payment-in-flight";
import { serializeOrderDetail, serializeOrderSummary } from "./serialize";
import { orderMoneyIntents } from "./treatment-ledger";

const CUSTOMER_SELECT = {
    select: { email: true, firstName: true, lastName: true },
} as const;

/** What a store-scoped order write says to a role without its power (B16). */
const ORDER_WRITE_REFUSAL = {
    "order:create": "Your role can't take new orders.",
    "order:edit": "Your role can't change orders.",
    "order:refund": "Your role can't refund or cancel orders.",
} as const;

/**
 * Order management. Authorization delegates to StoresService (read = access;
 * writes = the order power each asks, `requireOrderWrite`, B16). Totals are computed server-side from snapshotted product
 * prices; inventory is reserved on create and committed/released on status
 * change — all inside one transaction so stock and order stay consistent.
 */
@Injectable()
export class OrdersService {
    constructor(
        private readonly stores: StoresService,
        // @Optional for the same reason ModuleLifecycleService's is: this
        // service is also constructed directly in DB-backed specs, which pass
        // only what they exercise. Requiring it made every such construction
        // throw on first write. `app.bootstrap.spec` asserts it IS resolved in
        // the real graph, so optional here cannot become silently inert (#176).
        @Optional() private readonly activation?: ActivationEvents,
        // Optional for the same DB-backed specs. An order that names a code
        // when this is missing is REFUSED below, never created at full price.
        @Optional() private readonly discounts?: DiscountsService,
    ) {}

    async list(storeId: string, userId: string) {
        await this.requireOrderRead(storeId, userId);
        const orders = await prisma.order.findMany({
            where: { storeId },
            orderBy: { createdAt: "desc" },
            include: { customer: CUSTOMER_SELECT },
        });
        return orders.map(serializeOrderSummary);
    }

    /**
     * The Orders list (plan B, B1): filtered, paged and counted by the API,
     * with money only for `order:read` and a customer's phone and email only
     * for `contact:read`. Scoped by `organizationId` from the request context
     * and NEVER by a store id the caller sent: `storeId` and every other
     * filter only NARROW inside the organization, so a tampered value can at
     * worst return nothing. See `order-list.ts`.
     *
     * With the caller (`viewer`), each row carries the customer's Needs
     * attention as they may see it, and the filter reads the same (B15).
     */
    listRows(
        organizationId: string,
        query: OrderListQuery,
        caller: OrderListCaller,
    ) {
        return listOrderRows(organizationId, query, caller);
    }

    /**
     * What the Orders list's filter bar offers (B4): the ways and steps the
     * business's orders show, and the name of the product a link names.
     * See `order-list-options.ts`.
     */
    filterOptions(organizationId: string, productId?: string) {
        return orderFilterOptions(organizationId, productId);
    }

    /** The product picker's search (B4), over products on real orders. */
    searchProducts(organizationId: string, q?: string) {
        return searchOrderProducts(organizationId, q);
    }

    async get(storeId: string, orderId: string, userId: string) {
        await this.requireOrderRead(storeId, userId);
        const order = await prisma.order.findFirst({
            where: { id: orderId, storeId },
            include: {
                customer: CUSTOMER_SELECT,
                items: {
                    include: {
                        product: { select: { name: true } },
                        // A treatment's line names its service (E9).
                        service: { select: { name: true } },
                        variant: { select: { title: true } },
                    },
                },
                discountRedemption: {
                    select: {
                        code: true,
                        kind: true,
                        percentBps: true,
                        ruleAmount: true,
                        currency: true,
                    },
                },
            },
        });
        if (!order) {
            throw new NotFoundException("Order not found");
        }
        return serializeOrderDetail(order);
    }

    async create(storeId: string, userId: string, dto: CreateOrderDto) {
        const organizationId = await this.requireOrderWrite(
            storeId,
            userId,
            "order:create",
        );
        // Who it is for, and how it is paid (B13): checked before anything
        // is priced, so a request that can't be served costs nothing.
        assertOneParty(dto);
        await this.assertNewOrderAllowed(storeId, userId, organizationId, dto);
        // Either vocabulary in; only what this release may write is stored
        // (fulfilment.ts: SHIPPING and the rest are refused until B2c).
        const type = typeOf(dto.fulfilment ?? "PICKUP");
        const fulfilment = storedValueFor(type);
        // The same rule an edit keeps: there is nowhere to deliver to.
        if (shipsToAddress(type) && !dto.address) {
            throw new BadRequestException({
                message: "A delivery needs an address.",
                field: "address",
            });
        }

        const lines = await priceOrderLines(storeId, dto.items);
        // A product that lists how it may leave refuses any other way (B12).
        assertItemsAllow(lines, type);

        // An order is taken in its storefront's currency. The form never sent
        // one, so every order fell to the column's USD — a rupee shop's
        // takings read as dollars. Once a storefront has chosen a currency,
        // an order in any other is refused rather than silently mixed in.
        const settings = await prisma.storeSettings.findUnique({
            where: { storeId },
            select: {
                currency: true,
                fulfilmentTypes: true,
                collectionEnabled: true,
                shippingEnabled: true,
            },
        });
        // And a way the storefront offers (B13): New order v2 offers only
        // those, so anything else is a forged request. A request from before
        // v2 (no `payment`) is served as it was, whatever way it names.
        if (dto.payment !== undefined) {
            assertStorefrontOffers(type, storefrontOffers(settings));
        }
        if (
            settings &&
            dto.currency !== undefined &&
            dto.currency !== settings.currency
        ) {
            throw new BadRequestException({
                message: `This location takes orders in ${settings.currency}.`,
                field: "currency",
            });
        }
        const currency = settings?.currency ?? dto.currency ?? "USD";

        const subtotalCents = lines.reduce(
            (sum, l) => sum + l.priceCents * l.quantity,
            0,
        );
        // A GST-registered business's prices include GST: the storefront's
        // add-on tax is ignored, and `tax` records the GST inside the total
        // instead of adding to it (ADR-008).
        const profile = organizationId
            ? await loadTaxProfile(prisma, organizationId)
            : null;
        const registered = profile?.registered ?? false;
        let taxCents = registered ? 0 : toCents(dto.tax ?? "0");
        const shippingCents = toCents(dto.shipping ?? "0");
        // A code and a typed amount are mutually exclusive: two answers to
        // "why did this come off" would leave no way to tell which was meant.
        // The form sends "0" for an untouched amount, so zero is no amount.
        let applied: AppliedDiscount | null = null;
        if (dto.discountCode) {
            if (toCents(dto.discount ?? "0") > 0) {
                throw new BadRequestException({
                    message:
                        "Use a discount code or type an amount off, not both.",
                    details: { field: "discountCode" },
                });
            }
            if (!this.discounts) {
                throw new BadRequestException({
                    message: "Discount codes cannot be applied right now.",
                    details: { field: "discountCode" },
                });
            }
            applied = await this.discounts.redeemForOrder(
                organizationId,
                dto.discountCode,
                {
                    storeId,
                    currency,
                    lines: lines.map((l) => ({
                        productId: l.productId,
                        categoryId: l.categoryId,
                        unitCents: l.priceCents,
                        quantity: l.quantity,
                    })),
                },
            );
        }
        const discountCents = applied
            ? applied.amountCents
            : toCents(dto.discount ?? "0");
        const totalCents = Math.max(
            0,
            subtotalCents + taxCents + shippingCents - discountCents,
        );
        if (registered && profile) {
            taxCents = gstInsideOrder(await withGstRates(lines), {
                shippingCents,
                discountCents,
                deliveryState: shipsToAddress(type)
                    ? (dto.address?.state ?? null)
                    : null,
                profile,
            });
        }

        // Handed over now (UX-059): paid at the counter, picked up there.
        assertHandedOver({
            handedOver: dto.handedOver,
            payment: dto.payment ?? null,
            fulfilment: type,
        });

        // Paid at the counter (B13): cash short of the total is refused.
        const counter =
            dto.payment && isCounterPayment(dto.payment.kind)
                ? {
                      kind: dto.payment.kind,
                      receivedCents:
                          dto.payment.kind === "CASH"
                              ? cashReceivedCents(
                                    dto.payment.received,
                                    totalCents,
                                    (cents) =>
                                        formatMoney(fromCents(cents), currency),
                                )
                              : null,
                  }
                : null;

        const data = {
            storeId,
            organizationId,
            currency,
            subtotal: fromCents(subtotalCents),
            tax: fromCents(taxCents),
            shipping: fromCents(shippingCents),
            discount: fromCents(discountCents),
            total: fromCents(totalCents),
            // The kitchen flow (ADR-008): picked up unless said otherwise.
            fulfilment,
            notes: dto.notes ?? null,
            ...(dto.address
                ? {
                      deliveryName: dto.address.name ?? null,
                      deliveryPhone: dto.address.phone ?? null,
                      deliveryLine1: dto.address.line1,
                      deliveryLine2: dto.address.line2 ?? null,
                      deliveryCity: dto.address.city,
                      deliveryState: dto.address.state,
                      deliveryPostalCode: dto.address.postalCode,
                  }
                : {}),
            items: {
                create: lines.map((l) => ({
                    productId: l.productId,
                    variantId: l.variantId ?? null,
                    quantity: l.quantity,
                    price: fromCents(l.priceCents),
                })),
            },
        };

        // Numbered in the business's one series (P3, DEC-066), whichever
        // storefront takes it. A storefront is always a business's.
        const numberingOrg =
            organizationId ??
            (
                await prisma.store.findUniqueOrThrow({
                    where: { id: storeId },
                    select: { organizationId: true },
                })
            ).organizationId;

        // Retried when an order the API before P3 numbered took the number
        // (the @@unique([storeId, orderId])), or a concurrent order's number
        // broke a coded order's serializable transaction.
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const created = await prisma.$transaction(
                    async (tx) => {
                        // The plan's monthly orders cap (U13): an order
                        // taken by hand is refused at it, before anything
                        // is written. The site's checkout never is (OQ-8).
                        await planMeter.roomInTx(tx, numberingOrg, "orders");
                        // Found or made in this transaction: an order that
                        // fails leaves no customer behind (B13).
                        const party = await orderPartyInTx(tx, {
                            storeId,
                            organizationId,
                            userId,
                            dto,
                        });
                        const orderNumber = await nextOrderNumberInTx(
                            tx,
                            numberingOrg,
                        );
                        const { items, ...order } = await tx.order.create({
                            data: { ...data, ...party, orderId: orderNumber },
                            select: {
                                id: true,
                                items: {
                                    select: {
                                        id: true,
                                        productId: true,
                                        variantId: true,
                                        quantity: true,
                                    },
                                },
                            },
                        });
                        await applyInventoryTransition(
                            tx,
                            items,
                            "RELEASED",
                            "RESERVED",
                        );
                        if (applied) {
                            await this.recordRedemption(
                                tx,
                                applied,
                                order.id,
                                organizationId,
                                currency,
                            );
                        }
                        // Paid now at the counter, or its pay link (B11)
                        // made with it: one or the other, or neither
                        // (pay later).
                        if (counter) {
                            await takeCounterPaymentInTx(tx, {
                                orderId: order.id,
                                organizationId,
                                userId,
                                kind: counter.kind,
                                receivedCents: counter.receivedCents,
                                at: new Date(),
                            });
                            if (dto.handedOver) {
                                await handOverAtCounterInTx(tx, {
                                    orderId: order.id,
                                    organizationId,
                                    userId,
                                });
                            }
                        }
                        const payLink =
                            dto.payment?.kind === "LINK" && organizationId
                                ? await issueOrderPayLinkInTx(
                                      tx,
                                      organizationId,
                                      order.id,
                                  )
                                : null;
                        // The team's "New order" (F14), with the order.
                        if (organizationId) {
                            await enqueueTeamAlert(tx, organizationId, {
                                event: "order",
                                orderId: order.id,
                                actorUserId: userId,
                            });
                        }
                        return { ...order, payLink };
                    },
                    // Serializable ONLY for an order carrying a code: the
                    // cap re-count inside must see a concurrent redemption.
                    // Applied to every order it would make two ordinary
                    // orders in one store abort each other.
                    //
                    // NB: the RLS proxy forwards these options only when no
                    // org context is active. OrdersController has no
                    // OrganizationGuard today, so this takes effect — adding
                    // that guard would silently drop it.
                    applied
                        ? {
                              isolationLevel:
                                  Prisma.TransactionIsolationLevel.Serializable,
                          }
                        : undefined,
                );
                if (organizationId) {
                    // Safe on every order: the ledger keeps only the first
                    // (deterministic dedupeKey), so no "is this their first?"
                    // query and no race between concurrent creates.
                    await this.activation?.firstOrderCreated(
                        organizationId,
                        created.id,
                    );
                }
                // The business rides along with a pay link, so the
                // controller can put it on the business's own address
                // (DEC-069, L7).
                return created.payLink && organizationId
                    ? {
                          id: created.id,
                          organizationId,
                          payLink: created.payLink,
                      }
                    : { id: created.id };
            } catch (err) {
                if (this.isUniqueOrderNumber(err) && attempt < 4) continue;
                // A serialization failure only happens on the coded path:
                // another order took the code's last use first — which the
                // next attempt's re-count says in its own words — or took
                // the business's next number (P3). Tried again first.
                if (applied && isSerializationFailure(err) && attempt < 4) {
                    continue;
                }
                if (applied && isSerializationFailure(err)) {
                    throw new ConflictException({
                        message: `${applied.code} was just used by another order. Try again, or remove it.`,
                        details: { field: "discountCode" },
                    });
                }
                throw err;
            }
        }
        throw new BadRequestException("Could not allocate an order number");
    }

    /** New order's lines (B13): see `new-order.ts`. */
    async newOrderLines(storeId: string, userId: string, productIds: string[]) {
        await this.requireOrderWrite(storeId, userId, "order:create");
        return newOrderLines(storeId, productIds);
    }

    async updateStatus(
        storeId: string,
        orderId: string,
        userId: string,
        dto: UpdateOrderDto,
    ) {
        // Recording a status or a payment by hand is a change to the order
        // (`order:edit`); cancelling it or recording money handed back is
        // `order:refund`'s (B16, matrix §2). Both asked when both are sent.
        const refunds =
            dto.status === "CANCELLED" || dto.paymentStatus === "REFUNDED";
        const edits =
            (dto.status !== undefined && dto.status !== "CANCELLED") ||
            (dto.paymentStatus !== undefined &&
                dto.paymentStatus !== "REFUNDED");
        if (refunds) {
            await this.requireOrderWrite(storeId, userId, "order:refund");
        }
        if (edits || !refunds) {
            await this.requireOrderWrite(storeId, userId, "order:edit");
        }
        const nextStatus = dto.status;
        const nextPayment = dto.paymentStatus;

        await prisma.$transaction(async (tx) => {
            // Lock order (#511): the Order, then its StockLevel rows — the
            // order a refund settling and a cancel both take. The order is
            // read under its lock, so two status changes take turns and each
            // moves stock from where the other left it.
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "storeId" = ${storeId} FOR UPDATE`;
            const order = await tx.order.findFirst({
                where: { id: orderId, storeId },
                select: {
                    id: true,
                    status: true,
                    paymentStatus: true,
                    stage: true,
                    fulfilment: true,
                    organizationId: true,
                    items: { select: { id: true } },
                },
            });
            if (!order) {
                throw new NotFoundException("Order not found");
            }
            const statusChanging =
                nextStatus != null && nextStatus !== order.status;

            // Guard the lifecycle BEFORE any write: an illegal status/payment
            // move throws 400 (naming the from→to) and nothing is persisted.
            // Same→same is a no-op (not "changing"), so it is never asserted
            // — re-PATCHing an unchanged status stays idempotent.
            if (nextStatus != null && nextStatus !== order.status) {
                assertStatusTransition(order.status as OrderStatus, nextStatus);
            }
            if (nextPayment != null && nextPayment !== order.paymentStatus) {
                assertPaymentTransition(
                    order.paymentStatus as PaymentStatus,
                    nextPayment,
                );
                // Not while the customer is paying it online (#622): the
                // payment landing next would bill the order a second time.
                if (nextPayment === "PAID") {
                    await assertNotPayingOnlineInTx(tx, orderId);
                }
            }

            // The kitchen stage follows a status set here, so the next
            // kitchen step is not refused as out of step (ADR-008). Worked
            // out before any write: a status the order's type has no step
            // for (a pick-up order SHIPPED) is refused, never turned into
            // another kind of order.
            const kitchen = statusChanging
                ? stageForStatus(nextStatus, {
                      stage: order.stage,
                      fulfilment: order.fulfilment,
                  })
                : null;
            if (statusChanging) {
                await applyInventoryTransition(
                    tx,
                    order.items,
                    phaseOf(order.status),
                    phaseOf(nextStatus),
                    userId,
                );
            }
            await tx.order.update({
                where: { id: orderId },
                data: {
                    ...(dto.status ? { status: dto.status } : {}),
                    ...(dto.paymentStatus
                        ? { paymentStatus: dto.paymentStatus }
                        : {}),
                    ...(kitchen ?? {}),
                },
            });
            // Paid by hand (pay later, cash at the counter): the order's
            // invoice is made now, once — the same one a payment webhook
            // would have made (ADR-008). Refunded by hand: what is left of
            // it is credited.
            const paymentChanging =
                nextPayment != null && nextPayment !== order.paymentStatus;
            if (paymentChanging && nextPayment === "PAID") {
                const byHandCents = await recordPaidByHandInTx(tx, orderId);
                // How it was paid (#834) is kept on the invoice, the
                // payment's record (DEC-023); an app before it sends none.
                await ensureOrderInvoice(tx, orderId, {
                    method: dto.paidHow ?? "RECORDED",
                });
                if (order.organizationId) {
                    // On the timeline, with no amount in the note; the
                    // step's amount says it to a money reader.
                    await tx.orderEvent.create({
                        data: {
                            organizationId: order.organizationId,
                            orderId,
                            kind: "STATUS",
                            actorUserId: userId,
                            fromStatus: null,
                            toStatus: null,
                            note: markedPaidNote(dto.paidHow),
                            amountCents: byHandCents,
                        },
                    });
                }
            }
            if (paymentChanging && nextPayment === "REFUNDED") {
                // What it held, read before the credit note: the step on the
                // timeline says how much went back, and how (UX-061).
                const [held, paid] = await Promise.all([
                    tx.order.findUniqueOrThrow({
                        where: { id: orderId },
                        select: { total: true, paidByHand: true },
                    }),
                    tx.paymentIntent.findMany({
                        where: {
                            ...orderMoneyIntents(orderId),
                            status: "SUCCEEDED",
                        },
                        select: {
                            amountCents: true,
                            refunds: {
                                where: { status: { not: "FAILED" } },
                                select: { amountCents: true },
                            },
                        },
                    }),
                ]);
                await creditRestOfOrder(tx, orderId, "Refunded", userId);
                if (order.organizationId) {
                    await tx.orderEvent.create({
                        data: {
                            organizationId: order.organizationId,
                            orderId,
                            kind: "REFUND",
                            actorUserId: userId,
                            note: refundedByHandNote(dto.refundedHow),
                            amountCents: heldCents({
                                ...held,
                                paymentStatus: order.paymentStatus,
                                paymentIntents: paid,
                            }),
                        },
                    });
                }
            }
            // Cancelled, refunded or paid at the counter: its pay link stops
            // working (B11, DEC-067), so nobody can pay twice. The page says
            // the link is no longer needed; a balance later owed gets a new
            // link.
            if (
                (statusChanging && nextStatus === "CANCELLED") ||
                (paymentChanging &&
                    (nextPayment === "REFUNDED" || nextPayment === "PAID"))
            ) {
                await retireOrderPayLinkInTx(tx, orderId);
            }
            if (statusChanging && order.organizationId) {
                // On the order's timeline too, as a step outside the kitchen.
                await tx.orderEvent.create({
                    data: {
                        organizationId: order.organizationId,
                        orderId,
                        kind: "STATUS",
                        actorUserId: userId,
                        fromStage: order.stage,
                        toStage: kitchen?.stage ?? order.stage,
                        fromStatus: order.status,
                        toStatus: nextStatus,
                    },
                });
            }
        });
        return { id: orderId };
    }

    /**
     * Assert write access AND return the owning Organization id, so every
     * create in this service can stamp `organizationId` (#173). Returning it
     * here rather than looking it up at each call site makes the stamp hard to
     * forget: the guard you must call already hands you the value.
     */
    /**
     * The redemption, inside the order's own transaction: a failed order
     * leaves none behind, and the unique order id keeps a retried create
     * from counting twice. It snapshots the rule it applied, so re-rating
     * the code later cannot rewrite this order's history.
     */
    private async recordRedemption(
        tx: Prisma.TransactionClient,
        applied: AppliedDiscount,
        orderId: string,
        organizationId: string | null,
        currency: string,
    ): Promise<void> {
        if (!organizationId) {
            // redeemForOrder already refused this; the type needs saying so.
            throw new BadRequestException("A code needs a business");
        }
        if (applied.usageLimit !== null) {
            // Re-counted INSIDE the serializable transaction, so two orders
            // racing for the last use cannot both see room for it.
            const used = await tx.discountRedemption.count({
                where: { discountId: applied.discountId },
            });
            if (used >= applied.usageLimit) {
                throw new ConflictException({
                    message: `${applied.code} has been used as many times as it allows.`,
                    details: { field: "discountCode" },
                });
            }
        }
        await tx.discountRedemption.create({
            data: {
                organizationId,
                discountId: applied.discountId,
                orderId,
                amount: fromCents(applied.amountCents),
                currency,
                code: applied.code,
                kind: applied.kind,
                percentBps: applied.percentBps,
                ruleAmount: applied.ruleAmount,
            },
        });
    }

    /**
     * What New order v2 asks beyond writing to the storefront (B13): a
     * picked person is read by their email, which takes `contact:read` (as
     * the search that found them does); a pay link takes `order:create`
     * (B16) and a business that takes payments (B11).
     */
    private async assertNewOrderAllowed(
        storeId: string,
        userId: string,
        organizationId: string | null,
        dto: CreateOrderDto,
    ): Promise<void> {
        if (
            dto.contactId &&
            !(await this.stores.memberAllows(storeId, userId, "contact:read"))
        ) {
            throw new ForbiddenException(
                "Your role can't look customers up. Take it as a walk-in, or add them by email.",
            );
        }
        if (dto.payment?.kind !== "LINK") return;
        if (!organizationId) {
            throw new BadRequestException("A pay link needs a business.");
        }
        if (
            !(await this.stores.memberAllows(storeId, userId, "order:create"))
        ) {
            throw new ForbiddenException(
                "Your role can't make a pay link. Take the payment at the counter, or leave it to pay later.",
            );
        }
        await assertPaymentsOn(prisma, organizationId, "make a pay link");
        // A pay link charges online: the plan's too (403 MODULE_LOCKED).
        await assertPlanTakesOnlinePayment(organizationId);
        // A pay link takes money online: the business details first
        // (DEC-068), before the order is made.
        await assertBusinessDetails(prisma, organizationId);
    }

    /**
     * Reading a storefront's orders — with their totals — takes `order:read`,
     * not only a way into the store (the rule is shared with the customer
     * list; see `requireOrderRead`). Without it this older read handed a
     * Member at the counter every order's prices, which the
     * organization-scoped read Order Detail uses leaves out.
     */
    private requireOrderRead(storeId: string, userId: string) {
        return requireOrderRead(this.stores, storeId, userId, "orders");
    }

    /**
     * A store-scoped order write (B16): the owning Organization when the
     * caller may take `action` on this storefront's orders (see
     * `StoresService.orderWriteOrganization`). A storefront they can't reach
     * stays a 404, so nothing says it exists; one they can reach, without
     * the power, is a 403 in words.
     */
    private async requireOrderWrite(
        storeId: string,
        userId: string,
        action: "order:create" | "order:edit" | "order:refund",
    ): Promise<string | null> {
        const writable = await this.stores.orderWriteOrganization(
            storeId,
            userId,
            action,
        );
        if (writable !== null) return writable.organizationId;
        await this.stores.getForUser(storeId, userId);
        throw new ForbiddenException(ORDER_WRITE_REFUSAL[action]);
    }

    private isUniqueOrderNumber(err: unknown): boolean {
        return (
            typeof err === "object" &&
            err !== null &&
            "code" in err &&
            (err as { code?: string }).code === "P2002"
        );
    }
}
