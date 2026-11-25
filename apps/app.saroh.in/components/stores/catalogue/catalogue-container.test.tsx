// @vitest-environment jsdom
/**
 * Products on React Query, first paint (owner, 25 Nov): the real frame is
 * drawn at once from the page's props (heading, tabs, search, filters) and
 * works before any data; only the rows are skeletons, replaced in place
 * when the page lands; the count and the tabs' counts wait for it.
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
        usePathname: () => "/commerce/products",
    };
});
vi.mock("@/lib/api/http", () => ({}));

import { CatalogueContainer } from "@/components/stores/catalogue/catalogue-container";
import { catalogueProduct } from "@/lib/products/catalogue.fixture";
import { renderWithQuery, typeSearch } from "@/lib/query/test-utils";

const PAGE = {
    items: [catalogueProduct({ id: "p1", name: "Cinnamon bun" })],
    nextCursor: null,
    total: 1,
    pageSize: 50,
    counts: { all: 1, collections: 0, inventory: 1 },
    storefronts: { everywhere: 1, byStorefront: [] },
    needs: [],
};

let release: () => void;
const reads: string[] = [];

beforeEach(() => {
    // jsdom has no matchMedia.
    window.matchMedia = ((q: string) => ({
        matches: false,
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    window.history.replaceState(null, "", "/commerce/products");
    reads.length = 0;
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    release = open;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url);
            await gate;
            return new Response(JSON.stringify(PAGE), { status: 200 });
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

function open() {
    return renderWithQuery(
        <CatalogueContainer
            defaultSize={50}
            reviewsCount={null}
            showInventory
            showReviews={false}
            stores={[{ id: "s1", name: "Hill Road" }]}
            choices={{ categories: [], collections: [] }}
            canWrite
            canStock
        />,
    );
}

const tabsText = (host: HTMLElement) =>
    host.querySelector('[aria-label="Products"]')?.textContent ?? "";

describe("Products before its first page", () => {
    it("draws the real frame and skeleton rows, then the rows in their place", async () => {
        const { host, unmount } = open();
        await tick();
        expect(host.querySelector("h1")?.textContent).toContain("Products");
        expect(
            host.querySelector('input[placeholder="Search products"]'),
        ).not.toBeNull();
        expect(host.querySelector('[aria-label="Status"]')).not.toBeNull();
        expect(tabsText(host)).toContain("All");
        // The data: skeleton rows, no product, no counts (never a 0).
        expect(host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(host.textContent).not.toContain("Cinnamon bun");
        expect(
            host.querySelector('[data-slot="figure-loading"]'),
        ).not.toBeNull();
        expect(tabsText(host)).not.toMatch(/\d|—/);

        release();
        await tick(50);
        expect(host.querySelector('[data-shape="rows"]')).toBeNull();
        expect(host.textContent).toContain("Cinnamon bun");
        expect(host.querySelector('[data-slot="figure-loading"]')).toBeNull();
        expect(tabsText(host)).toMatch(/1/);
        unmount();
    });

    it("a search typed before the data keys the read", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { host, unmount } = open();
        await tick();
        typeSearch(
            host.querySelector<HTMLInputElement>(
                'input[placeholder="Search products"]',
            ),
            "bun",
        );
        await tick();
        vi.useRealTimers();
        expect(window.location.search).toContain("q=bun");
        expect(
            reads.some(
                (u) => u.startsWith("/api/products?") && u.includes("q=bun"),
            ),
        ).toBe(true);
        release();
        unmount();
    });
});
