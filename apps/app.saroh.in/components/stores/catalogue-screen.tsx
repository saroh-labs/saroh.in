"use client";

import type { BadgeProps } from "@saroh/ui/badge";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { showError, showUndo } from "@saroh/ui/toast";
import {
    Archive,
    ArrowRight,
    Check,
    ChevronDown,
    ExternalLink,
    Info,
    ListFilter,
    MoreHorizontal,
    Package,
    Plus,
    Store,
    Trash2,
    Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { StorefrontFilter } from "@/components/stores/storefront-filter";
import { StorefrontPartial } from "@/components/stores/storefront-partial";
import { formatMoneyMajor } from "@/lib/format/money";
import { ratingLabel, rowRating } from "@/lib/product-reviews/describe";
import type { ProductRating } from "@/lib/product-reviews/service";
import { deleteProduct, updateProduct } from "@/lib/products/actions";
import type { CatalogueRow } from "@/lib/products/catalogue";
import { inStorefront, mergeCatalogue } from "@/lib/products/catalogue";
import type { ProductListItem, ProductStatus } from "@/lib/products/service";

const STATUS_LABEL: Record<ProductStatus, string> = {
    PUBLISHED: "Published",
    DRAFT: "Draft",
    ARCHIVED: "Archived",
};

/** Published is success; a draft and an archived product ask nothing yet. */
const STATUS_VARIANT: Record<
    ProductStatus,
    NonNullable<BadgeProps["variant"]>
> = {
    PUBLISHED: "success",
    DRAFT: "neutral",
    ARCHIVED: "neutral",
};

/**
 * Tabs filter the catalogue (brand file §13): the same products, cut three
 * ways. Collections are the products placed in one; Inventory is the products
 * whose stock is tracked. Status is not a tab — it is on every row, and the
 * Filter button narrows by it.
 */
const FILTERS: DataFilter<CatalogueRow>[] = [
    { id: "all", label: "All" },
    {
        id: "collections",
        label: "Collections",
        predicate: (r) => r.inCollection,
    },
    {
        id: "inventory",
        label: "Inventory",
        predicate: (r) => r.stock !== null,
    },
];

/** Two letters from the product's words: "Rye & caraway loaf" → "RC". */
function initials(name: string): string {
    return name
        .split(/[\s&]+/)
        .filter((w) => /^[A-Za-zÀ-ÿ]/.test(w))
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join("");
}

/**
 * Stock as words, coloured only to reinforce them: out is Destructive 700,
 * at or under the product's own threshold is Saffron 700, and anything else
 * is plain. Untracked is said, never shown as zero.
 */
function stockOf(row: CatalogueRow): { text: string; tone: string } {
    if (row.stock === null) {
        return { text: "Not tracked", tone: "text-muted-foreground" };
    }
    if (row.stock <= 0) {
        return {
            text: "Out of stock",
            tone: "text-destructive-subtle-foreground",
        };
    }
    const text = `${row.stock} in stock`;
    return row.lowStockAlert !== null && row.stock <= row.lowStockAlert
        ? { text, tone: "text-brand-subtle-foreground" }
        : { text, tone: "text-neutral-700 dark:text-foreground" };
}

function Thumb({ name, size = 30 }: { name: string; size?: 30 | 52 }) {
    return (
        <span
            aria-hidden
            className={cn(
                "flex shrink-0 items-center justify-center bg-muted font-display font-semibold text-neutral-700 dark:text-foreground",
                size === 30
                    ? "size-[30px] rounded-[7px] text-[11px]"
                    : "size-[52px] rounded-[10px] text-[15px]",
            )}
        >
            {initials(name)}
        </span>
    );
}

/** The storefront a row opens in: the first place that sells it. */
function homeOf(row: CatalogueRow) {
    return row.places[0];
}

/**
 * Sell → Products, after the "Saroh Products Screen" design.
 *
 * The catalogue belongs to the business. Products are still stored per
 * storefront, so this reads every storefront's list and merges them by SKU
 * (`mergeCatalogue`): a product sold in two places is one row that names both,
 * and says "varies" where their prices differ. A storefront is a filter on
 * that one catalogue, not a scope with its own — so "All storefronts" is a
 * real answer, and it is where the page lands.
 *
 * The row is the action: anywhere on it opens a read-only preview, and the
 * product's own page is one step further. Selection gives the bulk bar; the
 * overflow menu holds the rest, with Delete below a divider and confirmed,
 * because deleting is the one thing here that cannot be undone. Publishing
 * and archiving act at once and offer Undo.
 */
export function CatalogueScreen({
    stores,
    productsByStore,
    initialView,
    missing = [],
    tabs,
    ratings = [],
}: {
    stores: { id: string; name: string }[];
    productsByStore: Record<string, ProductListItem[]>;
    initialView?: string;
    /** Products | Reviews, under the header. */
    tabs?: ReactNode;
    /** Published review averages per product id. */
    ratings?: ProductRating[];
    /** Storefronts whose list could not be read; see `StorefrontPartial`. */
    missing?: { id: string; name: string }[];
}) {
    const router = useRouter();
    const [storeId, setStoreId] = useState<string | null>(null);
    const [preview, setPreview] = useState<CatalogueRow | null>(null);
    const [pendingDelete, setPendingDelete] = useState<CatalogueRow[] | null>(
        null,
    );
    const [statusFilter, setStatusFilter] = useState<ProductStatus | null>(
        null,
    );

    const catalogue = useMemo(
        () => mergeCatalogue(stores, productsByStore),
        [stores, productsByStore],
    );
    const rows = useMemo(() => {
        const scoped = storeId
            ? catalogue.flatMap((r) => {
                  const here = inStorefront(r, storeId);
                  return here ? [here] : [];
              })
            : catalogue;
        return statusFilter
            ? scoped.filter((r) => r.status === statusFilter)
            : scoped;
    }, [catalogue, storeId, statusFilter]);
    const store = stores.find((s) => s.id === storeId) ?? null;
    const many = stores.length > 1;
    const ratingById = useMemo(
        () => new Map(ratings.map((r) => [r.productId, r])),
        [ratings],
    );
    const first = stores.at(0);

    /** Every place a set of rows lives, in the storefront being viewed. */
    const placesOf = (targets: CatalogueRow[]) =>
        targets.flatMap((r) =>
            r.places.filter((p) => !storeId || p.storeId === storeId),
        );

    async function setStatus(
        targets: CatalogueRow[],
        status: ProductStatus,
        clear?: () => void,
    ) {
        const places = placesOf(targets);
        const before = places.map((p) => ({ ...p, was: p.product.status }));
        const results = await Promise.all(
            places.map((p) =>
                updateProduct(p.storeId, p.product.id, {
                    name: p.product.name,
                    price: p.product.price,
                    status,
                }),
            ),
        );
        const failed = results.filter((r) => !r.ok).length;
        if (failed > 0) {
            showError(
                `${failed} of ${places.length} could not be changed.`,
                "The rest were saved. Try the others again.",
            );
        }
        clear?.();
        router.refresh();
        const verb = status === "PUBLISHED" ? "published" : "archived";
        const said =
            targets.length === 1
                ? `${targets[0]?.name ?? "Product"} is ${verb}.`
                : `${targets.length} products ${verb}.`;
        showUndo(said, () => {
            void Promise.all(
                before.map((p) =>
                    updateProduct(p.storeId, p.product.id, {
                        name: p.product.name,
                        price: p.product.price,
                        status: p.was,
                    }),
                ),
            ).then(() => router.refresh());
        });
    }

    async function confirmDelete() {
        const targets = pendingDelete ?? [];
        setPendingDelete(null);
        const places = placesOf(targets);
        const results = await Promise.all(
            places.map((p) => deleteProduct(p.storeId, p.product.id)),
        );
        const failed = results.filter((r) => !r.ok).length;
        if (failed > 0) {
            showError(`${failed} of ${places.length} could not be deleted.`);
        }
        setPreview(null);
        router.refresh();
    }

    const columns: DataColumn<CatalogueRow>[] = [
        {
            id: "product",
            header: "Product",
            priority: "primary",
            sortValue: (r) => r.name,
            cell: (r) => (
                <span className="flex min-w-0 items-center gap-[11px]">
                    <Thumb name={r.name} />
                    <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">
                            {r.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {r.variantCount === 1
                                ? "1 variant"
                                : `${r.variantCount} variants`}
                            {r.sku ? (
                                <>
                                    {" · "}
                                    <span className="font-mono">{r.sku}</span>
                                </>
                            ) : null}
                            {/* An aggregate view must say which places a row
                                belongs to. */}
                            {!storeId && many
                                ? ` · ${r.places.map((p) => p.storeName).join(" · ")}`
                                : null}
                            {(() => {
                                const rating = rowRating(
                                    r.places.map((p) => p.product.id),
                                    ratingById,
                                );
                                return rating ? (
                                    <>
                                        {" · "}
                                        <span
                                            aria-label={`Rated ${rating.average} from ${rating.count} ${rating.count === 1 ? "review" : "reviews"}`}
                                        >
                                            ★ {ratingLabel(rating)}
                                        </span>
                                    </>
                                ) : null;
                            })()}
                        </span>
                    </span>
                </span>
            ),
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            width: "118px",
            sortValue: (r) => r.status,
            cell: (r) => (
                <Badge
                    variant={STATUS_VARIANT[r.status]}
                    className="px-[9px] py-[3px] text-[11px]"
                >
                    {STATUS_LABEL[r.status]}
                </Badge>
            ),
        },
        {
            id: "inventory",
            header: "Inventory",
            priority: "secondary",
            width: "128px",
            sortValue: (r) => r.stock ?? -1,
            cell: (r) => {
                const s = stockOf(r);
                return (
                    <span className={cn("text-[12.5px]", s.tone)}>
                        {s.text}
                    </span>
                );
            },
        },
        {
            id: "price",
            header: "Price",
            priority: "secondary",
            width: "104px",
            numeric: true,
            money: true,
            sortValue: (r) => Number(r.price),
            cell: (r) => (
                <span className="inline-flex flex-col items-end gap-0.5">
                    <span className="tracking-[-0.02em]">
                        {formatMoneyMajor(r.price, r.currency) ?? "—"}
                    </span>
                    {r.varies && !storeId ? (
                        <span className="rounded-full bg-brand-subtle px-1.5 py-px font-sans text-[11px] font-semibold text-brand-subtle-foreground">
                            varies
                        </span>
                    ) : null}
                </span>
            ),
        },
    ];

    const newProductHref = (id: string) => `/stores/${id}/products/new`;

    return (
        <div className="space-y-5">
            <PageHeader
                breadcrumb={["Sell", "Products"]}
                title="Products"
                className="mb-0"
                actions={
                    first ? (
                        <>
                            <Button variant="outline" asChild>
                                <Link
                                    href={`/stores/${(store ?? first).id}/products/import`}
                                >
                                    <Upload className="mr-1.5 size-4" />
                                    Import
                                </Link>
                            </Button>
                            {many && !store ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button>
                                            <Plus className="mr-1.5 size-4" />
                                            New product
                                            <ChevronDown className="ml-1 size-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                            Add it to
                                        </DropdownMenuLabel>
                                        {stores.map((s) => (
                                            <DropdownMenuItem
                                                key={s.id}
                                                asChild
                                            >
                                                <Link
                                                    href={newProductHref(s.id)}
                                                >
                                                    <Store />
                                                    {s.name}
                                                </Link>
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <Button asChild>
                                    <Link
                                        href={newProductHref(
                                            (store ?? first).id,
                                        )}
                                    >
                                        <Plus className="mr-1.5 size-4" />
                                        New product
                                    </Link>
                                </Button>
                            )}
                        </>
                    ) : undefined
                }
            />

            {tabs}

            <StorefrontPartial
                missing={missing}
                missingWhat="products sold only there"
            />

            {stores.length === 0 ? (
                <div className="flex flex-col items-center gap-[9px] rounded-[11px] border border-dashed border-border-strong px-6 py-12 text-center">
                    <Store
                        aria-hidden
                        className="size-8 stroke-[1.7] text-muted-foreground"
                    />
                    <p className="font-display text-[19px] font-semibold tracking-[-0.025em]">
                        No storefront yet
                    </p>
                    <p className="max-w-[44ch] text-[13.5px] leading-[1.55] text-muted-foreground">
                        A product is sold somewhere. Make a storefront first,
                        and the catalogue starts here.
                    </p>
                    <Button asChild className="mt-1">
                        <Link href="/stores/new">Create a storefront</Link>
                    </Button>
                </div>
            ) : (
                <DataView
                    viewId="catalogue"
                    rows={rows}
                    columns={columns}
                    rowKey={(r) => r.key}
                    modes={["table", "list"]}
                    hideModeToggle
                    noun={{ one: "product", other: "products" }}
                    searchPlaceholder="Search products"
                    searchableColumnIds={["product"]}
                    filters={FILTERS}
                    initialFilterId={initialView}
                    onRowClick={setPreview}
                    selectable
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
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7 text-muted-foreground hover:text-foreground coarse:size-11"
                                    aria-label={`More actions for ${r.name}`}
                                >
                                    <MoreHorizontal className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                    onSelect={() => setPreview(r)}
                                >
                                    <ArrowRight />
                                    Open
                                </DropdownMenuItem>
                                {r.status === "PUBLISHED" ? (
                                    <DropdownMenuItem
                                        onSelect={() =>
                                            void setStatus([r], "ARCHIVED")
                                        }
                                    >
                                        <Archive />
                                        Archive
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem
                                        onSelect={() =>
                                            void setStatus([r], "PUBLISHED")
                                        }
                                    >
                                        <Check />
                                        Publish
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => setPendingDelete([r])}
                                >
                                    <Trash2 />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    toolbarExtra={
                        <>
                            {many ? (
                                <StorefrontFilter
                                    stores={stores}
                                    countFor={(id) =>
                                        catalogue.filter((r) =>
                                            r.places.some(
                                                (p) => p.storeId === id,
                                            ),
                                        ).length
                                    }
                                    total={catalogue.length}
                                    value={storeId}
                                    onChange={setStoreId}
                                    noun={{
                                        one: "product",
                                        other: "products",
                                    }}
                                    label="Show products sold at"
                                    note="A filter, not a scope. The catalogue belongs to the business; a storefront decides what it sells from it."
                                />
                            ) : null}
                            <StatusFilter
                                value={statusFilter}
                                onChange={setStatusFilter}
                            />
                        </>
                    }
                    countLabel={(visible) =>
                        `${visible} ${visible === 1 ? "product" : "products"}` +
                        (store
                            ? ` sold at ${store.name}`
                            : many
                              ? ` across ${stores.length} storefronts`
                              : "")
                    }
                    emptyState={{
                        icon: <Package />,
                        title: "No products yet",
                        note: `Add your first product and it appears in ${store?.name ?? first?.name ?? "your storefront"} straight away.`,
                        action: first ? (
                            <Button asChild>
                                <Link
                                    href={newProductHref((store ?? first).id)}
                                >
                                    Add product
                                </Link>
                            </Button>
                        ) : undefined,
                    }}
                />
            )}

            <ProductPreview
                row={preview}
                storeId={storeId}
                onClose={() => setPreview(null)}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                onOpenChange={(open) => {
                    if (!open) setPendingDelete(null);
                }}
                title={
                    pendingDelete?.length === 1
                        ? `Delete “${pendingDelete[0]?.name ?? "this product"}”?`
                        : `Delete ${pendingDelete?.length ?? 0} products?`
                }
                description={`${pendingDelete?.length === 1 ? "It is" : "They are"} removed from ${store ? store.name : many ? "every storefront that sells it" : (first?.name ?? "your storefront")}. Past orders keep their record. This cannot be undone.`}
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

/** The Filter button: narrow the catalogue by status. */
function StatusFilter({
    value,
    onChange,
}: {
    value: ProductStatus | null;
    onChange: (status: ProductStatus | null) => void;
}) {
    const choices: { id: ProductStatus | null; label: string }[] = [
        { id: null, label: "Any status" },
        { id: "PUBLISHED", label: "Published" },
        { id: "DRAFT", label: "Draft" },
        { id: "ARCHIVED", label: "Archived" },
    ];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "h-[38px] gap-[7px] px-[13px] text-[13px] font-medium text-neutral-600 dark:text-foreground",
                        value && "border-foreground",
                    )}
                    aria-label={`Filter: ${value ? STATUS_LABEL[value] : "any status"}. Change it.`}
                >
                    <ListFilter className="size-4" />
                    {value ? STATUS_LABEL[value] : "Filter"}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Status
                </DropdownMenuLabel>
                {choices.map((c) => (
                    <DropdownMenuItem
                        key={c.id ?? "any"}
                        onSelect={() => onChange(c.id)}
                    >
                        <span className="flex-1">{c.label}</span>
                        {c.id === value ? <Check aria-hidden /> : null}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/**
 * The preview drawer. Read-only: editing happens on the product page, which
 * has its own address — an order gets pasted into emails and support threads,
 * and so does a product.
 */
function ProductPreview({
    row,
    storeId,
    onClose,
}: {
    row: CatalogueRow | null;
    storeId: string | null;
    onClose: () => void;
}) {
    const home = row ? homeOf(row) : undefined;
    const place =
        row && storeId
            ? (row.places.find((p) => p.storeId === storeId) ?? home)
            : home;
    const href = place
        ? `/stores/${place.storeId}/products/${place.product.id}`
        : "#";
    const stock = row ? stockOf(row) : null;

    return (
        <Sheet
            open={!!row}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent
                side="right"
                className="flex w-[380px] max-w-[90vw] flex-col gap-0 p-0 sm:max-w-[380px]"
            >
                <div className="flex items-center gap-2.5 border-b border-muted px-[18px] py-4">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Preview
                    </span>
                </div>
                {row ? (
                    <>
                        <div className="flex-1 overflow-y-auto p-[18px]">
                            <div className="mb-[18px] flex items-center gap-[13px]">
                                <Thumb name={row.name} size={52} />
                                <div className="min-w-0">
                                    <SheetTitle className="font-display text-[19px] font-semibold tracking-[-0.025em]">
                                        {row.name}
                                    </SheetTitle>
                                    <SheetDescription className="mt-[3px] font-mono text-[11px]">
                                        {row.sku ? `SKU ${row.sku}` : "No SKU"}
                                    </SheetDescription>
                                </div>
                            </div>
                            <dl className="flex flex-col gap-[11px]">
                                <PreviewRow label="Status">
                                    <Badge variant={STATUS_VARIANT[row.status]}>
                                        {STATUS_LABEL[row.status]}
                                    </Badge>
                                </PreviewRow>
                                <PreviewRow label="Price">
                                    <span className="font-display text-[14px] font-semibold tabular-nums tracking-[-0.02em]">
                                        {formatMoneyMajor(
                                            row.price,
                                            row.currency,
                                        ) ?? "—"}
                                    </span>
                                    {row.varies ? (
                                        <span className="ml-2 text-[12px] text-muted-foreground">
                                            varies by storefront
                                        </span>
                                    ) : null}
                                </PreviewRow>
                                <PreviewRow label="Inventory">
                                    <span
                                        className={cn(
                                            "text-[13px]",
                                            stock?.tone,
                                        )}
                                    >
                                        {stock?.text}
                                    </span>
                                </PreviewRow>
                                <PreviewRow label="Sold at">
                                    <span className="text-[13px]">
                                        {row.places
                                            .map((p) => p.storeName)
                                            .join(" · ")}
                                    </span>
                                </PreviewRow>
                                <PreviewRow label="Updated" last>
                                    <span className="font-mono text-[12px]">
                                        {new Date(row.updatedAt).toLocaleString(
                                            "en-GB",
                                            {
                                                day: "numeric",
                                                month: "short",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            },
                                        )}
                                    </span>
                                </PreviewRow>
                            </dl>
                            <div className="mt-[18px] flex items-start gap-[9px] rounded-[9px] bg-foreground/[0.03] px-[13px] py-[11px]">
                                <Info
                                    aria-hidden
                                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                                />
                                <p className="text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                                    A preview is read-only. Editing happens on
                                    the product page, which has its own address
                                    you can share.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-[9px] border-t border-muted px-[18px] py-3.5">
                            <Button asChild>
                                <Link href={href}>
                                    Open full product
                                    <ExternalLink className="ml-1.5 size-4" />
                                </Link>
                            </Button>
                            <span className="truncate font-mono text-[11px] text-muted-foreground">
                                {href}
                            </span>
                        </div>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function PreviewRow({
    label,
    last = false,
    children,
}: {
    label: string;
    last?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "flex items-center gap-3",
                !last && "border-b border-muted pb-[11px]",
            )}
        >
            <dt className="w-[86px] shrink-0 text-[12.5px] text-muted-foreground">
                {label}
            </dt>
            <dd className="flex min-w-0 items-center">{children}</dd>
        </div>
    );
}
