// @vitest-environment jsdom
/**
 * Stock on React Query, first paint (owner, 25 Nov): the header, its
 * buttons, the tabs and the Levels toolbar are drawn at once and work
 * before any data; only the rows are skeletons, replaced in place when the
 * levels land; the tabs' counts wait and Count stock waits for the rows.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => {
    const { useSyncExternalStore } = await import("react");
    const subscribe = (onChange: () => void) => {
        window.addEventListener("popstate", onChange);
        return () => window.removeEventListener("popstate", onChange);
    };
    return {
        useSearchParams: () =>
            new URLSearchParams(
                useSyncExternalStore(subscribe, () => window.location.search),
            ),
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            refresh: vi.fn(),
        }),
        usePathname: () => "/commerce/stock",
    };
});
vi.mock("@/lib/api/http", () => ({}));

import { StockContainer } from "@/components/commerce/stock/stock-container";
import { renderWithQuery, typeSearch } from "@/lib/query/test-utils";

const LEVELS = {
    storefronts: [{ id: "s1", name: "Hill Road" }],
    rows: [
        {
            productId: "p1",
            productName: "House blend beans",
            productStatus: "PUBLISHED",
            image: null,
            variantId: "v1",
            variantTitle: "1kg",
            sku: null,
            cells: [
                {
                    storeId: "s1",
                    stockLevelId: "l1",
                    soldHere: true,
                    onHand: 2,
                    promised: 0,
                    canSell: 2,
                    short: 0,
                    warnAt: 4,
                    word: "LOW",
                    lastChange: null,
                },
            ],
            lastChange: null,
        },
    ],
    untracked: [],
    tracking: true,
    canWrite: true,
    total: 1,
    needsYou: 3,
};
const CHECKS = {
    checks: [],
    counts: {
        SHORT: 2,
        COUNT_MISMATCH: 0,
        SALE_NOT_TAKEN: 0,
        PROMISED_MISMATCH: 0,
    },
    canResolve: true,
    total: 0,
};

let release: () => void;
const reads: string[] = [];

beforeEach(() => {
    window.history.replaceState(null, "", "/commerce/stock");
    reads.length = 0;
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    release = open;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url);
            await gate;
            const body = url.startsWith("/api/stock/checks") ? CHECKS : LEVELS;
            return new Response(JSON.stringify(body), { status: 200 });
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

function open() {
    return renderWithQuery(
        <StockContainer
            canWrite
            business="Rye"
            storefronts={[{ id: "s1", name: "Hill Road" }]}
            sizes={{ levels: 50, log: 50, checks: 50 }}
        />,
    );
}

const button = (host: HTMLElement, name: string) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
const tabsText = (host: HTMLElement) =>
    host.querySelector('[aria-label="Stock views"]')?.textContent ?? "";

describe("Stock before its first read", () => {
    it("draws the real frame and skeleton rows, then the rows in their place", async () => {
        const { host, unmount } = open();
        await tick();
        expect(host.querySelector("h1")?.textContent).toContain("Stock");
        expect(
            host.querySelector('input[placeholder="Search stock"]'),
        ).not.toBeNull();
        expect(tabsText(host)).toContain("Checks");
        // Record stock opens a sheet from the page's storefronts: it works.
        expect(button(host, "Record stock")?.disabled).toBe(false);
        // Counting is typed into rows that aren't here yet.
        expect(button(host, "Count stock")?.disabled).toBe(true);
        expect(host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(host.textContent).not.toContain("House blend beans");
        expect(tabsText(host)).not.toMatch(/\d|—/);

        release();
        await tick(50);
        expect(host.querySelector('[data-shape="rows"]')).toBeNull();
        expect(host.textContent).toContain("House blend beans");
        expect(button(host, "Count stock")?.disabled).toBe(false);
        expect(tabsText(host)).toMatch(/3/);
        unmount();
    });

    it("a search typed before the data keys the read", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { host, unmount } = open();
        await tick();
        typeSearch(
            host.querySelector<HTMLInputElement>(
                'input[placeholder="Search stock"]',
            ),
            "beans",
        );
        await tick();
        vi.useRealTimers();
        expect(window.location.search).toContain("q=beans");
        expect(
            reads.some(
                (u) => u.startsWith("/api/stock?") && u.includes("q=beans"),
            ),
        ).toBe(true);
        release();
        unmount();
    });
});
