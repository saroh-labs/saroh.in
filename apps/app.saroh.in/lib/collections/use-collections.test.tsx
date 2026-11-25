// @vitest-environment jsdom
/**
 * Collections' and Product settings' saves (DEC-259), in the browser: each
 * reads what is on screen once and nothing else, and marks the rest stale.
 * A collection reordered over the Collections view reads the collections
 * and the list's page once each; a category edit in Product settings reads
 * the settings page once, and leaves Products and Collections stale for
 * their next visit.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { collectionsRead } from "@/lib/collections/queries";
import type { CollectionSave } from "@/lib/collections/use-collections";
import {
    useCollections,
    useCollectionSave,
} from "@/lib/collections/use-collections";
import {
    categoriesRead,
    productSettingsRead,
    productsListRead,
} from "@/lib/products/queries";
import type { ProductSettingsSave } from "@/lib/products/use-product-settings";
import {
    useProductSettings,
    useProductSettingsSave,
} from "@/lib/products/use-product-settings";
import { useProductsList } from "@/lib/products/use-products";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const ORG = "org_1";
const LIST = { view: "collections" as const };

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

/** Already read, past its fresh moment. */
function seeded(keys: readonly (readonly unknown[])[]) {
    const client = makeTestClient();
    for (const key of keys) {
        client.setQueryData(key, {}, { updatedAt: Date.now() - 600_000 });
    }
    return client;
}

function CollectionsView({ report }: { report: (s: CollectionSave) => void }) {
    useProductsList(LIST);
    useCollections();
    report(useCollectionSave());
    return null;
}

function SettingsPage({
    report,
}: {
    report: (s: ProductSettingsSave) => void;
}) {
    useProductSettings({});
    report(useProductSettingsSave());
    return null;
}

describe("a collection save (made, reordered, filled)", () => {
    it("reads the collections and the list's page once each", async () => {
        const client = seeded([
            productsListRead.options(ORG, LIST).queryKey,
            collectionsRead.options(ORG, {}).queryKey,
        ]);
        let save!: CollectionSave;
        const { unmount } = renderWithQuery(
            <CollectionsView report={(s) => (save = s)} />,
            { client, orgId: ORG },
        );
        await tick();
        fetchMock.mockClear();
        await act(() => save.saved());
        await tick();
        expect(paths().sort()).toEqual(["/api/collections", "/api/products"]);
        unmount();
    });
});

describe("a Product settings save (a category added, renamed, merged)", () => {
    it("reads the settings page once and marks Products, Collections and the categories stale", async () => {
        const stale = [
            productsListRead.options(ORG, {}).queryKey,
            collectionsRead.options(ORG, {}).queryKey,
            categoriesRead.options(ORG, {}).queryKey,
        ];
        const client = seeded([
            productSettingsRead.options(ORG, {}).queryKey,
            ...stale,
        ]);
        let save!: ProductSettingsSave;
        const { unmount } = renderWithQuery(
            <SettingsPage report={(s) => (save = s)} />,
            { client, orgId: ORG },
        );
        await tick();
        fetchMock.mockClear();
        await act(() => save.saved());
        await tick();
        expect(paths()).toEqual(["/api/products/settings"]);
        for (const key of stale) {
            expect(client.getQueryState(key)?.isInvalidated).toBe(true);
        }
        unmount();
    });
});
