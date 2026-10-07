import { ForbiddenException } from "@nestjs/common";

import type { StoresService } from "./stores.service";

/**
 * A way into the store AND a read of what it has sold — for the store-scoped
 * reads that send money or the people who paid it: a storefront's orders with
 * their totals, and its customers with their email and what they have spent.
 *
 * Commerce opened to `order:stage` for the kitchen (DEC-024), and a Member
 * holds that and `store:read` but no money read. Store access alone handed
 * them both lists.
 *
 * It refuses the kitchen's roles — `order:stage` without `order:read` — and
 * anyone whose only way into this storefront is a storefront role (Admin,
 * Manager, Editor, Viewer) without `order:read` on their business role:
 * seeing amounts follows permissions, never a storefront role (DEC-106).
 * Whoever reaches the storefront through their business role, or as its
 * owner on the older per-store path, reads as before. `what` names the list
 * in the refusal: "orders", "customers".
 */
export async function requireOrderRead(
    stores: StoresService,
    storeId: string,
    userId: string,
    what: string,
): Promise<void> {
    await stores.getForUser(storeId, userId);
    const [stage, read, viaBusiness] = await Promise.all([
        stores.memberAllows(storeId, userId, "order:stage"),
        stores.memberAllows(storeId, userId, "order:read"),
        stores.memberAllows(storeId, userId, "store:read"),
    ]);
    if (read) return;
    if (
        stage ||
        !(
            viaBusiness ||
            (await stores.moneyAllows(storeId, userId, "order:read"))
        )
    ) {
        throw new ForbiddenException(
            `Your role doesn't include reading this location's ${what}.`,
        );
    }
}
