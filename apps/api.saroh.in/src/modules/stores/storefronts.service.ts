import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import { UNFULFILLED_STATUSES } from "../orders/order-standing";
import type { UpdateStorefrontDto } from "./storefronts.dto";

/** What the schema falls back to before a storefront ever saves settings. */
const SCHEMA_CURRENCY = "USD";

export interface StorefrontSummary {
    id: string;
    name: string;
    orderCount: number;
}

export interface StorefrontSettings extends StorefrontSummary {
    currency: string;
    /**
     * Once a storefront has taken an order its currency is fixed: every order
     * already carries it, and changing it would leave totals, refunds and
     * reports in two currencies with nothing saying which is which.
     */
    currencyLocked: boolean;
    taxEnabled: boolean;
    /** A percentage, as a string: "18.00". */
    taxRate: string;
    shippingEnabled: boolean;
    /** Money, as a string; `null` when delivery is never free. */
    freeShippingThreshold: string | null;
    /** Orders still waiting to go out — closing is refused while any are. */
    unfulfilled: number;
}

/**
 * Storefronts as the business sees them: every one, and the settings that
 * belong to a storefront rather than to the business.
 *
 * Scoped by the organization from the request context and nothing else — a
 * storefront id from the path only picks WHICH of the business's own
 * storefronts, so another tenant's id is a 404, never a read.
 *
 * Only settings the schema already has are exposed. The design also draws a
 * shop-or-online kind, an address, opening hours, collection, tips, guest
 * checkout and pausing; none of those exist as columns yet, and a control
 * that saves nothing is worse than no control.
 */
@Injectable()
export class StorefrontsService {
    async list(organizationId: string): Promise<StorefrontSummary[]> {
        const stores = await prisma.store.findMany({
            where: { organizationId, deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                name: true,
                _count: { select: { orders: true } },
            },
        });
        return stores.map((s) => ({
            id: s.id,
            name: s.name,
            orderCount: s._count.orders,
        }));
    }

    async get(
        organizationId: string,
        storeId: string,
    ): Promise<StorefrontSettings> {
        const store = await this.require(organizationId, storeId);
        const [settings, unfulfilled, latestOrder] = await Promise.all([
            prisma.storeSettings.findUnique({ where: { storeId } }),
            prisma.order.count({
                where: { storeId, status: { in: [...UNFULFILLED_STATUSES] } },
            }),
            prisma.order.findFirst({
                where: { storeId },
                orderBy: { createdAt: "desc" },
                select: { currency: true },
            }),
        ]);

        return {
            id: store.id,
            name: store.name,
            orderCount: store._count.orders,
            // Before a storefront saves settings the column default is USD,
            // which is a guess about a business, not a fact. An order is a
            // fact: if one exists, its currency is the storefront's.
            currency:
                settings?.currency ?? latestOrder?.currency ?? SCHEMA_CURRENCY,
            currencyLocked: store._count.orders > 0,
            taxEnabled: settings?.taxEnabled ?? false,
            taxRate: settings ? toMoneyString(settings.taxRate) : "0.00",
            shippingEnabled: settings?.shippingEnabled ?? true,
            freeShippingThreshold: settings?.freeShippingThreshold
                ? toMoneyString(settings.freeShippingThreshold)
                : null,
            unfulfilled,
        };
    }

    async update(
        organizationId: string,
        storeId: string,
        dto: UpdateStorefrontDto,
    ): Promise<StorefrontSettings> {
        const current = await this.get(organizationId, storeId);

        if (
            dto.currency !== undefined &&
            dto.currency !== current.currency &&
            current.currencyLocked
        ) {
            throw new ConflictException({
                message:
                    "This storefront has taken orders in " +
                    current.currency +
                    ", so its currency cannot change.",
                field: "currency",
            });
        }

        const settings = {
            ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
            ...(dto.taxEnabled !== undefined
                ? { taxEnabled: dto.taxEnabled }
                : {}),
            ...(dto.taxRate !== undefined ? { taxRate: dto.taxRate } : {}),
            ...(dto.shippingEnabled !== undefined
                ? { shippingEnabled: dto.shippingEnabled }
                : {}),
            ...(dto.freeShippingThreshold !== undefined
                ? { freeShippingThreshold: dto.freeShippingThreshold }
                : {}),
        };

        await prisma.$transaction(async (tx) => {
            if (dto.name !== undefined) {
                await tx.store.update({
                    where: { id: storeId },
                    data: { name: dto.name },
                });
            }
            if (Object.keys(settings).length > 0) {
                // Created on first save, carrying the currency the storefront
                // already reads as — otherwise the first unrelated save would
                // quietly reset it to the column default.
                await tx.storeSettings.upsert({
                    where: { storeId },
                    create: {
                        storeId,
                        currency: current.currency,
                        ...settings,
                    },
                    update: settings,
                });
            }
        });

        return this.get(organizationId, storeId);
    }

    /**
     * Close a storefront permanently.
     *
     * Refused while any of its orders are still waiting to go out: closing
     * the place a customer bought from, with their order unshipped, leaves
     * that order with nowhere to be worked on. Its orders, customers and
     * products are kept — the storefront is soft-deleted, not erased.
     */
    async close(organizationId: string, storeId: string): Promise<void> {
        const current = await this.get(organizationId, storeId);
        if (current.unfulfilled > 0) {
            throw new BadRequestException(
                current.unfulfilled === 1
                    ? "One order here is still waiting to go out. Fulfil or cancel it first."
                    : `${current.unfulfilled} orders here are still waiting to go out. Fulfil or cancel them first.`,
            );
        }
        await prisma.store.update({
            where: { id: storeId },
            data: { deletedAt: new Date() },
        });
    }

    private async require(organizationId: string, storeId: string) {
        const store = await prisma.store.findFirst({
            where: { id: storeId, organizationId, deletedAt: null },
            select: {
                id: true,
                name: true,
                _count: { select: { orders: true } },
            },
        });
        if (!store) throw new NotFoundException("Storefront not found");
        return store;
    }
}
