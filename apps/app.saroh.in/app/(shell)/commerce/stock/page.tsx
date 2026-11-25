import { StockContainer } from "@/components/commerce/stock/stock-container";
import {
    StockLocked,
    StockTrackingOff,
} from "@/components/commerce/stock/stock-states";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { rememberedPageSize } from "@/lib/paging/remembered";
import { requireSession } from "@/lib/session";
import type { StockTab } from "@/lib/stock/list-query";
import { STOCK_LISTS } from "@/lib/stock/list-query";
import { getStockTracking } from "@/lib/stock/service";
import { listStorefronts } from "@/lib/stores/storefronts";

import { canStockProducts } from "@/lib/products/access";

export const metadata = { title: "Stock" };

export type { StockTab };

/** "Owner", or what the business called the role it made. */
function roleWords(org: { role: string; roleLabel?: string | null }) {
    return (
        org.roleLabel ?? org.role.charAt(0) + org.role.slice(1).toLowerCase()
    );
}

/**
 * Sell › Stock (#527, #521), after "Saroh Stock": what is on each shelf and
 * what can sell (Levels, with counting), every change (Log), and what
 * doesn't add up (Checks). Moving stock and recording received, baked or
 * wasted units open from the header.
 *
 * The tab, every filter and each list's page are in the address
 * (`lib/stock/list-query.ts`), so a link opens the same view and Back
 * works. Each list is read a page at a time, at the rows per page this
 * browser last chose for it. Levels is the page's own read: it failing
 * fails the page. The log and the checks fail on their own, named where
 * they show.
 *
 * On React Query (DEC-259), loaded in the browser: the gates (who may read
 * stock, Track stock on) and the storefronts are the page's; the levels,
 * the checks and, on its tab, the log as the address asks (`stockView`)
 * are `StockContainer`'s queries, read from the browser into the screen's
 * frame, drawn at once with its rows as skeletons, and every later one in
 * place.
 */
export default async function StockPage() {
    await requireSession();
    const [organization, levelsSize, logSize, checksSize] = await Promise.all([
        resolveActiveOrganization(),
        rememberedPageSize(STOCK_LISTS.levels),
        rememberedPageSize(STOCK_LISTS.log),
        rememberedPageSize(STOCK_LISTS.checks),
    ]);

    // Reading stock is reading the catalogue (`store:read`).
    if (organization?.actions && !organization.actions.includes("store:read")) {
        return (
            <StockLocked
                business={organization.name}
                role={roleWords(organization)}
            />
        );
    }

    const tracking = await getStockTracking();
    if (tracking && !tracking.tracked) {
        return (
            <StockTrackingOff
                business={organization?.name ?? null}
                canChange={tracking.canChange}
            />
        );
    }

    if (!organization) {
        // No business to read.
        return <StockLocked business="this business" role="a member" />;
    }

    // The business's open storefronts, first made first — the same list the
    // levels read names — so `show` is checked before the levels read.
    const storefronts = (await listStorefronts()).map((s) => ({
        id: s.id,
        name: s.name,
    }));
    const sizes = { levels: levelsSize, log: logSize, checks: checksSize };

    return (
        <StockContainer
            canWrite={canStockProducts(organization)}
            business={organization.name}
            storefronts={storefronts}
            sizes={sizes}
        />
    );
}
