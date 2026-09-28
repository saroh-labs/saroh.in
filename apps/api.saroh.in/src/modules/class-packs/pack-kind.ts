import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

/**
 * What a pack pays for, and how a sale was paid (round-2 E13, default 45).
 *
 * A CLASSES pack pays for classes — a service more than one person books at
 * once (`capacity > 1`, what the booking page calls a class). A ONE_TO_ONE
 * pack pays for one-to-one sessions (`capacity` 1). This amends ADR-008's
 * "packs cover classes only". The kind is locked once the pack is sold:
 * every holder bought it for one kind of booking.
 */

export const PACK_KINDS = ["CLASSES", "ONE_TO_ONE"] as const;
export type PackKind = (typeof PACK_KINDS)[number];
export const DEFAULT_PACK_KIND: PackKind = "CLASSES";

/**
 * How a desk sale was paid. A record of what the desk took, never a limit
 * on how anyone pays (DEC-059). NONE: handed over with no payment. ONLINE:
 * paid through the business's provider (a pay link, or bought on the site).
 * A sale from before E13 has none recorded (null).
 */
export const PACK_PAID_BY = [
    "CASH",
    "UPI",
    "CARD",
    "BANK",
    "ONLINE",
    "NONE",
] as const;
export type PackPaidBy = (typeof PACK_PAID_BY)[number];

/** A validity shorter than a week is refused (default 46). */
export const MIN_VALIDITY_DAYS = 7;

/** The kind of pack that pays for a service with this capacity. */
export function packKindFor(service: { capacity: number }): PackKind {
    return service.capacity > 1 ? "CLASSES" : "ONE_TO_ONE";
}

/** A stored kind, read defensively: anything unknown reads as Classes. */
export function readPackKind(kind: string | null | undefined): PackKind {
    return kind === "ONE_TO_ONE" ? "ONE_TO_ONE" : "CLASSES";
}

/**
 * The purchases whose pack pays for this service: it covers the service and
 * is of the service's kind. Every read that offers a pack for a booking —
 * the desk's spend, New booking's list, the customer's credit online —
 * filters by this, so what is offered is what `redeemPackInTx` spends.
 */
export function purchasesPayingFor(service: {
    id: string;
    capacity: number;
}): Prisma.PackPurchaseWhereInput {
    return {
        pack: {
            kind: packKindFor(service),
            services: { some: { serviceId: service.id } },
        },
    };
}

/** Said when a sold pack's kind would change. */
export const KIND_LOCKED =
    "This pack has been sold, so it stays the kind it was sold as.";

/** A 409 on the kind field. */
export function refuseKindChange(): never {
    throw new ConflictException({
        message: KIND_LOCKED,
        details: { field: "kind" },
    });
}
