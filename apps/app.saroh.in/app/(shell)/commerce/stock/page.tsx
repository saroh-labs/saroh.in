import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { redirect } from "next/navigation";

import { StockContainer } from "@/components/commerce/stock/stock-container";
import {
    StockLocked,
    StockTrackingOff,
} from "@/components/commerce/stock/stock-states";
import { PageContainer } from "@/components/shared/page/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { rememberedPageSize } from "@/lib/paging/remembered";
import { prefetchRead } from "@/lib/query/prefetch";
import { getServerQueryClient } from "@/lib/query/server-client";
import { requireSession } from "@/lib/session";
import {
    stockChecksServer,
    stockLevelsServer,
    stockLogServer,
} from "@/lib/stock/access";
import type { StockTab } from "@/lib/stock/list-query";
import { STOCK_LISTS, stockHref } from "@/lib/stock/list-query";
import {
    stockChecksRead,
    stockLevelsRead,
    stockLogRead,
    stockView,
} from "@/lib/stock/queries";
import { getStockTracking } from "@/lib/stock/service";
import { listStorefronts } from "@/lib/stores/storefronts";

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
 * On React Query (DEC-259): the gates (who may read stock, Track stock on)
 * and the storefronts are the page's; the levels, the checks and, on its
 * tab, the log as the address asks (`stockView`) are prefetched and
 * hydrated, and `StockContainer` reads every later one in place.
 */
export default async function StockPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [query, organization, levelsSize, logSize, checksSize] =
        await Promise.all([
            searchParams,
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
    const view = stockView(query, sizes, storefronts);
    const { tab } = view.address;
    const client = getServerQueryClient();
    const org = organization.id;
    await Promise.all([
        prefetchRead(client, stockLevelsServer, org, view.levels),
        prefetchRead(client, stockChecksServer, org, view.checks),
        tab === "log"
            ? prefetchRead(client, stockLogServer, org, view.log)
            : null,
    ]);
    const levels = client.getQueryState(
        stockLevelsRead.options(org, view.levels).queryKey,
    );
    // Levels is the page's own read: it failing fails the page.
    if (levels?.status === "error") {
        throw levels.error ?? new Error("Stock couldn't be read");
    }

    // A page past the end (the list has since got shorter, or the address
    // was typed): start again at the first page rather than show an empty
    // one with nothing to press.
    const rows = (
        {
            levels: () => levels?.data?.rows,
            log: () =>
                client.getQueryData(
                    stockLogRead.options(org, view.log).queryKey,
                )?.entries,
            checks: () =>
                client.getQueryData(
                    stockChecksRead.options(org, view.checks).queryKey,
                )?.checks,
        } satisfies Record<StockTab, () => unknown[] | undefined>
    )[tab]();
    if (view.address.pages[tab].page > 1 && rows?.length === 0) {
        redirect(stockHref(view.address, { page: 1 }));
    }

    return (
        <PageContainer width="full">
            <HydrationBoundary state={dehydrate(client)}>
                <StockContainer
                    business={organization.name}
                    storefronts={storefronts}
                    sizes={sizes}
                />
            </HydrationBoundary>
        </PageContainer>
    );
}
