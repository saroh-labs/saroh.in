import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import { recordableChanges } from "../audit/audit-changes";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { UNFULFILLED_STATUSES } from "../orders/order-standing";
import { openingHoursText } from "./opening-hours-text";
import type { OpeningHoursDay, UpdateStorefrontDto } from "./storefronts.dto";

/** What the schema falls back to before a storefront ever saves settings. */
const SCHEMA_CURRENCY = "USD";

export interface StorefrontSummary {
    id: string;
    name: string;
    orderCount: number;
    kind: "SHOP" | "ONLINE";
    paused: boolean;
}

/** A payment provider the business has connected, as a storefront sees it. */
export interface StorefrontProvider {
    provider: string;
    /** CONNECTED, or DISABLED for one the business switched off. */
    status: string;
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
    /** Only a SHOP has these; an ONLINE store keeps them but shows none. */
    address: string | null;
    openingHours: OpeningHoursDay[] | null;
    collectionEnabled: boolean;
    tipsEnabled: boolean;
    guestCheckout: boolean;
    /** ISO, when paused; `null` while taking payments. */
    pausedAt: string | null;
    /** The provider this storefront's checkout names, if it names one. */
    checkoutProvider: string | null;
    /**
     * What checkout will actually charge through: the named provider, else
     * the business's only connected one, else `null` — which on screen is
     * "cannot take payments", not a blank.
     */
    effectiveProvider: string | null;
    /** Every provider the business has connected, for "Use here". */
    providers: StorefrontProvider[];
}

/**
 * Storefronts as the business sees them: every one, and the settings that
 * belong to a storefront rather than to the business.
 *
 * Scoped by the organization from the request context and nothing else — a
 * storefront id from the path only picks WHICH of the business's own
 * storefronts, so another tenant's id is a 404, never a read.
 *
 * What takes effect today: currency and tax (new orders), pausing and the
 * checkout provider (the buyer's payment path), and a shop's address and
 * hours (the buyer's receipt). Collection, tips and guest checkout are saved
 * for the customer-facing checkout that will read them; the screen says so.
 */
@Injectable()
export class StorefrontsService {
    // Optional so the unit specs build it bare; the module provides it.
    constructor(@Optional() private readonly audit?: AuditService) {}

    async list(organizationId: string): Promise<StorefrontSummary[]> {
        const stores = await prisma.store.findMany({
            where: { organizationId, deletedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                name: true,
                _count: { select: { orders: true } },
                settings: { select: { kind: true, pausedAt: true } },
            },
        });
        return stores.map((s) => ({
            id: s.id,
            name: s.name,
            orderCount: s._count.orders,
            kind: s.settings?.kind === "SHOP" ? "SHOP" : "ONLINE",
            paused: Boolean(s.settings?.pausedAt),
        }));
    }

    async get(
        organizationId: string,
        storeId: string,
    ): Promise<StorefrontSettings> {
        const store = await this.require(organizationId, storeId);
        const [settings, unfulfilled, latestOrder, providers] =
            await Promise.all([
                prisma.storeSettings.findUnique({ where: { storeId } }),
                prisma.order.count({
                    where: {
                        storeId,
                        status: { in: [...UNFULFILLED_STATUSES] },
                    },
                }),
                prisma.order.findFirst({
                    where: { storeId },
                    orderBy: { createdAt: "desc" },
                    select: { currency: true },
                }),
                prisma.merchantPaymentProvider.findMany({
                    where: { organizationId },
                    orderBy: { createdAt: "asc" },
                    select: { provider: true, status: true },
                }),
            ]);
        const connected = providers.filter((p) => p.status === "CONNECTED");
        const named = settings?.checkoutProvider ?? null;

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
            kind: settings?.kind === "SHOP" ? "SHOP" : "ONLINE",
            address: settings?.address ?? null,
            openingHours:
                (settings?.openingHours as OpeningHoursDay[] | null) ?? null,
            collectionEnabled: settings?.collectionEnabled ?? false,
            tipsEnabled: settings?.tipsEnabled ?? false,
            guestCheckout: settings?.guestCheckout ?? true,
            pausedAt: settings?.pausedAt?.toISOString() ?? null,
            paused: Boolean(settings?.pausedAt),
            checkoutProvider: named,
            effectiveProvider: named
                ? connected.some((p) => p.provider === named)
                    ? named
                    : null
                : connected.length === 1
                  ? (connected[0]?.provider ?? null)
                  : null,
            providers,
        };
    }

    /**
     * `actorUserId` is who is saving, for the audit row a change of hours
     * writes; without one (a caller that is not a person) nothing is
     * recorded.
     */
    async update(
        organizationId: string,
        storeId: string,
        dto: UpdateStorefrontDto,
        actorUserId?: string,
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

        if (dto.checkoutProvider) {
            // Only a provider this business has connected can take a
            // storefront's payments; naming any other would leave checkout
            // pointing at nothing.
            const row = await prisma.merchantPaymentProvider.findUnique({
                where: {
                    organizationId_provider: {
                        organizationId,
                        provider: dto.checkoutProvider,
                    },
                },
                select: { status: true },
            });
            if (row?.status !== "CONNECTED") {
                throw new BadRequestException({
                    message:
                        "Connect that provider for the business before a storefront can use it.",
                    field: "checkoutProvider",
                });
            }
        }
        if (dto.openingHours) {
            const backwards = dto.openingHours.find(
                (d) => !d.closed && d.open >= d.close,
            );
            if (backwards) {
                throw new BadRequestException({
                    message: "A day has to close after it opens.",
                    field: "openingHours",
                });
            }
        }

        const settings = {
            ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
            ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
            ...(dto.address !== undefined
                ? { address: dto.address === "" ? null : dto.address }
                : {}),
            ...(dto.openingHours !== undefined
                ? {
                      openingHours: dto.openingHours.map((d) => ({
                          day: d.day,
                          open: d.open,
                          close: d.close,
                          closed: d.closed,
                      })),
                  }
                : {}),
            ...(dto.collectionEnabled !== undefined
                ? { collectionEnabled: dto.collectionEnabled }
                : {}),
            ...(dto.tipsEnabled !== undefined
                ? { tipsEnabled: dto.tipsEnabled }
                : {}),
            ...(dto.guestCheckout !== undefined
                ? { guestCheckout: dto.guestCheckout }
                : {}),
            // Pausing twice keeps the first time it was paused.
            ...(dto.paused !== undefined
                ? {
                      pausedAt: dto.paused
                          ? current.pausedAt
                              ? new Date(current.pausedAt)
                              : new Date()
                          : null,
                  }
                : {}),
            ...(dto.checkoutProvider !== undefined
                ? {
                      checkoutProvider:
                          dto.checkoutProvider === ""
                              ? null
                              : dto.checkoutProvider,
                  }
                : {}),
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

        const saved = await this.get(organizationId, storeId);
        if (dto.openingHours !== undefined && actorUserId) {
            await this.recordHours(organizationId, actorUserId, current, saved);
        }
        return saved;
    }

    /**
     * A change of opening hours in Settings › Activity (#509): the week
     * before and after, as text, and which storefront. A save that leaves
     * the week as it was records nothing.
     */
    private async recordHours(
        organizationId: string,
        actorUserId: string,
        before: StorefrontSettings,
        after: StorefrontSettings,
    ): Promise<void> {
        const changes = recordableChanges([
            {
                field: "openingHours",
                before: openingHoursText(before.openingHours),
                after: openingHoursText(after.openingHours),
            },
        ]);
        if (changes.length === 0) return;
        await this.audit?.record({
            action: AuditAction.StorefrontHoursUpdate,
            actorUserId,
            organizationId,
            targetType: "storefront",
            targetId: after.id,
            outcome: AuditOutcome.Success,
            metadata: {
                fields: ["openingHours"],
                storefront: after.name,
                changes: changes as unknown as Prisma.InputJsonArray,
            },
        });
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
