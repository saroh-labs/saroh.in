import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { StockHref } from "@/lib/stock/list-query";
import { stockHref } from "@/lib/stock/list-query";
import type {
    StockCheck,
    StockChecks,
    StockLevelRow,
    StockLevels,
} from "@/lib/stock/service";

import { ChecksList } from "./checks-list";
import { LevelsPanel } from "./levels-panel";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/stock/screen-actions", () => ({
    resolveStockCheck: vi.fn(),
    undoStock: vi.fn(),
}));

/**
 * Levels and Checks end with the one list footer: rows per page, the page
 * numbers, Previous and Next, each an address of this screen. Neither has a
 * "Show more".
 */

const FIRST = { page: 1, size: 50 };

/** The screen's own links, with `tab` on screen and its list at `page`. */
function hrefAt(tab: "levels" | "checks", page: number, size: number) {
    const href: StockHref = (change) =>
        stockHref(
            {
                tab,
                show: "all",
                q: "",
                kind: "all",
                store: "all",
                product: "",
                pages: {
                    levels: FIRST,
                    log: FIRST,
                    checks: FIRST,
                    [tab]: { page, size },
                },
            },
            change,
        );
    return href;
}

const markup = (node: React.ReactNode) =>
    renderToStaticMarkup(<>{node}</>).replace(/&amp;/g, "&");

function row(n: number): StockLevelRow {
    return {
        productId: `p${n}`,
        productName: `Loaf ${n}`,
        productStatus: "ACTIVE",
        image: null,
        variantId: null,
        variantTitle: null,
        sku: null,
        cells: [],
        lastChange: null,
    };
}

function levels(total: number | undefined, rows = 10): StockLevels {
    return {
        storefronts: [{ id: "s1", name: "Hill Road" }],
        rows: Array.from({ length: rows }, (_, i) => row(i)),
        untracked: [],
        tracking: true,
        canWrite: true,
        total,
        timezone: "Asia/Kolkata",
    };
}

function drawLevels(of: StockLevels, page = 1, size = 10) {
    return markup(
        <LevelsPanel
            levels={of}
            allStorefronts={of.storefronts}
            needsYou={0}
            show="all"
            q=""
            href={hrefAt("levels", page, size)}
            counting={false}
            values={{}}
            onValue={() => undefined}
            paging={{ page, size }}
        />,
    );
}

describe("Levels' footer", () => {
    it("pages by number, counting products, under the table", () => {
        const out = drawLevels(levels(34), 2);
        expect(out).toContain('aria-label="Rows per page"');
        expect(out).toContain('aria-label="Pages of stock levels"');
        expect(out).toMatch(/data-list-range=""[^>]*>11 to 20 of 34</);
        // Page 1 is the address with no page; the size stays in it.
        expect(out).toContain('href="/commerce/stock?size=10"');
        expect(out).toContain('href="/commerce/stock?page=3&size=10"');
        expect(out).not.toContain("Show more");
        expect(out.indexOf("data-list-paging")).toBeGreaterThan(
            out.indexOf("data-list-table"),
        );
    });

    it("draws no footer for a list that fits the smallest page", () => {
        expect(drawLevels(levels(7, 7))).not.toContain("data-list-paging");
    });
});

function check(n: number): StockCheck {
    return {
        key: `short:${n}`,
        kind: "SHORT",
        title: "2 short",
        detail: "5 units promised to orders, 3 on hand at Hill Road.",
        storeId: "s1",
        storeName: "Hill Road",
        productId: `p${n}`,
        productName: `Loaf ${n}`,
        variantId: null,
        variantTitle: null,
        stockLevelId: `l${n}`,
        entryId: null,
        numbers: { onHand: 3, promised: 5, short: 2 },
        order: null,
        at: null,
    };
}

function drawChecks(total: number, shown: number, page = 1) {
    const checks: StockChecks = {
        checks: Array.from({ length: shown }, (_, i) => check(i)),
        counts: {
            SHORT: total,
            COUNT_MISMATCH: 0,
            SALE_NOT_TAKEN: 0,
            PROMISED_MISMATCH: 0,
        },
        canResolve: true,
        total,
    };
    return markup(
        <ChecksList
            checks={checks}
            href={hrefAt("checks", page, 25)}
            paging={{ page, size: 25 }}
        />,
    );
}

describe("Checks' footer", () => {
    it("pages by number under the checks", () => {
        const out = drawChecks(60, 25, 2);
        expect(out.match(/<article /g)).toHaveLength(25);
        expect(out).toContain('aria-label="Rows per page"');
        expect(out).toContain('aria-label="Pages of stock checks"');
        expect(out).toMatch(/data-list-range=""[^>]*>26 to 50 of 60</);
        expect(out).toContain(
            'href="/commerce/stock?tab=checks&checksSize=25"',
        );
        expect(out).toContain(
            'href="/commerce/stock?tab=checks&checksPage=3&checksSize=25"',
        );
        expect(out).not.toContain("Show more");
    });

    it("draws no footer for a list that fits the smallest page", () => {
        expect(drawChecks(3, 3)).not.toContain("data-list-paging");
    });
});
