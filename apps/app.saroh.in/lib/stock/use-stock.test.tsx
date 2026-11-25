// @vitest-environment jsdom
/**
 * Stock on React Query (DEC-259), in the browser: a stock change reads
 * what Stock has on screen once each (levels, checks) and nothing else,
 * marking Products, Orders and Home stale for their next visit; a change
 * from a product's page (Products' save) reads the product and its Stock
 * tab's log and checks once each.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { productRead } from "@/lib/products/queries";
import { useProduct, useProductsSaved } from "@/lib/products/use-products";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";
import {
    ALL_CHECKS,
    productLogAsk,
    stockChecksRead,
    stockLevelsRead,
    stockLogRead,
    stockView,
} from "@/lib/stock/queries";
import type { StockSave } from "@/lib/stock/use-stock";
import {
    useStockChecks,
    useStockLevels,
    useStockLog,
    useStockSave,
} from "@/lib/stock/use-stock";

const ORG = "org_1";
const VIEW = stockView({}, {}, []);
const SEEN = [
    domainKey("products", ORG, "list", {}),
    domainKey("orders", ORG, "list", {}),
    domainKey("home", ORG, "home"),
];

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));
const paths = () =>
    fetchMock.mock.calls.map(([url]) => (url as string).split("?")[0]);

beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("{}", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** Already read on an earlier visit, past its fresh moment. */
function seeded(keys: readonly (readonly unknown[])[]) {
    const client = makeTestClient();
    for (const key of [...keys, ...SEEN]) {
        client.setQueryData(key, {}, { updatedAt: Date.now() - 60_000 });
    }
    return client;
}

function Stock({ report }: { report: (save: StockSave) => void }) {
    useStockLevels(VIEW.levels);
    useStockChecks(VIEW.checks);
    report(useStockSave());
    return null;
}

describe("a stock change", () => {
    it("reads the levels and checks on screen once each, and marks the rest stale", async () => {
        const client = seeded([
            stockLevelsRead.options(ORG, VIEW.levels).queryKey,
            stockChecksRead.options(ORG, VIEW.checks).queryKey,
            // A sheet's whole list, closed: marked stale, not read.
            stockLevelsRead.options(ORG, {}).queryKey,
        ]);
        let save!: StockSave;
        const { unmount } = renderWithQuery(
            <Stock report={(s) => (save = s)} />,
            { client, orgId: ORG },
        );
        await tick();
        fetchMock.mockClear();

        await act(() => save.saved());
        await tick();
        expect(paths().sort()).toEqual(["/api/stock", "/api/stock/checks"]);
        for (const key of [
            ...SEEN,
            stockLevelsRead.options(ORG, {}).queryKey,
        ]) {
            expect(client.getQueryState(key)?.isInvalidated).toBe(true);
        }
        unmount();
    });
});

function ProductStockTab({
    report,
}: {
    report: (saved: () => Promise<void>) => void;
}) {
    useProduct({ productId: "p1", shelves: "1" });
    useStockLog(productLogAsk("p1"));
    useStockChecks(ALL_CHECKS);
    report(useProductsSaved());
    return null;
}

describe("a stock change on a product's Stock tab", () => {
    it("reads the product, its log and the checks once each", async () => {
        const client = seeded([
            productRead.options(ORG, { productId: "p1", shelves: "1" })
                .queryKey,
            stockLogRead.options(ORG, productLogAsk("p1")).queryKey,
            stockChecksRead.options(ORG, ALL_CHECKS).queryKey,
        ]);
        let saved!: () => Promise<void>;
        const { unmount } = renderWithQuery(
            <ProductStockTab
                report={(s) => {
                    saved = s;
                }}
            />,
            { client, orgId: ORG },
        );
        await tick();
        fetchMock.mockClear();

        await act(async () => {
            await saved();
        });
        await tick();
        expect(paths().sort()).toEqual([
            "/api/products/p1",
            "/api/stock/checks",
            "/api/stock/log",
        ]);
        unmount();
    });
});
