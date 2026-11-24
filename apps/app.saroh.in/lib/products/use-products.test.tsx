// @vitest-environment jsdom
/**
 * Products on React Query (DEC-259), in the browser: a quick edit (archive,
 * price, add stock; owner 23 Nov) shows at once in every cached list page
 * and on the product's page, runs with the tab's business, and reads
 * Products once after; Undo puts it back the same way; a refused save
 * (the plan's limit) rolls the snapshot back, reads nothing and hands the
 * refusal to the caller untouched, so it says what it says today.
 */
import { act, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

import type { QuickEdits } from "@/components/commerce/quick-edits/quick-edits";
import {
    runOne,
    useQuickEdits,
} from "@/components/commerce/quick-edits/quick-edits";
import { catalogueProduct } from "@/lib/products/catalogue.fixture";
import type { ProductOverview } from "@/lib/products/overview-rules";
import type { ProductRead } from "@/lib/products/queries";
import { productRead, productsListRead } from "@/lib/products/queries";
import type { CataloguePage } from "@/lib/products/service";
import { useQuickEditsHost } from "@/lib/products/use-products";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const ORG = "org_1";

const page = (): CataloguePage => ({
    items: [catalogueProduct({ id: "a" }), catalogueProduct({ id: "b" })],
    nextCursor: null,
    total: 2,
    pageSize: 50,
    counts: { all: 2, collections: 0, inventory: 2 },
    storefronts: { everywhere: 2, byStorefront: [] },
    needs: [],
});
const overview = {
    product: { id: "a", status: "PUBLISHED", price: "4.80" },
    price: { min: "4.80", max: "4.80", mrp: null, savingPercent: null },
    stock: {
        mode: "product",
        variants: [],
        product: { onHand: 10, promised: 2, canSell: 8 },
        totals: { onHand: 10, promised: 2, canSell: 8, lowCount: 0 },
    },
} as unknown as ProductOverview;

const ALL = productsListRead.key(ORG, {});
const LIVE = productsListRead.key(ORG, { status: "PUBLISHED" });
const PAGE = productRead.key(ORG, { productId: "a", shelves: "1" });

const held: { host: QuickEdits | null } = { host: null };
function Grab() {
    // What a control takes, with no host around it.
    const quick = useQuickEdits();
    useEffect(() => {
        held.host = quick;
    });
    return null;
}
function Host() {
    const quick = useQuickEditsHost();
    useEffect(() => {
        held.host = quick;
    });
    return null;
}

function setup() {
    const client = makeTestClient();
    client.setQueryData(ALL, page());
    client.setQueryData(LIVE, page());
    client.setQueryData<ProductRead>(PAGE, { overview, stock: null });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const view = renderWithQuery(<Host />, { client, orgId: ORG });
    const status = () => ({
        all: client.getQueryData<CataloguePage>(ALL)?.items[0]?.status,
        live: client.getQueryData<CataloguePage>(LIVE)?.items[0]?.status,
        page: client.getQueryData<ProductRead>(PAGE)?.overview.product.status,
    });
    return { client, invalidate, view, status };
}

const quick = (): QuickEdits => {
    if (!held.host) throw new Error("no host");
    return held.host;
};

beforeEach(() => {
    held.host = null;
    vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise<Response>(() => undefined)),
    );
});
afterEach(() => vi.unstubAllGlobals());

describe("Products' quick edits", () => {
    it("shows an archive in every list page and on its page at once, sends the tab's business, and reads Products once", async () => {
        const { invalidate, view, status } = setup();
        let release: (v: { ok: boolean }[]) => void = () => undefined;
        const sent: (string | undefined)[] = [];
        let done: Promise<unknown> = Promise.resolve();
        await act(async () => {
            done = quick().run(["a"], { status: "ARCHIVED" }, (org) => {
                sent.push(org);
                return new Promise<{ ok: boolean }[]>((r) => (release = r));
            });
            await Promise.resolve();
        });
        expect(status()).toEqual({
            all: "ARCHIVED",
            live: "ARCHIVED",
            page: "ARCHIVED",
        });
        expect(sent).toEqual([ORG]);
        expect(invalidate).not.toHaveBeenCalled();
        await act(async () => {
            release([{ ok: true }]);
            await done;
        });
        // One read of Products (every list page and the page under one
        // key), Home only marked stale.
        const products = invalidate.mock.calls.filter(
            ([f]) => f?.queryKey?.[0] === "products",
        );
        expect(products).toHaveLength(1);
        expect(products[0]?.[0]).toEqual({ queryKey: ["products", ORG] });
        view.unmount();
    });

    it("Undo puts the old status back the same way", async () => {
        const { view, status } = setup();
        await act(() =>
            quick().run(["a"], { status: "ARCHIVED" }, () =>
                Promise.resolve([{ ok: true }]),
            ),
        );
        expect(status().all).toBe("ARCHIVED");
        await act(() =>
            quick().run(["a"], { status: "PUBLISHED" }, () =>
                Promise.resolve([{ ok: true }]),
            ),
        );
        expect(status()).toEqual({
            all: "PUBLISHED",
            live: "PUBLISHED",
            page: "PUBLISHED",
        });
        view.unmount();
    });

    it("a refused save (the plan's limit) rolls everything back, reads nothing and hands the refusal back untouched", async () => {
        const { invalidate, client, view, status } = setup();
        const refusal = {
            ok: false as const,
            error: "You've reached your plan's limit.",
            plan: { reason: "limit" },
        };
        let answer: unknown;
        await act(async () => {
            answer = await runOne(quick(), "a", { price: "9.99" }, () =>
                Promise.resolve(refusal),
            );
        });
        expect(answer).toBe(refusal);
        expect(client.getQueryData<CataloguePage>(ALL)?.items[0]?.price).toBe(
            page().items[0]?.price,
        );
        expect(client.getQueryData<ProductRead>(PAGE)?.overview.price.min).toBe(
            "4.80",
        );
        expect(status().page).toBe("PUBLISHED");
        expect(invalidate).not.toHaveBeenCalled();
        view.unmount();
    });

    it("a save that never got there rolls back and throws, for runAction to say so", async () => {
        const { view, client } = setup();
        await act(async () => {
            await expect(
                quick().run(
                    ["a"],
                    { stockAdd: { storeId: "s", units: 5 } },
                    () => Promise.reject(new Error("offline")),
                ),
            ).rejects.toThrow("offline");
        });
        expect(
            client.getQueryData<ProductRead>(PAGE)?.overview.stock.totals
                .onHand,
        ).toBe(10);
        view.unmount();
    });

    it("without a host (a test, a screen without one) the action just runs", async () => {
        const view = renderWithQuery(<Grab />);
        const action = vi.fn(() => Promise.resolve([{ ok: true }]));
        await act(() => quick().run(["a"], { status: "ARCHIVED" }, action));
        expect(action).toHaveBeenCalledWith();
        view.unmount();
    });
});
