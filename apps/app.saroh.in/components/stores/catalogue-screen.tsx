"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState, useTransition } from "react";

import { NeedsYou } from "@/components/commerce/needs-you";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataView } from "@/components/shared/data-view/data-view";
import type { ProductRating } from "@/lib/product-reviews/service";
import { deleteProduct, updateProduct } from "@/lib/products/actions";
import type { CatalogueRow } from "@/lib/products/catalogue";
import { catalogueRows } from "@/lib/products/catalogue";
import type { FilterChoices } from "@/lib/products/filter-choices";
import { productEditHref, productHref } from "@/lib/products/links";
import {
    duplicateListedProduct,
    loadCataloguePage,
} from "@/lib/products/list-actions";
import type { ListQuery } from "@/lib/products/list-query";
import {
    catalogueFilter,
    emptyCopy,
    listHref,
} from "@/lib/products/list-query";
import { step } from "@/lib/products/quick-look";
import type { CataloguePage, ProductStatus } from "@/lib/products/service";

import { catalogueColumns, RowMenu } from "./catalogue/catalogue-columns";
import { emptyState, NoStorefront } from "./catalogue/catalogue-empty";
import { CatalogueHeader } from "./catalogue/catalogue-header";
import { CatalogueToolbar } from "./catalogue/catalogue-toolbar";
import { QuickLook } from "./catalogue/quick-look";

/** The most rows one read brings back (the API's cap). */
const MOST = 200;
const PAGE = 50;

/**
 * Sell → Products, after the "Saroh Products Screen" design (#519, #520).
 *
 * The catalogue belongs to the business (#531): one row per product,
 * naming each storefront that sells it. A storefront is a filter on that
 * one catalogue, not a scope. Everything that narrows the list lives in the
 * address and is answered by the API a page at a time — search, the chips,
 * Filter and "Needs you" cover the whole catalogue, not the rows on screen.
 *
 * The row is the action: anywhere on it opens the quick look, and the
 * product's own page is one step further. Selection gives the bulk bar
 * (Publish · Archive · Delete); the row menu holds Preview · Edit ·
 * Duplicate · Archive · Delete, with Delete below a divider and confirmed.
 * Publishing and archiving act at once and offer Undo.
 */
export function CatalogueScreen({
    query,
    page,
    stores,
    tabs,
    notice,
    ratings = [],
    choices,
    canWrite,
    canStock,
    collectionsPanel,
    collectionCount = null,
}: {
    query: ListQuery;
    /** The first page, read on the server. */
    page: CataloguePage;
    stores: { id: string; name: string }[];
    /** All · Collections · Inventory · Reviews, under Needs you. */
    tabs: ReactNode;
    /** A partial notice above the list, when a side read failed. */
    notice?: ReactNode;
    ratings?: ProductRating[];
    choices: FilterChoices;
    /** `store:write`: publish, archive, duplicate, delete, new products. */
    canWrite: boolean;
    /** Count and move stock: "+N · Add" in the quick look. */
    canStock: boolean;
    /** The Collections chip's cards and sheet (#524), under the chips. */
    collectionsPanel?: ReactNode;
    /** How many collections there are; null when they couldn't be read. */
    collectionCount?: number | null;
}) {
    const router = useRouter();
    const [navigating, startNavigation] = useTransition();
    const [data, setData] = useState(page);
    const [extra, setExtra] = useState<CataloguePage["items"]>([]);
    /** Where the rows loaded after the first page end. */
    const [extraCursor, setExtraCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<CatalogueRow[] | null>(
        null,
    );

    // A new first page from the server (a new address, or a refresh) starts
    // the list again.
    // (Adjusted while rendering, as React recommends, not in an effect.)
    const [seen, setSeen] = useState(page);
    if (seen !== page) {
        setSeen(page);
        setData(page);
        setExtra([]);
        setExtraCursor(null);
    }

    const rows = useMemo(
        () => catalogueRows([...data.items, ...extra]),
        [data.items, extra],
    );
    const ratingById = useMemo(
        () => new Map(ratings.map((r) => [r.productId, r])),
        [ratings],
    );
    const store = stores.find((s) => s.id === query.storefront) ?? null;
    const many = stores.length > 1;
    const first = stores.at(0);
    const filter = catalogueFilter(query);

    const go = useCallback(
        (patch: Partial<ListQuery>) =>
            startNavigation(() =>
                router.replace(listHref(query, patch), { scroll: false }),
            ),
        [query, router],
    );

    /** Read the rows already on screen again, and the counts with them. */
    async function reload() {
        const res = await loadCataloguePage({
            ...filter,
            limit: Math.min(MOST, Math.max(PAGE, rows.length)),
        });
        if (!res.ok) {
            showError("The list couldn't be refreshed.", res.error);
            return;
        }
        setData(res.data);
        setExtra([]);
        setExtraCursor(null);
    }

    async function loadMore(): Promise<CatalogueRow[] | null> {
        const cursor = extraCursor ?? data.nextCursor;
        if (!cursor || loadingMore) return null;
        setLoadingMore(true);
        const res = await loadCataloguePage({ ...filter, cursor, limit: PAGE });
        setLoadingMore(false);
        if (!res.ok) {
            showError("More products couldn't be loaded.", res.error);
            return null;
        }
        setExtra((had) => [...had, ...res.data.items]);
        setExtraCursor(res.data.nextCursor);
        return catalogueRows(res.data.items);
    }
    const more = extra.length > 0 ? extraCursor : data.nextCursor;

    async function setStatus(
        targets: CatalogueRow[],
        status: ProductStatus,
        clear?: () => void,
    ) {
        const before = targets.map((r) => ({ ...r, was: r.status }));
        const results = await Promise.all(
            targets.map((r) =>
                updateProduct(r.id, { name: r.name, price: r.price, status }),
            ),
        );
        const failed = results.filter((r) => !r.ok).length;
        if (failed > 0) {
            showError(
                `${failed} of ${targets.length} could not be changed.`,
                "The rest were saved. Try the others again.",
            );
        }
        clear?.();
        await reload();
        const one = targets.length === 1 ? targets[0] : undefined;
        const said =
            status === "ARCHIVED"
                ? one
                    ? `Stopped selling ${one.name} — it's hidden from ${many ? "every storefront" : "your storefront"} until you sell it again.`
                    : `${targets.length} products archived.`
                : one
                  ? `${one.name} is on sale.`
                  : `${targets.length} products published.`;
        showUndo(said, () => {
            void Promise.all(
                before.map((r) =>
                    updateProduct(r.id, {
                        name: r.name,
                        price: r.price,
                        status: r.was,
                    }),
                ),
            ).then(() => reload());
        });
    }

    async function confirmDelete() {
        const targets = pendingDelete ?? [];
        setPendingDelete(null);
        const results = await Promise.all(
            targets.map((r) => deleteProduct(r.id)),
        );
        const failed = results.filter((r) => !r.ok).length;
        if (failed > 0) {
            showError(`${failed} of ${targets.length} could not be deleted.`);
        }
        setOpenId(null);
        await reload();
    }

    async function duplicate(row: CatalogueRow) {
        const res = await duplicateListedProduct(row.id, query.storefront);
        if (!res.ok) {
            showError("It couldn't be duplicated.", res.error);
            return;
        }
        showSuccess(`${res.data.name} is a draft — stock starts at 0.`);
        router.push(productEditHref(res.data.storeId, res.data.id));
    }

    const openIndex = rows.findIndex((r) => r.id === openId);
    const open = openIndex >= 0 ? (rows[openIndex] ?? null) : null;
    const onStep = useCallback(
        (by: 1 | -1) => {
            const next = step(openIndex, by, rows.length);
            if (next !== openIndex) {
                setOpenId(rows[next]?.id ?? null);
                return;
            }
            // At the last loaded row with more to come: fetch, then move on.
            if (by === 1 && more) {
                void loadMore().then((added) => {
                    const id = added?.at(0)?.id;
                    if (id) setOpenId(id);
                });
            }
        },
        // loadMore reads state it closes over; the index and rows are what move.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [openIndex, rows, more],
    );

    if (stores.length === 0 || !first) {
        return (
            <div className="space-y-5">
                <CatalogueHeader
                    stores={stores}
                    storeId={null}
                    canWrite={false}
                />
                <NoStorefront canWrite={canWrite} />
            </div>
        );
    }

    const empty = emptyCopy(
        query,
        store?.name ?? (many ? null : first.name),
        collectionCount,
    );
    const countLabel =
        `${data.total} ${data.total === 1 ? "product" : "products"}` +
        (store
            ? ` sold at ${store.name}`
            : many
              ? ` across ${stores.length} storefronts`
              : "");

    return (
        <div className="space-y-3">
            <CatalogueHeader
                stores={stores}
                storeId={query.storefront}
                canWrite={canWrite}
            />
            <NeedsYou
                needs={data.needs}
                restockHref={(id) =>
                    productHref(query.storefront, id, "variants")
                }
                onlyThese={query.view === "needs"}
                toggleHref={listHref(query, {
                    view: query.view === "needs" ? "all" : "needs",
                })}
            />
            {/* Each slot the page hands over in a fragment of its own: a
                server element can arrive as a lazy chunk, and a lazy one
                among siblings is keyed like a list item — React's "unique
                key" warning. Alone in a fragment it is a single child. */}
            <>{tabs}</>
            <>{notice}</>
            <>{collectionsPanel}</>
            <div aria-busy={navigating} className="pt-0.5">
                <DataView
                    viewId="catalogue"
                    rows={rows}
                    columns={catalogueColumns({
                        many,
                        filtered: !!store,
                        ratingById,
                    })}
                    rowKey={(r) => r.key}
                    modes={["table", "list"]}
                    hideModeToggle
                    noun={{ one: "product", other: "products" }}
                    toolbarExtra={
                        <CatalogueToolbar
                            query={query}
                            go={go}
                            storefronts={data.storefronts}
                            choices={choices}
                        />
                    }
                    countLabel={() => countLabel}
                    onRowClick={(r) => setOpenId(r.id)}
                    selectable={canWrite}
                    bulkActions={[
                        {
                            id: "publish",
                            label: "Publish",
                            run: (targets, clear) =>
                                void setStatus(targets, "PUBLISHED", clear),
                        },
                        {
                            id: "archive",
                            label: "Archive",
                            run: (targets, clear) =>
                                void setStatus(targets, "ARCHIVED", clear),
                        },
                        {
                            id: "delete",
                            label: "Delete",
                            tone: "destructive",
                            run: (targets, clear) => {
                                setPendingDelete(targets);
                                clear();
                            },
                        },
                    ]}
                    rowActions={(r) => (
                        <RowMenu
                            row={r}
                            editHref={productEditHref(query.storefront, r.id)}
                            canWrite={canWrite}
                            canStock={canStock}
                            onPreview={() => setOpenId(r.id)}
                            onDuplicate={() => void duplicate(r)}
                            onStatus={(s) => void setStatus([r], s)}
                            onDelete={() => setPendingDelete([r])}
                        />
                    )}
                    emptyState={emptyState(empty, {
                        query,
                        go,
                        canWrite,
                        storeId: (store ?? first).id,
                    })}
                />
            </div>
            {more && rows.length > 0 ? (
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                    <span className="text-xs text-muted-foreground">
                        Showing {rows.length} of {data.total}
                    </span>
                    <Button
                        variant="outline"
                        onClick={() => void loadMore()}
                        disabled={loadingMore}
                    >
                        {loadingMore ? "Loading…" : "Show more"}
                    </Button>
                </div>
            ) : null}

            <QuickLook
                row={open}
                index={openIndex}
                total={data.total}
                storeId={query.storefront}
                canWrite={canWrite}
                canStock={canStock}
                onStep={onStep}
                onClose={() => setOpenId(null)}
                onStatus={(r, s) => void setStatus([r], s)}
                onChanged={() => void reload()}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                onOpenChange={(o) => {
                    if (!o) setPendingDelete(null);
                }}
                title={
                    pendingDelete?.length === 1
                        ? `Delete “${pendingDelete[0]?.name ?? "this product"}”?`
                        : `Delete ${pendingDelete?.length ?? 0} products?`
                }
                description={`${pendingDelete?.length === 1 ? "It is" : "They are"} removed from ${many ? "every storefront that sells it" : first.name} and from any collection it belongs to. Past orders keep their record. This cannot be undone.`}
                confirmLabel={
                    pendingDelete?.length === 1
                        ? "Delete product"
                        : `Delete ${pendingDelete?.length ?? 0} products`
                }
                onConfirm={() => void confirmDelete()}
            />
        </div>
    );
}
