"use client";

import {
    FigureLoading,
    PageLoading,
} from "@/components/shared/page/page-loading";
import { PendingRegion } from "@/components/shared/page/screen-pending";
import { count, plural } from "@/lib/format/plural";
import { rememberPageSize } from "@saroh/ui/page-sizes";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { useQuickEdits } from "@/components/commerce/quick-edits/quick-edits";
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
import { duplicateListedProduct } from "@/lib/products/list-actions";
import type { ListQuery } from "@/lib/products/list-query";
import { emptyCopy, listHref, pageHref } from "@/lib/products/list-query";
import type { NeedDetail } from "@/lib/products/needs-you";
import { needOf } from "@/lib/products/needs-you";
import type { CatalogueAsk } from "@/lib/products/queries";
import type { SellsOnline } from "@/lib/products/quick-look";
import { statusToast, step } from "@/lib/products/quick-look";
import type { CataloguePage, ProductStatus } from "@/lib/products/service";
import { useOrgId } from "@/lib/query/org";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { NeedsYou } from "./needs-you";

import { catalogueColumns, RowMenu } from "./catalogue-columns";
import { emptyState, NoStorefront } from "./catalogue-empty";
import { CatalogueHeader } from "./catalogue-header";
import {
    CatalogueFilters,
    CatalogueMoreFilters,
    catalogueNarrowed,
    CatalogueSearch,
    CatalogueSortSelect,
} from "./catalogue-toolbar";
import { QuickLook } from "./quick-look";

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
 *
 * Before the first page is read (`page` null) the whole frame is drawn and
 * works, a search or filter keying the read; the rows are the list
 * loader's skeleton and the count a bar until it lands (owner, 25 Nov).
 */
const OFFLINE = "Couldn't search. Check your connection and try again.";
const OFFLINE_HOW = "Check your connection and try again.";

/**
 * How the screen opens an address of the list and reads it again
 * (`CatalogueContainer`, DEC-259): in place, from the list's queries.
 */
export interface ListAdapter {
    navigate: (href: string) => void;
    /** The list's pages read again (the one on screen now). */
    reload: () => Promise<void>;
    /** A page of the list asked for itself (a product off this page). */
    find: (ask: CatalogueAsk) => Promise<CataloguePage>;
    /** The list is on its way and the old rows are held. */
    fetching: boolean;
}

const NO_NEEDS: CataloguePage["needs"] = [];

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
    canOrders = false,
    collectionsPanel,
    collectionCount = null,
    meter = null,
    limitBannerShown = false,
    pausedCut = null,
    sellsOnline = null,
    adapter,
}: {
    query: ListQuery;
    /** The page the address asks for; null until the first is read. */
    page: CataloguePage | null;
    adapter: ListAdapter;
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
    /** `order:read`: the quick look links a short product's open orders. */
    canOrders?: boolean;
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
    const orgId = useOrgId();
    const quick = useQuickEdits();
    const navigating = adapter.fetching;
    const data = page;
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

    const rows = useMemo(
        () => catalogueRows(data?.items ?? [], pausedCut),
        [data?.items, pausedCut],
    );
    const ratingById = useMemo(
        () => new Map(ratings.map((r) => [r.productId, r])),
        [ratings],
    );
    const store = stores.find((s) => s.id === query.storefront) ?? null;
    const many = stores.length > 1;
    const first = stores.at(0);

    const needs = (data?.needs ?? NO_NEEDS) as NeedDetail[];
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
            adapter.navigate(listHref(query, patch));
        },
        [query, adapter],
    );

    /**
     * The tabs are links: sent through the list's own navigation (in place,
     * the old rows greyed) rather than a server render.
     */
    function openTab(e: React.MouseEvent<HTMLElement>) {
        const a = (e.target as Element).closest("a[href]");
        if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
            return;
        }
        const href = a.getAttribute("href") ?? "";
        if (!href.startsWith("/commerce/products")) return;
        e.preventDefault();
        e.stopPropagation();
        adapter.navigate(href);
    }

    /**
     * Read the page on screen again, and the counts with it; a page past
     * the end moves back in the container.
     */
    async function reload() {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
            showError(OFFLINE);
            return;
        }
        try {
            await adapter.reload();
        } catch {
            showError("The list couldn't be refreshed.", OFFLINE_HOW);
            return;
        }
        await refreshExtra();
    }

    /** A product Restock opened from beyond this page: its row again. */
    async function refreshExtra() {
        if (!extra) return;
        const fresh = await findRow(extra.id, extra.name);
        if (fresh) setExtra(fresh);
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
            const found = await adapter.find({
                q: name,
                storefront: query.storefront ?? undefined,
                size: 100,
            });
            return (
                catalogueRows(found.items, pausedCut).find(
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
        // At once in every list page and the products' own pages; the
        // snapshot comes back when any is refused (DEC-259, owner 23 Nov).
        const results = await quick.run(
            targets.map((r) => r.id),
            { status },
            (org) =>
                Promise.all(
                    targets.map((r) => setProductStatus(r.id, status, org)),
                ),
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
        const changed = targets.filter((r) =>
            before.some((b) => b.id === r.id),
        );
        const said = statusToast(
            status === "ARCHIVED" ? "ARCHIVED" : "PUBLISHED",
            changed.map((r) => r.name),
        );
        showUndo(said, async () => {
            const back = await Promise.all(
                before.map((r) =>
                    quick.run([r.id], { status: r.was }, async (org) => [
                        await setProductStatus(r.id, r.was, org),
                    ]),
                ),
            );
            return back.every((r) => r.every((x) => x.ok));
        });
    }

    /** From its confirm, which waits for it. */
    async function confirmDelete() {
        const targets = pendingDelete ?? [];
        const results = await Promise.all(
            targets.map((r) => deleteProduct(r.id, orgId)),
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
        const res = await duplicateListedProduct(
            row.id,
            query.storefront,
            orgId,
        );
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
    const total = data?.total ?? 0;
    const countLabel =
        count(total, "product") +
        (store
            ? ` sold at ${store.name}`
            : many
              ? ` · ${stores.length} locations`
              : "");

    return (
        <div className="space-y-3">
            <CatalogueHeader
                stores={stores}
                storeId={query.storefront}
                canWrite={canWrite}
                meter={meter}
                bannerShown={limitBannerShown}
                count={
                    !data ? (
                        <FigureLoading />
                    ) : total > 0 ? (
                        countLabel
                    ) : undefined
                }
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
            <div onClickCapture={openTab}>
                <>{tabs}</>
            </div>
            <>{notice}</>
            <>{collectionsPanel}</>
            <PendingRegion
                pending={navigating}
                rows
                // A phone: search and Filters share one row (HPProductsPhone).
                className="pt-0.5 max-sm:[&_[data-slot=list-search]]:w-auto max-sm:[&_[data-slot=list-search]]:flex-1"
            >
                <DataView
                    viewId="catalogue"
                    rows={rows}
                    columns={catalogueColumns({
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
                    // On a phone the dropdowns and the sort fold into
                    // Filters, so search and Filters are one 44px row and
                    // the first product sits higher (HPProductsPhone).
                    toolbarExtra={
                        <span className="hidden sm:contents">
                            <CatalogueFilters
                                query={query}
                                go={go}
                                storefronts={data?.storefronts ?? null}
                                stores={stores}
                                choices={choices}
                            />
                        </span>
                    }
                    toolbarEnd={
                        <span className="hidden sm:contents">
                            <CatalogueSortSelect query={query} go={go} />
                        </span>
                    }
                    toolbarMore={
                        <CatalogueMoreFilters
                            query={query}
                            go={go}
                            choices={choices}
                            phone={
                                <span className="grid gap-3 sm:hidden">
                                    <CatalogueFilters
                                        query={query}
                                        go={go}
                                        storefronts={data?.storefronts ?? null}
                                        stores={stores}
                                        choices={choices}
                                    />
                                    <CatalogueSortSelect
                                        query={query}
                                        go={go}
                                    />
                                </span>
                            }
                        />
                    }
                    // Only a search narrows: the way back says so.
                    clearLabel={
                        query.q &&
                        !query.status &&
                        !query.category &&
                        !query.option &&
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
                                      option: null,
                                      collection: null,
                                      storefront: null,
                                  })
                            : undefined
                    }
                    isLoading={!data}
                    loading={
                        <PageLoading
                            bare
                            width="full"
                            shape="rows"
                            label="Loading products"
                        />
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
                        total,
                        size: query.size,
                        to: (n) => ({ href: pageHref(query, n) }),
                        onSize: (size) => {
                            rememberPageSize("catalogue", size);
                            go({ size });
                        },
                    }}
                />
            </PendingRegion>

            <QuickLook
                row={open}
                // Where it sits in the whole list, not only on this page.
                index={
                    openIndex < 0
                        ? openIndex
                        : (query.page - 1) * query.size + openIndex
                }
                total={total}
                storeId={query.storefront}
                canWrite={canWrite}
                canStock={canStock}
                canOrders={canOrders}
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
                // The list was read again by the quick edit itself; a
                // product from beyond the page is read again here.
                onChanged={() => void refreshExtra()}
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
