import type { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import type { PackKind, PackPaidBy } from "../class-packs/pack-kind";
import { standingOf } from "../class-packs/pack-reads";
import type { PackUseState } from "../class-packs/pack-used-sales";
import { packUseState } from "../class-packs/pack-used-sales";

/**
 * A customer's class packs on Customer Detail (round-2 C7): what each
 * purchase has left, how it was bought, the days it was given, and the
 * classes spent from it — for the Overview's Classes left card and the
 * Packs tab. `pack:read` covers all of it, prices included (DEC-039); the
 * service asks for it only with that read and the Class packs module on.
 *
 * The balance is never stored (ADR-007): `used` counts the redemptions not
 * given back, as Pack Detail's holders do (`class-packs/pack-reads.ts`).
 */

/** The most purchases the page lists. */
export const PACK_ROWS = 50;
/** The most classes listed under one purchase, latest first. */
export const PACK_USES = 30;

/** One class spent from a purchase, and what became of it (E13's words). */
export interface DetailPackUse {
    bookingId: string;
    startAt: string;
    service: { id: string; name: string };
    state: PackUseState;
}

/** Days given to a purchase (E16's Extend), oldest first. */
export interface DetailPackExtension {
    days: number;
    reason: string;
    createdAt: string;
}

export interface DetailPack {
    id: string;
    pack: { id: string; name: string; kind: PackKind };
    credits: number;
    used: number;
    left: number;
    /** Use-by: the classes left lapse after this. */
    expiresAt: string;
    /** When it was bought. */
    boughtAt: string;
    standing: "ACTIVE" | "USED_UP" | "EXPIRED";
    /** What it sold for: `pack:read` shows prices. */
    price: string;
    currency: string;
    /** How the desk was paid; null when not recorded (sold before E13). */
    paidBy: PackPaidBy | null;
    extensions: DetailPackExtension[];
    /** Latest first, at most {@link PACK_USES}; given-back ones included. */
    uses: DetailPackUse[];
}

export interface ContactPacks {
    rows: DetailPack[];
    /** Classes left on live purchases. */
    classesLeft: number;
    /** The soonest use-by among live purchases, ISO. */
    nextExpiry: string | null;
}

type Db = Pick<typeof prisma, "packPurchase">;

/** Newest purchase first; the screen orders them for itself. */
export async function readContactPacks(
    db: Db,
    organizationId: string,
    contactId: string,
    now = new Date(),
): Promise<ContactPacks> {
    const rows = await db.packPurchase.findMany({
        where: { organizationId, contactId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PACK_ROWS,
        select: {
            id: true,
            credits: true,
            price: true,
            currency: true,
            expiresAt: true,
            createdAt: true,
            paidBy: true,
            pack: { select: { id: true, name: true, kind: true } },
            extensions: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: { days: true, reason: true, createdAt: true },
            },
            redemptions: {
                orderBy: [{ booking: { startAt: "desc" } }, { id: "desc" }],
                take: PACK_USES,
                select: {
                    reversedAt: true,
                    booking: {
                        select: {
                            id: true,
                            startAt: true,
                            status: true,
                            outcome: true,
                            service: { select: { id: true, name: true } },
                        },
                    },
                },
            },
            _count: {
                select: { redemptions: { where: { reversedAt: null } } },
            },
        },
    });
    let classesLeft = 0;
    let nextExpiry: Date | null = null;
    const views = rows.map((p): DetailPack => {
        const used = p._count.redemptions;
        const left = Math.max(0, p.credits - used);
        const standing = standingOf({ expiresAt: p.expiresAt, left }, now);
        if (standing === "ACTIVE") {
            classesLeft += left;
            if (!nextExpiry || p.expiresAt < nextExpiry) {
                nextExpiry = p.expiresAt;
            }
        }
        return {
            id: p.id,
            pack: {
                id: p.pack.id,
                name: p.pack.name,
                kind: p.pack.kind === "ONE_TO_ONE" ? "ONE_TO_ONE" : "CLASSES",
            },
            credits: p.credits,
            used,
            left,
            expiresAt: p.expiresAt.toISOString(),
            boughtAt: p.createdAt.toISOString(),
            standing,
            price: toMoneyString(p.price),
            currency: p.currency,
            paidBy: (p.paidBy as PackPaidBy | null) ?? null,
            extensions: p.extensions.map((e) => ({
                days: e.days,
                reason: e.reason,
                createdAt: e.createdAt.toISOString(),
            })),
            uses: p.redemptions.map((r) => ({
                bookingId: r.booking.id,
                startAt: r.booking.startAt.toISOString(),
                service: r.booking.service,
                state: packUseState(r),
            })),
        };
    });
    return {
        rows: views,
        classesLeft,
        nextExpiry: (nextExpiry as Date | null)?.toISOString() ?? null,
    };
}
