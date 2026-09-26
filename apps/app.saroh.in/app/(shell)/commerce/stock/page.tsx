import { unstable_rethrow } from "next/navigation";

import { StockScreen } from "@/components/commerce/stock/stock-screen";
import {
    StockLocked,
    StockTrackingOff,
} from "@/components/commerce/stock/stock-states";
import { PageContainer } from "@/components/shared/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { listProducts } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { logKindId, logKinds } from "@/lib/stock/log";
import type { StockChecks, StockLog } from "@/lib/stock/service";
import {
    getStockChecks,
    getStockLevels,
    getStockLog,
    getStockTracking,
} from "@/lib/stock/service";

export const metadata = { title: "Stock" };

/** Products a page of Levels, entries a page of the log, checks a page. */
const LEVELS_PAGE = 50;
const LOG_PAGE = 50;
const CHECKS_PAGE = 20;

export type StockTab = "levels" | "log" | "checks";

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
 * The tab and every filter are in the address, so a link opens the same
 * view and Back works. Levels is the page's own read: it failing fails the
 * page. The log and the checks fail on their own, named where they show.
 */
export default async function StockPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [query, organization] = await Promise.all([
        searchParams,
        resolveActiveOrganization(),
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

    // The storefronts come with every levels read; the first names them.
    const all = await getStockLevels({ limit: 1 });
    const storefronts = all?.storefronts ?? [];
    const storefront = storefronts.some((s) => s.id === show)
        ? show
        : undefined;

    const [levels, checks, log, products] = await Promise.all([
        getStockLevels({
            storefront,
            q: q || undefined,
            needs: show === "needs",
            limit: LEVELS_PAGE,
        }),
        optional<StockChecks>(() =>
            getStockChecks({ limit: tab === "checks" ? CHECKS_PAGE : 1 }),
        ),
        tab === "log"
            ? optional<StockLog>(() =>
                  getStockLog({
                      kind: logKinds(kind),
                      storefront: storefronts.some((s) => s.id === logStore)
                          ? logStore
                          : undefined,
                      product: logProduct,
                      limit: LOG_PAGE,
                  }),
              )
            : Promise.resolve(null),
        // The log's product filter: the business's catalogue.
        tab === "log" ? listProducts().catch(() => []) : Promise.resolve([]),
    ]);
    if (!levels || !all) {
        // No business to read (no active organization).
        return (
            <StockLocked
                business={organization?.name ?? "this business"}
                role={organization ? roleWords(organization) : "a member"}
            />
        );
    }

    return (
        <PageContainer width="full">
            <StockScreen
                business={organization?.name ?? null}
                tab={tab}
                show={show}
                q={q}
                levels={levels}
                needsYou={all.needsYou ?? 0}
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
                pageSizes={{
                    levels: LEVELS_PAGE,
                    log: LOG_PAGE,
                    checks: CHECKS_PAGE,
                }}
            />
        </PageContainer>
    );
}
