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
import { StoresService } from "../stores/stores.service";
import type {
    CreateOrderDto,
    OrderStatus,
    PaymentStatus,
    UpdateOrderDto,
} from "./dto";
import type { OrderLine } from "./order-inventory";
import { applyInventoryTransition, phaseOf } from "./order-inventory";
import { assertPaymentTransition, assertStatusTransition } from "./order-state";
import {
    serializeOrderDetail,
    serializeOrderSummary,
    serializeOrganizationOrder,
} from "./serialize";

/** Money helpers — integer-cents math so totals never drift on floats. */
const toCents = (s: string) => Math.round(Number(s) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

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
        await this.stores.getForUser(storeId, userId);
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
        return orders.map(serializeOrganizationOrder);
    }

    async get(storeId: string, orderId: string, userId: string) {
        await this.stores.getForUser(storeId, userId);
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

        // Snapshot each line's price from what was bought: the variant's own
        // price when it has one, else the product's. A product with variants
        // is bought as one of them, so its line must say which.
        const lines: (Omit<OrderLine, "id"> & {
            priceCents: number;
            categoryId: string | null;
        })[] = [];
        for (const item of dto.items) {
            const product = await prisma.product.findFirst({
                where: { id: item.productId, storeId },
                // The category too: a collection code matches on it.
                select: {
                    name: true,
                    price: true,
                    categoryId: true,
                    variants: { select: { id: true, price: true } },
                },
            });
            if (!product) {
                throw new BadRequestException({
                    message: "Unknown product in order",
                    field: "items",
                });
            }
            let unitPrice = product.price.toString();
            let variantId: string | null = null;
            if (product.variants.length > 0) {
                const variant = product.variants.find(
                    (v) => v.id === item.variantId,
                );
                if (!variant) {
                    throw new BadRequestException({
                        message: item.variantId
                            ? `That option of ${product.name} no longer exists.`
                            : `Choose which one of ${product.name} is being bought.`,
                        field: "items",
                    });
                }
                variantId = variant.id;
                if (variant.price) unitPrice = variant.price.toString();
            } else if (item.variantId) {
                throw new BadRequestException({
                    message: `${product.name} has no options to choose from.`,
                    field: "items",
                });
            }
            lines.push({
                productId: item.productId,
                variantId,
                quantity: item.quantity,
                priceCents: toCents(unitPrice),
                categoryId: product.categoryId,
            });
        }

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
        const taxCents = toCents(dto.tax ?? "0");
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
        const order = await prisma.order.findFirst({
            where: { id: orderId, storeId },
            select: {
                id: true,
                status: true,
                paymentStatus: true,
                items: {
                    select: {
                        id: true,
                        productId: true,
                        variantId: true,
                        quantity: true,
                        stockRow: true,
                    },
                },
            },
        });
        if (!order) {
            throw new NotFoundException("Order not found");
        }

        const nextStatus = dto.status;
        const nextPayment = dto.paymentStatus;
        const statusChanging =
            nextStatus != null && nextStatus !== order.status;

        // Guard the lifecycle BEFORE any write: an illegal status/payment move
        // throws 400 (naming the from→to) and nothing is persisted. Same→same
        // is a no-op (not "changing"), so it is never asserted — re-PATCHing an
        // unchanged status stays idempotent. The inline null-checks narrow the
        // dto fields so no non-null assertion is needed.
        if (nextStatus != null && nextStatus !== order.status) {
            assertStatusTransition(order.status as OrderStatus, nextStatus);
        }
        if (nextPayment != null && nextPayment !== order.paymentStatus) {
            assertPaymentTransition(
                order.paymentStatus as PaymentStatus,
                nextPayment,
            );
        }

        await prisma.$transaction(async (tx) => {
            if (statusChanging) {
                await applyInventoryTransition(
                    tx,
                    order.items,
                    phaseOf(order.status),
                    phaseOf(dto.status as string),
                );
            }
            await tx.order.update({
                where: { id: orderId },
                data: {
                    ...(dto.status ? { status: dto.status } : {}),
                    ...(dto.paymentStatus
                        ? { paymentStatus: dto.paymentStatus }
                        : {}),
                },
            });
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
