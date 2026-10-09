import { prisma } from "@saroh/database";

import { pausedByCut } from "../billing/over-limit";
import { overLimit } from "../billing/over-limit.service";
import { pausedByPlan } from "../billing/paused-errors";

/**
 * A product past the plan's limit after a move to a lower plan is
 * read-only in the workspace (#800, `billing/over-limit.ts`): its editor
 * sections, photos, variants and how it counts stock are refused with
 * `PAUSED_BY_PLAN`. What stays allowed: taking it off sale (a save that
 * only sets the status to Draft or Archived), deleting it, duplicating it
 * (metering's room decides), and counting its shelf or marking it sold
 * out — the shelf's truth, which the plan doesn't freeze. Nothing pauses
 * with `PLAN_ENFORCEMENT` off or off the catalogue (`pausedNow` is null).
 */

/** Statuses a save may move a paused product to: off the site. */
const TAKING_OFF: ReadonlySet<string> = new Set(["DRAFT", "ARCHIVED"]);

/** Whether a save only takes the product off sale (allowed when paused). */
export function onlyTakesOffSale(dto: object | undefined): boolean {
    if (!dto) return false;
    const set = Object.entries(dto).filter(([, v]) => v !== undefined);
    return (
        set.length === 1 &&
        set[0][0] === "status" &&
        typeof set[0][1] === "string" &&
        TAKING_OFF.has(set[0][1])
    );
}

/**
 * Refuse a write to a product the plan has paused. `dto`: the save, so a
 * status-only take-off-sale goes through.
 */
export async function assertProductEditable(
    organizationId: string,
    productId: string,
    dto?: object,
): Promise<void> {
    if (onlyTakesOffSale(dto)) return;
    const paused = await overLimit.pausedNow(organizationId);
    if (!paused?.products) return;
    const product = await prisma.product.findFirst({
        where: { id: productId, organizationId },
        select: { id: true, createdAt: true, status: true },
    });
    // An archived product isn't counted, so it is never paused.
    if (!product || product.status === "ARCHIVED") return;
    if (pausedByCut(product, paused.products)) throw pausedByPlan("product");
}
