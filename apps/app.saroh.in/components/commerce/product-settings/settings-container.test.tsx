// @vitest-environment jsdom
/**
 * Product settings on React Query (DEC-259), first paint: the tabs at once
 * (no counts yet, never a 0), the tab's body a skeleton until the one read
 * lands, then the categories in its place; a read that fails is the page's
 * failed state, never an empty list.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/products/settings-actions", () => ({}));
vi.mock("@/lib/api/http", () => ({}));

import { renderWithQuery } from "@/lib/query/test-utils";

import { ProductSettingsContainer } from "./settings-container";

const CATALOGUE = {
    categories: [
        {
            id: "c1",
            name: "Bread",
            slug: "bread",
            parentId: null,
            productCount: 3,
        },
    ],
    uncategorizedCount: 0,
    options: [],
    defaults: {
        entries: {},
        stillOnDefault: {},
        productCounts: {},
        suggestions: [],
    },
    canWrite: true,
};

let answer: () => Response;
let release: () => void;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    release = open;
    answer = () =>
        new Response(
            JSON.stringify({
                catalogue: CATALOGUE,
                fields: [],
                allergens: null,
            }),
        );
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
            await gate;
            return answer();
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tabsText = (host: HTMLElement) =>
    host.querySelector('[aria-label="Product settings"]')?.textContent ?? "";

describe("Product settings before its read", () => {
    it("draws the tabs and a skeleton, then the categories in its place", async () => {
        const { host, unmount } = renderWithQuery(
            <ProductSettingsContainer tab="categories" />,
        );
        await tick();
        expect(tabsText(host)).toContain("Categories");
        expect(tabsText(host)).not.toMatch(/\d/);
        expect(host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(host.textContent).not.toContain("Bread");

        release();
        await tick(50);
        expect(host.querySelector('[data-shape="rows"]')).toBeNull();
        expect(host.textContent).toContain("Bread");
        expect(tabsText(host)).toMatch(/2/);
        unmount();
    });

    it("a read that fails is the failed state, not an empty list", async () => {
        answer = () =>
            new Response(JSON.stringify({ code: "unavailable" }), {
                status: 503,
            });
        const { host, unmount } = renderWithQuery(
            <ProductSettingsContainer tab="categories" />,
        );
        release();
        await tick(50);
        expect(host.textContent).toContain("Couldn't load product settings");
        expect(host.textContent).not.toContain("Uncategorized");
        unmount();
    });
});
