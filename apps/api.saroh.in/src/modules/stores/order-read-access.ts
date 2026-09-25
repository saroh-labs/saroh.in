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
 * It refuses exactly the kitchen's roles — `order:stage` without
 * `order:read` — so everyone who reached these reads before (and a legacy
 * store grant, which has no membership to ask) is unchanged. `what` names the
 * list in the refusal: "orders", "customers".
 */
export async function requireOrderRead(
    stores: StoresService,
    storeId: string,
    userId: string,
    what: string,
): Promise<void> {
    await stores.getForUser(storeId, userId);
    const [stage, read] = await Promise.all([
        stores.memberAllows(storeId, userId, "order:stage"),
        stores.memberAllows(storeId, userId, "order:read"),
    ]);
    if (stage && !read) {
        throw new ForbiddenException(
            `Your role doesn't include reading this storefront's ${what}.`,
        );
    }
}
