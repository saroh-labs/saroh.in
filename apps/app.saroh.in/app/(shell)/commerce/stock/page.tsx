import { redirect, unstable_rethrow } from "next/navigation";

import { StockScreen } from "@/components/commerce/stock/stock-screen";
import {
    StockLocked,
    StockTrackingOff,
} from "@/components/commerce/stock/stock-states";
import { PageContainer } from "@/components/shared/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { rememberedPageSize } from "@/lib/paging/remembered";
import { listProducts } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import type { StockAddress, StockTab } from "@/lib/stock/list-query";
import { readStockPages, STOCK_LISTS, stockHref } from "@/lib/stock/list-query";
import { logKindId, logKinds } from "@/lib/stock/log";
import type { StockChecks, StockLog } from "@/lib/stock/service";
import {
    getStockChecks,
    getStockLevels,
    getStockLog,
    getStockTracking,
} from "@/lib/stock/service";
import { listStorefronts } from "@/lib/stores/storefronts";

export const metadata = { title: "Stock" };

export type { StockTab };

/** "Owner", or what the business called the role it made. */
function roleWords(org: { role: string; roleLabel?: string | null }) {
    return (
        org.roleLabel ?? org.role.charAt(0) + org.role.slice(1).toLowerCase()
    );
}

const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : undefined;

/**
 * An optional read of the screen: a failure is named where it would have
 * shown ("failed"), never an empty list — and a refusal or a redirect still
 * reaches its boundary.
 */
async function optional<T>(read: () => Promise<T | null>) {
    try {
        return (await read()) ?? ("failed" as const);
    } catch (error) {
        unstable_rethrow(error);
        return "failed" as const;
    }
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

    const tab: StockTab =
        query.tab === "log" || query.tab === "checks" ? query.tab : "levels";
    const show = one(query.show) ?? "all";
    const q = (one(query.q) ?? "").trim().slice(0, 100);
    const kind = logKindId(one(query.kind));
    const logStore = one(query.store);
    const logProduct = one(query.product);
    const pages = readStockPages(query, {
        levels: levelsSize,
        log: logSize,
        checks: checksSize,
    });
    const address: StockAddress = {
        tab,
        show,
        q,
        kind,
        store: logStore ?? "all",
        product: logProduct ?? "",
        pages,
    };

    // The business's open storefronts, first made first — the same list the
    // levels read names — so `show` is checked before the one levels read.
    const storefronts = (await listStorefronts()).map((s) => ({
        id: s.id,
        name: s.name,
    }));
    const storefront = storefronts.some((s) => s.id === show)
        ? show
        : undefined;

    const [levels, checks, log, products] = await Promise.all([
        // Off its tab, Levels is read for the header and the tab's count
        // alone (who may write, how many need you): one product is enough.
        getStockLevels({
            storefront,
            q: q || undefined,
            needs: show === "needs",
            ...(tab === "levels" ? pages.levels : { limit: 1 }),
        }),
        // And the checks, off their tab, for the tab's count.
        optional<StockChecks>(() =>
            getStockChecks(tab === "checks" ? pages.checks : { limit: 1 }),
        ),
        tab === "log"
            ? optional<StockLog>(() =>
                  getStockLog({
                      kind: logKinds(kind),
                      storefront: storefronts.some((s) => s.id === logStore)
                          ? logStore
                          : undefined,
                      product: logProduct,
                      ...pages.log,
                  }),
              )
            : Promise.resolve(null),
        // The log's product filter: the business's catalogue.
        tab === "log" ? listProducts().catch(() => []) : Promise.resolve([]),
    ]);
    if (!levels) {
        // No business to read (no active organization).
        return (
            <StockLocked
                business={organization?.name ?? "this business"}
                role={organization ? roleWords(organization) : "a member"}
            />
        );
    }

    // A page past the end (the list has since got shorter, or the address
    // was typed): start again at the first page rather than show an empty
    // one with nothing to press.
    const pastTheEnd =
        pages[tab].page > 1 &&
        (tab === "levels"
            ? levels.rows.length === 0
            : tab === "log"
              ? log !== null && log !== "failed" && log.entries.length === 0
              : checks !== "failed" && checks.checks.length === 0);
    if (pastTheEnd) redirect(stockHref(address, { page: 1 }));

    return (
        <PageContainer width="full">
            <StockScreen
                business={organization?.name ?? null}
                tab={tab}
                show={show}
                q={q}
                levels={levels}
                needsYou={levels.needsYou ?? 0}
                storefronts={storefronts}
                checks={checks}
                log={log}
                logFilter={{
                    kind,
                    store: logStore ?? "all",
                    product: logProduct ?? "",
                }}
                products={products.map((p) => ({ id: p.id, name: p.name }))}
                canWrite={levels.canWrite}
                pages={pages}
            />
        </PageContainer>
    );
}
