import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import { ActivationEvents } from "../analytics/activation-events";
import type { AppliedDiscount } from "../discounts/discounts.service";
import { DiscountsService } from "../discounts/discounts.service";
import { gstInsideOrder } from "../invoices/order-invoice";
import {
    creditRestOfOrder,
    ensureOrderInvoice,
    loadTaxProfile,
} from "../invoices/order-invoicing";
import { requireOrderRead } from "../stores/order-read-access";
import { StoresService } from "../stores/stores.service";
import type {
    CreateOrderDto,
    OrderStatus,
    PaymentStatus,
    UpdateOrderDto,
} from "./dto";
import { applyInventoryTransition, phaseOf } from "./order-inventory";
import {
    fromCents,
    priceOrderLines,
    toCents,
    withGstRates,
} from "./order-pricing";
import { stageForStatus } from "./order-stage";
import { assertPaymentTransition, assertStatusTransition } from "./order-state";
import {
    serializeOrderDetail,
    serializeOrderSummary,
    serializeOrganizationOrder,
} from "./serialize";

const CUSTOMER_SELECT = {
    select: { email: true, firstName: true, lastName: true },
} as const;

/**
 * Order management. Authorization delegates to StoresService (read = access,
 * write = canWrite). Totals are computed server-side from snapshotted product
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
     * Every order in the business, newest first — the list behind Sell →
     * Orders.
     *
     * Scoped by `organizationId` from the request context and NEVER by a store
     * id the caller sent, which is what lets one screen span storefronts
     * without becoming a way to read someone else's. `storeId` here only
     * NARROWS that set, so a tampered value can at worst return nothing.
     *
     * Returns the whole set rather than a page or a filtered slice: the tabs
     * and the search on this screen are applied over loaded rows by the shared
     * data view, which is the right trade at a merchant's volumes and is what
     * makes switching tabs instant. When a business outgrows one page this is
     * where the cursor goes, and the screen's contract does not change.
     */
    async listForOrganization(
        organizationId: string,
        filter?: { storeId?: string },
        view: { kitchenOnly?: boolean } = {},
    ) {
        const orders = await prisma.order.findMany({
            where: {
                organizationId,
                ...(filter?.storeId ? { storeId: filter.storeId } : {}),
            },
            orderBy: { createdAt: "desc" },
            include: {
                customer: CUSTOMER_SELECT,
                store: { select: { id: true, name: true } },
                _count: { select: { items: true } },
            },
        });
        return orders.map((o) => serializeOrganizationOrder(o, view));
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
        const organizationId = await this.requireWrite(storeId, userId);

        const customer = await prisma.customer.findFirst({
            where: { id: dto.customerId, storeId },
            select: { id: true },
        });
        if (!customer) {
            throw new BadRequestException({
                message: "Unknown customer",
                field: "customerId",
            });
        }
        // The same rule an edit keeps: there is nowhere to deliver to.
        if (dto.fulfilment === "DELIVERY" && !dto.address) {
            throw new BadRequestException({
                message: "A delivery needs an address.",
                field: "address",
            });
        }

        const lines = await priceOrderLines(storeId, dto.items);

        // An order is taken in its storefront's currency. The form never sent
        // one, so every order fell to the column's USD — a rupee shop's
        // takings read as dollars. Once a storefront has chosen a currency,
        // an order in any other is refused rather than silently mixed in.
        const settings = await prisma.storeSettings.findUnique({
            where: { storeId },
            select: { currency: true },
        });
        if (
            settings &&
            dto.currency !== undefined &&
            dto.currency !== settings.currency
        ) {
            throw new BadRequestException({
                message: `This storefront takes orders in ${settings.currency}.`,
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
                deliveryState:
                    dto.fulfilment === "DELIVERY"
                        ? (dto.address?.state ?? null)
                        : null,
                profile,
            });
        }

        const data = {
            storeId,
            organizationId,
            customerId: dto.customerId,
            currency,
            subtotal: fromCents(subtotalCents),
            tax: fromCents(taxCents),
            shipping: fromCents(shippingCents),
            discount: fromCents(discountCents),
            total: fromCents(totalCents),
            // The kitchen flow (ADR-008): collected unless said otherwise.
            fulfilment: dto.fulfilment ?? "COLLECT",
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

        // Assign a per-store order number with a retry on the rare race where
        // two orders claim the same number (the @@unique([storeId, orderId])).
        for (let attempt = 0; attempt < 5; attempt++) {
            const count = await prisma.order.count({ where: { storeId } });
            const orderNumber = `ORD-${String(count + 1 + attempt).padStart(3, "0")}`;
            try {
                const created = await prisma.$transaction(
                    async (tx) => {
                        const { items, ...order } = await tx.order.create({
                            data: { ...data, orderId: orderNumber },
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
                        return order;
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
                return { id: created.id };
            } catch (err) {
                if (this.isUniqueOrderNumber(err) && attempt < 4) continue;
                // A serialization failure only means something on the coded
                // path: another order took the code's last use first.
                if (
                    applied &&
                    err instanceof Prisma.PrismaClientKnownRequestError &&
                    err.code === "P2034"
                ) {
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

    async updateStatus(
        storeId: string,
        orderId: string,
        userId: string,
        dto: UpdateOrderDto,
    ) {
        await this.requireWrite(storeId, userId);
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
            }

            if (statusChanging) {
                await applyInventoryTransition(
                    tx,
                    order.items,
                    phaseOf(order.status),
                    phaseOf(nextStatus),
                    userId,
                );
            }
            // The kitchen stage follows a status set here, so the next
            // kitchen step is not refused as out of step (ADR-008).
            const kitchen = statusChanging
                ? stageForStatus(nextStatus, {
                      stage: order.stage,
                      fulfilment: order.fulfilment,
                  })
                : null;
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
                await ensureOrderInvoice(tx, orderId, {
                    method: "RECORDED",
                });
            }
            if (paymentChanging && nextPayment === "REFUNDED") {
                await creditRestOfOrder(tx, orderId, "Refunded", userId);
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
     * Reading a storefront's orders — with their totals — takes `order:read`,
     * not only a way into the store (the rule is shared with the customer
     * list; see `requireOrderRead`). Without it this older read handed a
     * Member at the counter every order's prices, which the
     * organization-scoped read Order Detail uses leaves out.
     */
    private requireOrderRead(storeId: string, userId: string) {
        return requireOrderRead(this.stores, storeId, userId, "orders");
    }

    private async requireWrite(
        storeId: string,
        userId: string,
    ): Promise<string | null> {
        const writable = await this.stores.writableOrganization(
            storeId,
            userId,
        );
        if (writable === null) {
            throw new NotFoundException("Store not found");
        }
        return writable.organizationId;
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
