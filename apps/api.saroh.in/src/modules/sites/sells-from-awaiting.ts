import type { Prisma } from "@saroh/database";

import { modulePageState } from "./module-pages";
import type { SellsFromView } from "./sells-from";
import { effectiveStorefront, sellsFromChoices } from "./sells-from";

/**
 * A shop that could serve but waits on the merchant (round-2 P4): found
 * live, `/shop` was a 404 until the site's "Sells from" was answered, and
 * nothing said so.
 *
 * It waits when the shop could serve — the `SITE_SHOP` rollout flag on for
 * the business, Commerce rolled out and on (`modulePageState("SHOP")`, the
 * gate a Shop page asks) — and a storefront with products could be chosen,
 * but none is. With `SITE_SHOP` off the shop is never named (DEC-057); with
 * no storefront selling anything there is nothing to choose yet, and the
 * settings' Sells from line already says so.
 *
 * The site's Shop settings say it (`shopAwaitsSellsFrom` on the site), and
 * so does the Website module's readiness, which Settings › Modules and the
 * Home checklist read (`WEBSITE_SHOP_NOT_CHOSEN`).
 */

/** What a merchant is told, in both places. */
export const SHOP_AWAITS_SELLS_FROM =
    "Choose which storefront your site sells from — until then your shop page isn't live.";

type Db = Pick<
    Prisma.TransactionClient,
    "site" | "store" | "organizationModule"
>;

/** Unanswered, with something to choose. Pure. */
export function awaitsSellsFrom(view: SellsFromView): boolean {
    return view.storefront === null && view.choices.length > 0;
}

/** Whether the business's shop could serve at all now. */
export async function shopCouldServe(
    organizationId: string,
    db?: Pick<Prisma.TransactionClient, "organizationModule">,
): Promise<boolean> {
    return (await modulePageState("SHOP", organizationId, db)).state === "on";
}

/**
 * The first published site whose shop waits on "Sells from", or null. A
 * site not yet published has "Publish your site" to do first.
 */
export async function siteAwaitingSellsFrom(
    db: Db,
    organizationId: string,
): Promise<string | null> {
    const sites = await db.site.findMany({
        where: {
            organizationId,
            deletedAt: null,
            currentPublicationId: { not: null },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, storefrontId: true },
    });
    if (sites.length === 0) return null;
    if (!(await shopCouldServe(organizationId, db))) return null;
    for (const site of sites) {
        const chosen = await effectiveStorefront(db, {
            organizationId,
            storefrontId: site.storefrontId,
        });
        if (chosen) continue;
        const choices = await sellsFromChoices(db, organizationId);
        return choices.length > 0 ? site.id : null;
    }
    return null;
}

/** Where the merchant answers it: the site's Shop settings. */
export function sellsFromHref(siteId: string): string {
    return `/sites/${siteId}/settings#sells-from`;
}
