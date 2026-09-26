import type { Prisma } from "@saroh/database";

import {
    AuditAction,
    auditMetadata,
    AuditOutcome,
} from "../audit/audit.service";

/**
 * Track stock turning on or off (#515) in the business's audit stream
 * (Settings → Activity), written on the switch's own transaction so the
 * row and the change stand or fall together. Only a real change is
 * recorded: the callers return early when the switch is already where it
 * was asked to be.
 *
 * The metadata is counts and the product's name — the business's own
 * catalogue, never a person's details (DEC-035). An operator's change is
 * marked `byOperator` (`auditMetadata`), so it reads as Saroh support.
 *
 * Kept apart from `tracking.ts` so `stock.service.ts` (a first count that
 * starts a product counting) can write it without an import cycle.
 */

type Tx = Pick<Prisma.TransactionClient, "auditEvent">;

/** Who a change made by no person (a system flow) is recorded as. */
export const STOCK_SYSTEM_ACTOR = "system:stock";

/** The actor as the stock flows carry it. */
export interface TrackingAuditActor {
    organizationId: string;
    userId: string | null;
    /** The acting context's role key: an operator's reads as Saroh support. */
    roleKey?: string;
}

/** What a product's switch going on or off records. */
export type ProductTrackingChange =
    | {
          tracked: true;
          /** The product's name, as Activity says it. */
          product: string;
          /** A first count started it, not the switch. */
          startedWithCount?: boolean;
          /** Storefronts whose hand-marked Sold out it cleared. */
          soldOutCleared: number;
      }
    | {
          tracked: false;
          product: string;
          /** Units on its shelves counted to 0. */
          unitsZeroed: number;
          /** Storefronts with a shelf counted to 0. */
          storefronts: number;
      };

export async function recordProductTracking(
    tx: Tx,
    actor: TrackingAuditActor,
    productId: string,
    change: ProductTrackingChange,
): Promise<void> {
    const { tracked, ...metadata } = change;
    await tx.auditEvent.create({
        data: {
            action: tracked
                ? AuditAction.ProductStockTrackingOn
                : AuditAction.ProductStockTrackingOff,
            actorUserId: actor.userId ?? STOCK_SYSTEM_ACTOR,
            organizationId: actor.organizationId,
            targetType: "product",
            targetId: productId,
            outcome: AuditOutcome.Success,
            metadata: auditMetadata(actor.roleKey, metadata),
        },
    });
}

/** What the business's switch going on or off records. */
export type BusinessTrackingChange =
    | {
          tracked: true;
          /** Products that count stock again (their own switch is on). */
          products: number;
          /** Hand-marked Sold out cleared, one per product × storefront. */
          soldOutCleared: number;
      }
    | {
          tracked: false;
          /** Products that stop counting (their own switch was on). */
          products: number;
          unitsZeroed: number;
          storefronts: number;
      };

export async function recordBusinessTracking(
    tx: Tx,
    actor: TrackingAuditActor,
    change: BusinessTrackingChange,
): Promise<void> {
    const { tracked, ...metadata } = change;
    await tx.auditEvent.create({
        data: {
            action: tracked
                ? AuditAction.BusinessStockTrackingOn
                : AuditAction.BusinessStockTrackingOff,
            actorUserId: actor.userId ?? STOCK_SYSTEM_ACTOR,
            organizationId: actor.organizationId,
            targetType: "organization",
            targetId: actor.organizationId,
            outcome: AuditOutcome.Success,
            metadata: auditMetadata(actor.roleKey, metadata),
        },
    });
}
