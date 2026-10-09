import { ForbiddenException } from "@nestjs/common";

import type { StoresService } from "./stores.service";

/**
 * A way into the store AND a read of what it has sold — for the store-scoped
 * reads that send money or the people who paid it: a storefront's orders with
 * their totals, and its customers with their email and what they have spent.
 *
 * Seeing amounts follows permissions, never a role's name (DEC-098) nor a
 * storefront role (DEC-106), and never store access either (#868): these
 * reads take `order:read` — the whole order, money included — asked of the
 * business role's permissions through `StoresService.moneyAllows`. With
 * ORG_AUTHORIZATION off (the older per-store model, which has no permissions
 * to ask) the storefront's owner keeps it.
 *
 * So `store:read` alone is refused: a business role that sees the
 * storefronts but reads no orders (a role the owner made with only "See
 * locations"), the kitchen's roles — `order:stage` without `order:read`,
 * which a Member holds (DEC-024) — and a storefront Admin, Manager, Editor or
 * Viewer whose business role reads no orders. The organization-scoped reads
 * (Sell → Orders, Order Detail) are the ones that serve a role without money,
 * with the amounts left out. `what` names the list in the refusal: "orders",
 * "customers".
 */
export async function requireOrderRead(
    stores: StoresService,
    storeId: string,
    userId: string,
    what: string,
): Promise<void> {
    // A storefront they can't reach stays a 404: nothing says it exists.
    await stores.getForUser(storeId, userId);
    const [stage, read] = await Promise.all([
        stores.memberAllows(storeId, userId, "order:stage"),
        stores.memberAllows(storeId, userId, "order:read"),
    ]);
    if (read) return;
    if (!stage && (await stores.moneyAllows(storeId, userId, "order:read"))) {
        return;
    }
    throw new ForbiddenException(
        `Your role doesn't include reading this location's ${what}.`,
    );
}
