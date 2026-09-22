import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";

type Tx = Prisma.TransactionClient;

/** What a booking asks of a pack. */
export interface RedeemInput {
    organizationId: string;
    bookingId: string;
    contactId: string;
    serviceId: string;
    /** The session's start: a pack must still be valid then. */
    startAt: Date;
    /** A particular purchase, or absent to spend the one expiring soonest. */
    purchaseId?: string;
}

function refuse(message: string): never {
    throw new BadRequestException({
        message,
        details: { field: "packPurchaseId" },
    });
}

/** Take the purchase's row lock. Every spend of one pack queues here. */
async function lock(tx: Tx, purchaseId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "PackPurchase" WHERE id = ${purchaseId} FOR UPDATE`;
}

async function creditsLeft(
    tx: Tx,
    purchase: { id: string; credits: number },
): Promise<number> {
    const used = await tx.packRedemption.count({
        where: { purchaseId: purchase.id, reversedAt: null },
    });
    return purchase.credits - used;
}

/**
 * Spend one class of a pack on a booking, on the caller's transaction
 * (ADR-007). Returns the purchase it spent.
 *
 * The purchase row is locked before its classes are counted, so two bookings
 * racing for the last class queue on the lock and the second finds none left
 * — correct without relying on the isolation level, which the RLS proxy may
 * drop. A pack must be the booker's own, cover the service, and still be
 * valid when the session starts (not merely when it is booked).
 *
 * With no purchase named, the usable pack that expires soonest is spent.
 */
export async function redeemPackInTx(
    tx: Tx,
    input: RedeemInput,
): Promise<{ purchaseId: string; packName: string }> {
    const where = {
        organizationId: input.organizationId,
        contactId: input.contactId,
        expiresAt: { gt: input.startAt },
        pack: { services: { some: { serviceId: input.serviceId } } },
    } satisfies Prisma.PackPurchaseWhereInput;

    let chosen: { id: string; credits: number; packName: string } | null = null;

    if (input.purchaseId) {
        const named = await tx.packPurchase.findFirst({
            where: {
                id: input.purchaseId,
                organizationId: input.organizationId,
            },
            select: {
                id: true,
                contactId: true,
                credits: true,
                expiresAt: true,
                pack: {
                    select: {
                        name: true,
                        services: {
                            where: { serviceId: input.serviceId },
                            select: { serviceId: true },
                        },
                    },
                },
            },
        });
        if (!named) {
            throw new NotFoundException({
                message: "That class pack was not found",
                details: { field: "packPurchaseId" },
            });
        }
        if (named.contactId !== input.contactId) {
            refuse("That class pack belongs to someone else.");
        }
        if (named.pack.services.length === 0) {
            refuse("That class pack does not cover this service.");
        }
        if (named.expiresAt <= input.startAt) {
            refuse("That class pack runs out before this session.");
        }
        await lock(tx, named.id);
        if ((await creditsLeft(tx, named)) <= 0) {
            refuse("That class pack has no classes left.");
        }
        chosen = {
            id: named.id,
            credits: named.credits,
            packName: named.pack.name,
        };
    } else {
        const candidates = await tx.packPurchase.findMany({
            where,
            orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
            select: {
                id: true,
                credits: true,
                pack: { select: { name: true } },
            },
        });
        // Locked one at a time in expiry order — the same order every
        // caller uses, so two bookings cannot deadlock on each other.
        for (const c of candidates) {
            await lock(tx, c.id);
            if ((await creditsLeft(tx, c)) > 0) {
                chosen = {
                    id: c.id,
                    credits: c.credits,
                    packName: c.pack.name,
                };
                break;
            }
        }
        if (!chosen) {
            refuse(
                "They have no class pack with classes left for this service on that date.",
            );
        }
    }

    // One redemption per booking. A pack taken off a booking earlier left a
    // reversed row behind; spending again reuses it.
    const previous = await tx.packRedemption.findUnique({
        where: { bookingId: input.bookingId },
        select: { id: true, reversedAt: true },
    });
    if (previous && !previous.reversedAt) {
        throw new ConflictException(
            "This booking is already paid with a class pack.",
        );
    }
    if (previous) {
        await tx.packRedemption.update({
            where: { id: previous.id },
            data: { purchaseId: chosen.id, reversedAt: null },
        });
    } else {
        await tx.packRedemption.create({
            data: {
                organizationId: input.organizationId,
                purchaseId: chosen.id,
                bookingId: input.bookingId,
            },
        });
    }
    return { purchaseId: chosen.id, packName: chosen.packName };
}

/** Give a booking's class back to its pack. Nothing to do when there is none. */
export async function reversePackInTx(
    tx: Tx,
    bookingId: string,
): Promise<boolean> {
    const { count } = await tx.packRedemption.updateMany({
        where: { bookingId, reversedAt: null },
        data: { reversedAt: new Date() },
    });
    return count > 0;
}
