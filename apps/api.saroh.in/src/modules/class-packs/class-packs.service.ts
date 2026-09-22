import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { Prisma as PrismaNamespace, prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "../invoices/invoices.service";
import { paymentsOn } from "../invoices/payments-on";
import { contactName } from "../invoices/serialize";
import { fromCents, toCents } from "../invoices/totals";
import { authorize } from "../organizations/organization-policy";
import type {
    ListPacksQueryDto,
    ListPurchasesQueryDto,
    PackInputDto,
    SellPackDto,
    UsePackDto,
} from "./dto";
import { redeemPackInTx, reversePackInTx } from "./redeem-pack";

const DAY_MS = 86_400_000;
const LIST_LIMIT = 500;

function fieldError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
}

function notFound(what: string, field?: string): never {
    throw new NotFoundException(
        field
            ? { message: `${what} not found`, details: { field } }
            : `${what} not found`,
    );
}

export interface PackView {
    id: string;
    name: string;
    description: string | null;
    credits: number;
    validityDays: number;
    price: string;
    currency: string;
    status: string;
    services: { id: string; name: string }[];
    /** Purchases that still have classes and time left. */
    activeHolders: number;
    createdAt: string;
}

export type PurchaseStanding = "ACTIVE" | "USED_UP" | "EXPIRED";

export interface PurchaseView {
    id: string;
    pack: { id: string; name: string };
    contact: { id: string; name: string; email: string };
    credits: number;
    used: number;
    /** Derived: the classes it was sold with, less the ones spent and not given back. */
    left: number;
    standing: PurchaseStanding;
    price: string;
    currency: string;
    expiresAt: string;
    /** The invoice issued for it; null when sold with Payments off. */
    invoiceId: string | null;
    createdAt: string;
}

const PACK_INCLUDE = {
    services: {
        select: { service: { select: { id: true, name: true } } },
    },
} as const;

const PURCHASE_SELECT = {
    id: true,
    credits: true,
    price: true,
    currency: true,
    expiresAt: true,
    createdAt: true,
    pack: { select: { id: true, name: true } },
    contact: {
        select: { id: true, firstName: true, lastName: true, email: true },
    },
    invoices: {
        where: { status: { not: "VOID" } },
        select: { id: true },
        take: 1,
    },
    _count: { select: { redemptions: { where: { reversedAt: null } } } },
} as const;

type PurchaseRow = Prisma.PackPurchaseGetPayload<{
    select: typeof PURCHASE_SELECT;
}>;

/**
 * Class packs (ADR-007): N classes for a price, valid for D days, on the
 * services the pack names.
 *
 * A purchase snapshots the classes, price and expiry when it is sold, and
 * issues its invoice in the same transaction when Payments is on. With
 * Payments off the sale is recorded, with the price paid, and no invoice.
 *
 * The balance is never stored: it is the classes sold less the redemptions
 * not given back, so it cannot drift from the bookings.
 */
@Injectable()
export class ClassPacksService {
    constructor(private readonly invoices: InvoicesService) {}

    // — Packs ——————————————————————————————————————————————————————

    async listPacks(
        ctx: OrganizationContext,
        query: ListPacksQueryDto,
    ): Promise<PackView[]> {
        authorize(ctx, "pack:read");
        const rows = await prisma.classPack.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(query.status ? { status: query.status } : {}),
            },
            orderBy: [{ status: "asc" }, { createdAt: "asc" }],
            include: PACK_INCLUDE,
        });
        const holders = await this.activeHolders(
            ctx.organizationId,
            rows.map((r) => r.id),
        );
        return rows.map((r) => this.packView(r, holders.get(r.id) ?? 0));
    }

    async getPack(ctx: OrganizationContext, id: string): Promise<PackView> {
        authorize(ctx, "pack:read");
        return this.readPack(ctx.organizationId, id);
    }

    async createPack(
        ctx: OrganizationContext,
        dto: PackInputDto,
    ): Promise<PackView> {
        authorize(ctx, "pack:write");
        if (!dto.name) fieldError("Give the pack a name", "name");
        if (dto.credits === undefined) {
            fieldError("Say how many classes it holds", "credits");
        }
        if (dto.validityDays === undefined) {
            fieldError("Say how long it is valid", "validityDays");
        }
        if (!dto.price) fieldError("Set a price", "price");
        if (!dto.currency) fieldError("Choose a currency", "currency");
        if (!dto.serviceIds?.length) {
            fieldError("Choose the classes it pays for", "serviceIds");
        }
        const serviceIds = await this.assertServices(
            ctx.organizationId,
            dto.serviceIds,
        );
        const { name, credits, validityDays, price, currency } = dto;

        const id = await prisma.$transaction(async (tx) => {
            const created = await tx.classPack.create({
                data: {
                    organizationId: ctx.organizationId,
                    name,
                    description: dto.description ?? null,
                    credits,
                    validityDays,
                    price: fromCents(toCents(price)),
                    currency,
                },
                select: { id: true },
            });
            await tx.classPackService.createMany({
                data: serviceIds.map((serviceId) => ({
                    packId: created.id,
                    serviceId,
                    organizationId: ctx.organizationId,
                })),
            });
            return created.id;
        });
        return this.readPack(ctx.organizationId, id);
    }

    async updatePack(
        ctx: OrganizationContext,
        id: string,
        dto: PackInputDto,
    ): Promise<PackView> {
        authorize(ctx, "pack:write");
        await this.readPack(ctx.organizationId, id);
        const serviceIds = dto.serviceIds
            ? await this.assertServices(ctx.organizationId, dto.serviceIds)
            : undefined;
        if (serviceIds?.length === 0) {
            fieldError("Choose the classes it pays for", "serviceIds");
        }

        await prisma.$transaction(async (tx) => {
            await tx.classPack.updateMany({
                where: { id, organizationId: ctx.organizationId },
                data: {
                    ...(dto.name !== undefined ? { name: dto.name } : {}),
                    ...(dto.description !== undefined
                        ? { description: dto.description }
                        : {}),
                    ...(dto.credits !== undefined
                        ? { credits: dto.credits }
                        : {}),
                    ...(dto.validityDays !== undefined
                        ? { validityDays: dto.validityDays }
                        : {}),
                    ...(dto.price !== undefined
                        ? { price: fromCents(toCents(dto.price)) }
                        : {}),
                    ...(dto.currency !== undefined
                        ? { currency: dto.currency }
                        : {}),
                },
            });
            if (serviceIds) {
                // Replaced as a whole. Packs already sold follow the pack's
                // current services: a class the business stops covering is
                // not one a holder can book with.
                await tx.classPackService.deleteMany({ where: { packId: id } });
                await tx.classPackService.createMany({
                    data: serviceIds.map((serviceId) => ({
                        packId: id,
                        serviceId,
                        organizationId: ctx.organizationId,
                    })),
                });
            }
        });
        return this.readPack(ctx.organizationId, id);
    }

    /** Archived packs are not sold; everyone holding one carries on using it. */
    async setPackStatus(
        ctx: OrganizationContext,
        id: string,
        status: "ACTIVE" | "ARCHIVED",
    ): Promise<PackView> {
        authorize(ctx, "pack:write");
        await this.readPack(ctx.organizationId, id);
        await prisma.classPack.updateMany({
            where: { id, organizationId: ctx.organizationId },
            data: { status },
        });
        return this.readPack(ctx.organizationId, id);
    }

    // — Purchases ——————————————————————————————————————————————————

    /**
     * Sell a pack to a contact. The purchase keeps the pack's classes, price
     * and validity as they are now; it expires that many days from today.
     */
    async sell(
        ctx: OrganizationContext,
        packId: string,
        dto: SellPackDto,
    ): Promise<PurchaseView> {
        authorize(ctx, "pack:write");
        const organizationId = ctx.organizationId;
        const [pack, contact] = await Promise.all([
            prisma.classPack.findFirst({
                where: { id: packId, organizationId },
            }),
            prisma.contact.findFirst({
                where: { id: dto.contactId, organizationId },
                select: { id: true },
            }),
        ]);
        if (!pack) notFound("Class pack");
        if (!contact) notFound("Contact", "contactId");
        if (pack.status !== "ACTIVE") {
            throw new ConflictException(
                "That pack is archived and is not sold any more.",
            );
        }

        const price = toMoneyString(pack.price);
        const id = await prisma.$transaction(async (tx) => {
            const purchase = await tx.packPurchase.create({
                data: {
                    organizationId,
                    packId: pack.id,
                    contactId: contact.id,
                    credits: pack.credits,
                    price,
                    currency: pack.currency,
                    expiresAt: new Date(
                        Date.now() + pack.validityDays * DAY_MS,
                    ),
                    createdByUserId: ctx.userId,
                },
                select: { id: true },
            });
            if (await paymentsOn(tx, organizationId)) {
                await this.invoices.issueInTx(tx, organizationId, {
                    contactId: contact.id,
                    currency: pack.currency,
                    lines: [
                        {
                            description: `${pack.name} · ${pack.credits} ${pack.credits === 1 ? "class" : "classes"}`,
                            quantity: 1,
                            unitPrice: price,
                        },
                    ],
                    source: "PACK",
                    packPurchaseId: purchase.id,
                    createdByUserId: ctx.userId,
                });
            }
            return purchase.id;
        });
        return this.readPurchase(organizationId, id);
    }

    async listPurchases(
        ctx: OrganizationContext,
        query: ListPurchasesQueryDto,
    ): Promise<PurchaseView[]> {
        authorize(ctx, "pack:read");
        const rows = await prisma.packPurchase.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(query.contactId ? { contactId: query.contactId } : {}),
                ...(query.packId ? { packId: query.packId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: LIST_LIMIT,
            select: PURCHASE_SELECT,
        });
        const now = new Date();
        return rows.map((r) => this.purchaseView(r, now));
    }

    async getPurchase(
        ctx: OrganizationContext,
        id: string,
    ): Promise<PurchaseView> {
        authorize(ctx, "pack:read");
        return this.readPurchase(ctx.organizationId, id);
    }

    // — Using a pack on a booking ——————————————————————————————————

    /**
     * Pay a booking already made with one of its booker's packs. Needs both
     * the pack power and the booking power: it spends a class and changes
     * what the booking says about payment.
     */
    async useOnBooking(
        ctx: OrganizationContext,
        bookingId: string,
        dto: UsePackDto,
    ): Promise<{ bookingId: string; purchase: PurchaseView }> {
        authorize(ctx, "pack:write");
        authorize(ctx, "booking:write");
        const booking = await prisma.booking.findFirst({
            where: { id: bookingId, organizationId: ctx.organizationId },
            select: {
                id: true,
                status: true,
                contactId: true,
                serviceId: true,
                startAt: true,
            },
        });
        if (!booking) notFound("Booking");
        if (booking.status !== "CONFIRMED") {
            throw new ConflictException(
                "Only a confirmed booking can be paid with a class pack.",
            );
        }
        if (!booking.contactId) {
            throw new ConflictException(
                "This booking is not linked to a contact, so it has no packs to use.",
            );
        }
        const { contactId } = booking;

        // Serializable, like booking with a pack: two spends of the same
        // pack's last class — one here, one from booking — must not both
        // commit, and Postgres only catches that between serializable
        // transactions. The booking is locked too, so a cancel racing this
        // cannot leave a class spent on a cancelled booking. A lost race is
        // tried once more, so the answer says what is true now — usually
        // that the class has gone.
        const spend = () =>
            prisma.$transaction(
                async (tx) => {
                    const [locked] = await tx.$queryRaw<
                        ({ status: string } | undefined)[]
                    >`SELECT status FROM "Booking" WHERE id = ${booking.id} FOR UPDATE`;
                    if (locked?.status !== "CONFIRMED") {
                        throw new ConflictException(
                            "Only a confirmed booking can be paid with a class pack.",
                        );
                    }
                    return redeemPackInTx(tx, {
                        organizationId: ctx.organizationId,
                        bookingId: booking.id,
                        contactId,
                        serviceId: booking.serviceId,
                        startAt: booking.startAt,
                        purchaseId: dto.packPurchaseId,
                    });
                },
                {
                    isolationLevel:
                        PrismaNamespace.TransactionIsolationLevel.Serializable,
                },
            );
        const code = (err: unknown) => (err as { code?: string }).code;
        let purchaseId: string;
        try {
            try {
                ({ purchaseId } = await spend());
            } catch (err) {
                if (code(err) !== "P2034") throw err;
                ({ purchaseId } = await spend());
            }
        } catch (err) {
            // P2034 twice over, or P2002: another pack went on this booking
            // at the same moment.
            if (code(err) === "P2034" || code(err) === "P2002") {
                throw new ConflictException(
                    "That changed while you were paying. Refresh and try again.",
                );
            }
            throw err;
        }
        return {
            bookingId: booking.id,
            purchase: await this.readPurchase(ctx.organizationId, purchaseId),
        };
    }

    /** Take a pack off a booking and give its class back. */
    async removeFromBooking(
        ctx: OrganizationContext,
        bookingId: string,
    ): Promise<{ bookingId: string; returned: boolean }> {
        authorize(ctx, "pack:write");
        authorize(ctx, "booking:write");
        const booking = await prisma.booking.findFirst({
            where: { id: bookingId, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!booking) notFound("Booking");
        const returned = await prisma.$transaction((tx) =>
            reversePackInTx(tx, booking.id),
        );
        return { bookingId: booking.id, returned };
    }

    // — internals —————————————————————————————————————————————————

    /** Every service id from the client belongs to this business, or it is a 404. */
    private async assertServices(
        organizationId: string,
        ids: string[],
    ): Promise<string[]> {
        const unique = [...new Set(ids)];
        const found = await prisma.service.count({
            where: { id: { in: unique }, organizationId, deletedAt: null },
        });
        if (found !== unique.length) {
            throw new NotFoundException({
                message: "One of those services was not found",
                details: { field: "serviceIds" },
            });
        }
        return unique;
    }

    private async readPack(
        organizationId: string,
        id: string,
    ): Promise<PackView> {
        const row = await prisma.classPack.findFirst({
            where: { id, organizationId },
            include: PACK_INCLUDE,
        });
        if (!row) notFound("Class pack");
        const holders = await this.activeHolders(organizationId, [id]);
        return this.packView(row, holders.get(id) ?? 0);
    }

    private async readPurchase(
        organizationId: string,
        id: string,
    ): Promise<PurchaseView> {
        const row = await prisma.packPurchase.findFirst({
            where: { id, organizationId },
            select: PURCHASE_SELECT,
        });
        if (!row) notFound("Class pack purchase");
        return this.purchaseView(row, new Date());
    }

    /** Unexpired purchases with a class left, per pack. */
    private async activeHolders(
        organizationId: string,
        packIds: string[],
    ): Promise<Map<string, number>> {
        const counts = new Map<string, number>();
        if (packIds.length === 0) return counts;
        const rows = await prisma.packPurchase.findMany({
            where: {
                organizationId,
                packId: { in: packIds },
                expiresAt: { gt: new Date() },
            },
            select: {
                packId: true,
                credits: true,
                _count: {
                    select: { redemptions: { where: { reversedAt: null } } },
                },
            },
        });
        for (const r of rows) {
            if (r.credits - r._count.redemptions > 0) {
                counts.set(r.packId, (counts.get(r.packId) ?? 0) + 1);
            }
        }
        return counts;
    }

    private packView(
        row: {
            id: string;
            name: string;
            description: string | null;
            credits: number;
            validityDays: number;
            price: { toString(): string };
            currency: string;
            status: string;
            createdAt: Date;
            services: { service: { id: string; name: string } }[];
        },
        activeHolders: number,
    ): PackView {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            credits: row.credits,
            validityDays: row.validityDays,
            price: toMoneyString(row.price),
            currency: row.currency,
            status: row.status,
            services: row.services.map((s) => s.service),
            activeHolders,
            createdAt: row.createdAt.toISOString(),
        };
    }

    private purchaseView(row: PurchaseRow, now: Date): PurchaseView {
        const used = row._count.redemptions;
        const left = Math.max(0, row.credits - used);
        const standing: PurchaseStanding =
            row.expiresAt <= now
                ? "EXPIRED"
                : left === 0
                  ? "USED_UP"
                  : "ACTIVE";
        return {
            id: row.id,
            pack: row.pack,
            contact: {
                id: row.contact.id,
                name: contactName(row.contact),
                email: row.contact.email,
            },
            credits: row.credits,
            used,
            left,
            standing,
            price: toMoneyString(row.price),
            currency: row.currency,
            expiresAt: row.expiresAt.toISOString(),
            invoiceId: row.invoices[0]?.id ?? null,
            createdAt: row.createdAt.toISOString(),
        };
    }
}
