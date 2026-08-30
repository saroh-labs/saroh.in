import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

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
import { serializeOrderDetail, serializeOrderSummary } from "./serialize";

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
    constructor(private readonly stores: StoresService) {}

    async list(storeId: string, userId: string) {
        await this.stores.getForUser(storeId, userId);
        const orders = await prisma.order.findMany({
            where: { storeId },
            orderBy: { createdAt: "desc" },
            include: { customer: CUSTOMER_SELECT },
        });
        return orders.map(serializeOrderSummary);
    }

    async get(storeId: string, orderId: string, userId: string) {
        await this.stores.getForUser(storeId, userId);
        const order = await prisma.order.findFirst({
            where: { id: orderId, storeId },
            include: {
                customer: CUSTOMER_SELECT,
                items: {
                    include: { product: { select: { name: true } } },
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

        // Snapshot each line's price from its product (must be in this store).
        const lines: (OrderLine & { priceCents: number })[] = [];
        for (const item of dto.items) {
            const product = await prisma.product.findFirst({
                where: { id: item.productId, storeId },
                select: { price: true },
            });
            if (!product) {
                throw new BadRequestException({
                    message: "Unknown product in order",
                    field: "items",
                });
            }
            lines.push({
                productId: item.productId,
                quantity: item.quantity,
                priceCents: toCents(product.price.toString()),
            });
        }

        const subtotalCents = lines.reduce(
            (sum, l) => sum + l.priceCents * l.quantity,
            0,
        );
        const taxCents = toCents(dto.tax ?? "0");
        const shippingCents = toCents(dto.shipping ?? "0");
        const discountCents = toCents(dto.discount ?? "0");
        const totalCents = Math.max(
            0,
            subtotalCents + taxCents + shippingCents - discountCents,
        );

        const data = {
            storeId,
            organizationId,
            customerId: dto.customerId,
            currency: dto.currency ?? "USD",
            subtotal: fromCents(subtotalCents),
            tax: fromCents(taxCents),
            shipping: fromCents(shippingCents),
            discount: fromCents(discountCents),
            total: fromCents(totalCents),
            items: {
                create: lines.map((l) => ({
                    productId: l.productId,
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
                const created = await prisma.$transaction(async (tx) => {
                    const order = await tx.order.create({
                        data: { ...data, orderId: orderNumber },
                        select: { id: true },
                    });
                    await applyInventoryTransition(
                        tx,
                        lines,
                        "RELEASED",
                        "RESERVED",
                    );
                    return order;
                });
                return { id: created.id };
            } catch (err) {
                if (this.isUniqueOrderNumber(err) && attempt < 4) continue;
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
                items: { select: { productId: true, quantity: true } },
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
