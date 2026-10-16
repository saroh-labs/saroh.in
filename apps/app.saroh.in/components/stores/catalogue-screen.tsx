"use client";

import { count, plural } from "@/lib/format/plural";
import { pagesOf } from "@saroh/ui/lib/paging";
import { rememberPageSize } from "@saroh/ui/page-sizes";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState, useTransition } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { NeedsYou } from "@/components/commerce/needs-you";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataView } from "@/components/shared/data-view/data-view";
import type { PlanMeter } from "@/lib/billing/meter";
import type { PausedCut } from "@/lib/billing/paused";
import type { PlanRefusal } from "@/lib/billing/refusal";
import type { ProductRating } from "@/lib/product-reviews/service";
import { deleteProduct, setProductStatus } from "@/lib/products/actions";
import type { CatalogueRow } from "@/lib/products/catalogue";
import { catalogueRows } from "@/lib/products/catalogue";
import type { FilterChoices } from "@/lib/products/filter-choices";
import { productEditHref } from "@/lib/products/links";
import {
    duplicateListedProduct,
    loadCataloguePage,
} from "@/lib/products/list-actions";
import type { ListQuery } from "@/lib/products/list-query";
import {
    catalogueFilter,
    emptyCopy,
    listHref,
    pageHref,
} from "@/lib/products/list-query";
import type { NeedDetail } from "@/lib/products/needs-you";
import { needOf } from "@/lib/products/needs-you";
import type { SellsOnline } from "@/lib/products/quick-look";
import { statusToast, step } from "@/lib/products/quick-look";
import type { CataloguePage, ProductStatus } from "@/lib/products/service";

import { catalogueColumns, RowMenu } from "./catalogue/catalogue-columns";
import { emptyState, NoStorefront } from "./catalogue/catalogue-empty";
import { CatalogueHeader } from "./catalogue/catalogue-header";
import {
    CatalogueFilters,
    CatalogueMoreFilters,
    catalogueNarrowed,
    CatalogueSearch,
} from "./catalogue/catalogue-toolbar";
import { QuickLook } from "./catalogue/quick-look";

/**
 * Sell → Products, after the "Saroh Products Screen" design (#519, #520).
 *
 * The catalogue belongs to the business (#531): one row per product,
 * naming each storefront that sells it. A storefront is a filter on that
 * one catalogue, not a scope. Everything that narrows the list lives in the
 * address and is answered by the API a page at a time — search, the chips,
 * Filter and "Needs you" cover the whole catalogue, not the rows on screen.
 * So is the page: the list ends with the shared footer (rows per page,
 * kept between visits, and the page numbers), each page read by the server.
 *
 * The row is the action: anywhere on it opens the quick look, and the
 * product's own page is one step further. Selection gives the bulk bar
 * (Publish · Archive · Delete, each only where it would change something);
 * the row menu holds Preview · Edit · Duplicate · Archive · Delete, with
 * Delete below a divider and confirmed — the quick look's menu the same.
 * Publishing and archiving act at once and offer Undo.
 *
 * Restock in Needs you opens the quick look on that product with its Add
 * box ready, even when it isn't on the page on screen: the task finishes
 * here. A search or filter on a dropped connection keeps the list and says
 * so, rather than losing the page to the browser's offline screen.
 */
const OFFLINE = "Couldn't search. Check your connection and try again.";
const OFFLINE_HOW = "Check your connection and try again.";

/** How many of `rows` match, for a bulk label: "Archive 2". */
function countOf(
    rows: readonly CatalogueRow[],
    match: (r: CatalogueRow) => boolean,
): number {
    return rows.filter(match).length;
}

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
    meter = null,
    limitBannerShown = false,
    pausedCut = null,
    sellsOnline = null,
}: {
    query: ListQuery;
    /** The page the address asks for, read on the server. */
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
    /** The plan's product limit, shown before New product (UX-036). */
    meter?: PlanMeter | null;
    /** The page's limit banner says the limit: the header doesn't (#874). */
    limitBannerShown?: boolean;
    /** Past the plan's products limit (#800): rows before it are marked. */
    pausedCut?: PausedCut;
    /**
     * The online shop is live (null: the website couldn't be read): the
     * quick look's Archive and Publish lines claim the website only then.
     */
    sellsOnline?: SellsOnline;
}) {
    const router = useRouter();
    const [navigating, startNavigation] = useTransition();
    const [data, setData] = useState(page);
    const [openId, setOpenId] = useState<string | null>(null);
    /** Restock opened it: the Add box gets the keyboard. */
    const [focusAdd, setFocusAdd] = useState(false);
    /**
     * A product Restock opened that isn't on the page on screen, read on
     * its own so the quick look can show it.
     */
    const [extra, setExtra] = useState<CatalogueRow | null>(null);
    const [pendingDelete, setPendingDelete] = useState<CatalogueRow[] | null>(
        null,
    );

    // A new page from the server (a new address, or a refresh) replaces
    // the one on screen.
    // (Adjusted while rendering, as React recommends, not in an effect.)
    const [seen, setSeen] = useState(page);
    if (seen !== page) {
        setSeen(page);
        setData(page);
    }

    const rows = useMemo(
        () => catalogueRows(data.items, pausedCut),
        [data.items, pausedCut],
    );
    const ratingById = useMemo(
        () => new Map(ratings.map((r) => [r.productId, r])),
        [ratings],
    );
    const store = stores.find((s) => s.id === query.storefront) ?? null;
    const many = stores.length > 1;
    const first = stores.at(0);
    const filter = catalogueFilter(query);

    const needs = data.needs as NeedDetail[];
    const needById = useMemo(
        () => new Map(needs.map((n) => [n.productId, n])),
        [needs],
    );

    const go = useCallback(
        (patch: Partial<ListQuery>) => {
            // Offline, a server navigation falls back to a full page load
            // and the browser's offline screen: keep the list, and say so.
            if (typeof navigator !== "undefined" && !navigator.onLine) {
                showError(OFFLINE);
                return;
            }
            startNavigation(() => {
                try {
                    router.replace(listHref(query, patch), { scroll: false });
                } catch {
                    showError(OFFLINE);
                }
            });
        },
        [query, router],
    );

    /** Read the page on screen again, and the counts with it. */
    async function reload() {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
            showError(OFFLINE);
            return;
        }
        let res: Awaited<ReturnType<typeof loadCataloguePage>>;
        try {
            res = await loadCataloguePage(filter);
        } catch {
            // The action's request itself failed: the connection.
            showError("The list couldn't be refreshed.", OFFLINE_HOW);
            return;
        }
        if (!res.ok) {
            showError("The list couldn't be refreshed.", res.error);
            return;
        }
        // The page's last rows have gone (deleted, or out of this view):
        // the last page that still holds some.
        if (res.data.items.length === 0 && query.page > 1) {
            go({
                page: Math.min(
                    query.page - 1,
                    pagesOf(res.data.total, query.size),
                ),
            });
            return;
        }
        setData(res.data);
        // A product Restock opened from beyond this page: its row again.
        if (extra) {
            const fresh = await findRow(extra.id, extra.name);
            if (fresh) setExtra(fresh);
        }
    }

    /**
     * One product's row, when it isn't on the page on screen: the list
     * searched by its name (the catalogue read has no "by id"), then
     * picked by its id.
     */
    async function findRow(
        id: string,
        name: string,
    ): Promise<CatalogueRow | null> {
        try {
            const res = await loadCataloguePage({
                q: name,
                storefront: query.storefront ?? undefined,
                size: 100,
            });
            if (!res.ok) return null;
            return (
                catalogueRows(res.data.items, pausedCut).find(
                    (r) => r.id === id,
                ) ?? null
            );
        } catch {
            return null;
        }
    }

    /** Restock or View: the quick look on it, here, never another page. */
    async function openNeed(productId: string) {
        setFocusAdd(canStock);
        if (rows.some((r) => r.id === productId)) {
            setExtra(null);
            setOpenId(productId);
            return;
        }
        const need = needOf(needs, productId);
        const row = need ? await findRow(productId, need.name) : null;
        if (!row) {
            showError("That product couldn't be opened.", OFFLINE_HOW);
            return;
        }
        setExtra(row);
        setOpenId(productId);
    }

    /** A row clicked or walked to: read it, no Add box focused. */
    function openRow(id: string) {
        setFocusAdd(false);
        setExtra(null);
        setOpenId(id);
    }

    function closeLook() {
        setOpenId(null);
        setExtra(null);
        setFocusAdd(false);
    }

    async function setStatus(
        targets: CatalogueRow[],
        status: ProductStatus,
        clear?: () => void,
    ) {
        const results = await Promise.all(
            targets.map((r) => setProductStatus(r.id, status)),
        );
        // Undo puts back only what changed.
        const before: { id: string; was: ProductStatus }[] = [];
        let why: string | undefined;
        let plan: PlanRefusal | undefined;
        targets.forEach((r, i) => {
            const res = results[i];
            if (res.ok) before.push({ id: r.id, was: r.status });
            else {
                why ??= res.error;
                plan ??= res.plan;
            }
        });
        const failed = targets.length - before.length;
        // Un-archiving past the plan's products limit (U13): its notice.
        if (plan) showPlanRefusal(plan);
        if (before.length === 0) {
            if (plan) return;
            // Nothing changed: say why, and offer no Undo for it.
            showError(
                targets.length === 1
                    ? "It couldn't be changed."
                    : `None of the ${targets.length} could be changed.`,
                why,
            );
            return;
        }
        if (failed > 0) {
            showError(
                `${failed} of ${targets.length} could not be changed.`,
                "The rest were saved. Try the others again.",
            );
        }
        clear?.();
        await reload();
        const changed = targets.filter((r) =>
            before.some((b) => b.id === r.id),
        );
        const said = statusToast(
            status === "ARCHIVED" ? "ARCHIVED" : "PUBLISHED",
            changed.map((r) => r.name),
        );
        showUndo(said, async () => {
            const back = await Promise.all(
                before.map((r) => setProductStatus(r.id, r.was)),
            );
            await reload();
            return back.every((r) => r.ok);
        });
    }

    /** From its confirm, which waits for it. */
    async function confirmDelete() {
        const targets = pendingDelete ?? [];
        const results = await Promise.all(
            targets.map((r) => deleteProduct(r.id)),
        );
        const failed = results.filter((r) => !r.ok).length;
        const gone = targets.length - failed;
        if (failed > 0) {
            showError(`${failed} of ${targets.length} could not be deleted.`);
        }
        if (gone > 0) {
            showSuccess(
                gone === 1 ? "Product deleted." : `${gone} products deleted.`,
            );
        }
        closeLook();
        await reload();
    }

    async function duplicate(row: CatalogueRow) {
        const res = await duplicateListedProduct(row.id, query.storefront);
        if (!res.ok) {
            if (res.plan) showPlanRefusal(res.plan);
            else showError("It couldn't be duplicated.", res.error);
            return;
        }
        showSuccess(`${res.data.name} is a draft. Stock starts at 0.`);
        router.push(productEditHref(res.data.storeId, res.data.id));
    }

    const openIndex = rows.findIndex((r) => r.id === openId);
    const open =
        openIndex >= 0
            ? (rows[openIndex] ?? null)
            : extra?.id === openId
              ? extra
              : null;
    // J/K and the arrows move within the page on screen and stay put at
    // its first and last rows: another page is the footer's to open. A
    // product from beyond the page (Restock) has no neighbours here.
    const onStep = useCallback(
        (by: 1 | -1) => {
            if (openIndex < 0) return;
            const next = step(openIndex, by, rows.length);
            if (next !== openIndex) {
                setFocusAdd(false);
                setOpenId(rows[next]?.id ?? null);
            }
        },
        [openIndex, rows],
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
        count(data.total, "product") +
        (store
            ? ` sold at ${store.name}`
            : many
              ? ` across ${stores.length} locations`
              : "");

    return (
        <div className="space-y-3">
            <CatalogueHeader
                stores={stores}
                storeId={query.storefront}
                canWrite={canWrite}
                meter={meter}
                bannerShown={limitBannerShown}
                count={data.total > 0 ? countLabel : undefined}
            />
            <NeedsYou
                needs={needs}
                canStock={canStock}
                onOpen={(id) => void openNeed(id)}
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
                        needById,
                    })}
                    rowKey={(r) => r.key}
                    modes={["table", "list"]}
                    hideModeToggle
                    noun={{ one: "product", other: "products" }}
                    showTotal={false}
                    toolbarSearch={
                        <CatalogueSearch
                            query={query}
                            go={go}
                            searching={navigating}
                        />
                    }
                    toolbarExtra={
                        <CatalogueFilters
                            query={query}
                            go={go}
                            storefronts={data.storefronts}
                            choices={choices}
                        />
                    }
                    toolbarMore={
                        <CatalogueMoreFilters
                            query={query}
                            go={go}
                            choices={choices}
                        />
                    }
                    // Only a search narrows: the way back says so.
                    clearLabel={
                        query.q &&
                        !query.status &&
                        !query.category &&
                        !query.collection &&
                        !query.storefront
                            ? "Clear search"
                            : undefined
                    }
                    onClearFilters={
                        catalogueNarrowed(query)
                            ? () =>
                                  go({
                                      q: "",
                                      status: null,
                                      category: null,
                                      collection: null,
                                      storefront: null,
                                  })
                            : undefined
                    }
                    onRowClick={(r) => openRow(r.id)}
                    selectable={canWrite}
                    rowLabel={(r) => r.name}
                    // Each offered only where it would change something,
                    // with how many it acts on; Delete last, at less weight.
                    bulkActions={[
                        {
                            id: "publish",
                            label: (sel) =>
                                `Publish ${countOf(sel, (r) => r.status !== "PUBLISHED")}`,
                            hidden: (sel) =>
                                sel.every((r) => r.status === "PUBLISHED"),
                            run: (targets, clear) =>
                                void setStatus(
                                    targets.filter(
                                        (r) => r.status !== "PUBLISHED",
                                    ),
                                    "PUBLISHED",
                                    clear,
                                ),
                        },
                        {
                            id: "archive",
                            label: (sel) =>
                                `Archive ${countOf(sel, (r) => r.status === "PUBLISHED")}`,
                            hidden: (sel) =>
                                !sel.some((r) => r.status === "PUBLISHED"),
                            run: (targets, clear) =>
                                void setStatus(
                                    targets.filter(
                                        (r) => r.status === "PUBLISHED",
                                    ),
                                    "ARCHIVED",
                                    clear,
                                ),
                        },
                        {
                            id: "delete",
                            label: (sel) => `Delete ${sel.length}`,
                            tone: "destructive-outline",
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
                            onPreview={() => openRow(r.id)}
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
                    // The server cuts the pages: the view draws the page it
                    // is given and its footer from the catalogue's numbers.
                    paging={{
                        page: query.page,
                        total: data.total,
                        size: query.size,
                        to: (n) => ({ href: pageHref(query, n) }),
                        onSize: (size) => {
                            rememberPageSize("catalogue", size);
                            go({ size });
                        },
                    }}
                />
            </div>

            <QuickLook
                row={open}
                // Where it sits in the whole list, not only on this page.
                index={
                    openIndex < 0
                        ? openIndex
                        : (query.page - 1) * query.size + openIndex
                }
                total={data.total}
                storeId={query.storefront}
                canWrite={canWrite}
                canStock={canStock}
                need={open ? (needById.get(open.id) ?? null) : null}
                focusAdd={focusAdd}
                atFirst={openIndex <= 0}
                atLast={openIndex < 0 || openIndex >= rows.length - 1}
                sellsOnline={sellsOnline}
                onStep={onStep}
                onClose={closeLook}
                onStatus={(r, s) => void setStatus([r], s)}
                onDuplicate={(r) => void duplicate(r)}
                onDelete={(r) => setPendingDelete([r])}
                onChanged={() => void reload()}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                onOpenChange={(o) => {
                    if (!o) setPendingDelete(null);
                }}
                title={
                    pendingDelete?.length === 1
                        ? `Delete ${pendingDelete[0]?.name ?? "this product"}?`
                        : `Delete ${pendingDelete?.length ?? 0} products?`
                }
                description={`${plural(pendingDelete?.length ?? 0, "It is", "They are")} removed from ${many ? "every location that sells it" : first.name} and from any collection it belongs to. Past orders keep their record. This cannot be undone.`}
                confirmLabel={
                    pendingDelete?.length === 1
                        ? "Delete product"
                        : `Delete ${pendingDelete?.length ?? 0} products`
                }
                keepLabel={
                    pendingDelete?.length === 1
                        ? "Keep product"
                        : "Keep products"
                }
                onConfirm={confirmDelete}
            />
        </div>
    );
}
