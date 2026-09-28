import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { classPacksOn } from "./class-packs-on";

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
    /**
     * Who is spending it: the team at the desk (the default), or the
     * customer themselves on the business's site (A10). A customer always
     * names the purchase they were offered; someone else's is as good as
     * missing (404), and a refusal says `credit-gone` in their own words so
     * the page offers another way to pay.
     */
    actor?: "team" | "customer";
}

/** The reason a customer's page reads when their credit can't be spent. */
export const CREDIT_GONE = "credit-gone";

type Words = Record<"elsewhere" | "uncovered" | "expires" | "empty", string>;

const TEAM_WORDS: Words = {
    elsewhere: "That class pack belongs to someone else.",
    uncovered: "That class pack does not cover this service.",
    expires: "That class pack runs out before this session.",
    empty: "That class pack has no classes left.",
};

const CUSTOMER_WORDS: Words = {
    elsewhere: "That class pack was not found",
    uncovered: "Your class pack doesn't cover this class.",
    expires: "Your class pack runs out before this class.",
    empty: "Your class pack has no classes left.",
};

function refuse(message: string, actor: RedeemInput["actor"]): never {
    throw new BadRequestException({
        message,
        details: {
            field: "packPurchaseId",
            ...(actor === "customer" ? { reason: CREDIT_GONE } : {}),
        },
    });
}

function missing(actor: RedeemInput["actor"]): never {
    throw new NotFoundException({
        message: "That class pack was not found",
        details: {
            field: "packPurchaseId",
            ...(actor === "customer" ? { reason: CREDIT_GONE } : {}),
        },
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
    const words = input.actor === "customer" ? CUSTOMER_WORDS : TEAM_WORDS;

    // A customer spends only the pack they were offered, never "whichever",
    // and only while the business has Class packs on (E12): switched off,
    // the site stops offering them, and a page drawn before is refused.
    if (input.actor === "customer") {
        if (!input.purchaseId) missing(input.actor);
        if (!(await classPacksOn(tx, input.organizationId))) {
            refuse(
                "Class packs can't be used online right now. Choose another way to pay.",
                input.actor,
            );
        }
    }

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
        if (!named) missing(input.actor);
        if (named.contactId !== input.contactId) {
            // A customer is never told whose it is, or that it exists.
            if (input.actor === "customer") missing(input.actor);
            refuse(words.elsewhere, input.actor);
        }
        if (named.pack.services.length === 0) {
            refuse(words.uncovered, input.actor);
        }
        if (named.expiresAt <= input.startAt) {
            refuse(words.expires, input.actor);
        }
        await lock(tx, named.id);
        if ((await creditsLeft(tx, named)) <= 0) {
            refuse(words.empty, input.actor);
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
                input.actor,
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
    // The booking says how it was paid (U3) — a pack, and no membership.
    await tx.booking.updateMany({
        where: { id: input.bookingId },
        data: { paidWith: "PACK", subscriptionId: null },
    });
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
