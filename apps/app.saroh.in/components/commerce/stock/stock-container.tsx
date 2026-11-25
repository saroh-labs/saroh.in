"use client";

import {
    DEFAULT_PAGE_SIZE,
    ROWS_COOKIE,
    readRowsCookie,
} from "@saroh/ui/lib/paging";
import { PageContainer } from "@saroh/ui/page-container";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ScreenPending } from "@/components/shared/page/screen-pending";
import type { StockTab } from "@/lib/stock/list-query";
import { STOCK_LISTS, stockHref } from "@/lib/stock/list-query";
import { logKindId } from "@/lib/stock/log";
import { stockView } from "@/lib/stock/queries";
import {
    useStockChecks,
    useStockLevels,
    useStockLog,
} from "@/lib/stock/use-stock";

import { StockScreen } from "./stock-screen";

type Sizes = Record<StockTab, number>;

/**
 * Each list's rows per page when the address names none: the server's read
 * of the cookie, then this browser's own once a size has been chosen here.
 */
function rememberedSizes(server: Sizes): Sizes {
    if (typeof document === "undefined") return server;
    const found = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${ROWS_COOKIE}=`));
    const sizes = readRowsCookie(
        found ? decodeURIComponent(found.slice(ROWS_COOKIE.length + 1)) : "",
    );
    const of = (tab: StockTab) => sizes[STOCK_LISTS[tab]] ?? DEFAULT_PAGE_SIZE;
    return { levels: of("levels"), log: of("log"), checks: of("checks") };
}

/**
 * Sell › Stock on React Query (DEC-259): the same `StockScreen`, its
 * levels, checks and (on its tab) log each a query keyed on what the
 * address asks (`stockView`), read in the browser. The frame (header and
 * its buttons, tabs, each list's toolbar) is drawn at once and works; the
 * rows are skeletons until the open tab's list is here (owner, 25 Nov),
 * and the buttons follow the page's `canWrite` until the levels say. A tab, a
 * filter or a page changes the address in place; the last rows stay,
 * greyed, until the new ones land, and the Log tab opens once its first
 * page is here. Levels failing fails the page; the log and the checks
 * fail on their own, named where they show.
 */
export function StockContainer({
    business,
    storefronts,
    sizes,
    canWrite,
}: {
    /** Who may change stock, from the page's gates, until the levels say. */
    canWrite: boolean;
    business: string | null;
    /** The business's open storefronts, first made first. */
    storefronts: { id: string; name: string }[];
    /** Each list's rows per page this browser last chose, as the server read it. */
    sizes: Sizes;
}) {
    const search = useSearchParams();
    const view = useMemo(
        () =>
            stockView(
                Object.fromEntries(search.entries()),
                rememberedSizes(sizes),
                storefronts,
            ),
        [search, sizes, storefronts],
    );
    const { address } = view;
    const onLog = address.tab === "log";
    const levels = useStockLevels(view.levels);
    const checks = useStockChecks(view.checks);
    const log = useStockLog(view.log, onLog);

    // The Log opens once its first page is here; until then the tab that
    // was open stays, greyed.
    const logReady = log.data !== undefined || log.isError;
    const [shown, setShown] = useState<StockTab>(address.tab);
    const tab = !onLog || logReady ? address.tab : shown;
    if (tab !== shown) setShown(tab);

    // A page past the end (the list has since got shorter, or the address
    // was typed): the first page, in place.
    const active =
        address.tab === "levels"
            ? { q: levels, rows: levels.data?.rows }
            : address.tab === "log"
              ? { q: log, rows: log.data?.entries }
              : { q: checks, rows: checks.data?.checks };
    const pastTheEnd =
        address.pages[address.tab].page > 1 &&
        !active.q.isPlaceholderData &&
        active.rows?.length === 0;
    useEffect(() => {
        if (pastTheEnd) {
            window.history.replaceState(
                null,
                "",
                stockHref(address, { page: 1 }),
            );
        }
    }, [pastTheEnd, address]);

    // Levels is the screen's own read: it failing is the page failing.
    if (levels.isError && !levels.data) throw levels.error;
    // Before the first read the rows are skeletons, not greyed rows.
    const pending =
        !!levels.data &&
        (levels.isPlaceholderData ||
            checks.isPlaceholderData ||
            (onLog && (!logReady || log.isPlaceholderData)));

    return (
        <PageContainer width="full">
            <ScreenPending inPlace={{ pending }}>
                <StockScreen
                    business={business}
                    tab={tab}
                    show={address.show}
                    q={address.q}
                    levels={levels.data ?? null}
                    needsYou={levels.data ? (levels.data.needsYou ?? 0) : null}
                    storefronts={storefronts}
                    checks={checks.data ?? (checks.isError ? "failed" : null)}
                    log={
                        tab === "log"
                            ? (log.data ?? (log.isError ? "failed" : null))
                            : null
                    }
                    logFilter={{
                        kind: logKindId(address.kind),
                        store: address.store,
                        product: address.product,
                        date: address.date,
                        from: address.from,
                        to: address.to,
                    }}
                    products={log.data?.products ?? []}
                    canWrite={levels.data?.canWrite ?? canWrite}
                    pages={address.pages}
                    reload={{
                        log: () => void log.refetch(),
                        checks: () => void checks.refetch(),
                    }}
                />
            </ScreenPending>
        </PageContainer>
    );
}
