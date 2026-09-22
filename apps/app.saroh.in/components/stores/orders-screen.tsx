"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import { Download, Plus, Store } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { ViewerDate } from "@/components/shared/viewer-date";
import { StorefrontFilter } from "@/components/stores/storefront-filter";
import { formatMoneyMajor } from "@/lib/format/money";
import type {
    BusinessOrder,
    OrderStanding,
} from "@/lib/orders/business-service";
import { ordersToCsv } from "@/lib/orders/export";
import { newOrderHref, orderHref } from "@/lib/orders/links";

/**
 * How a standing is said, and in what shape.
 *
 * The word is the signal and the colour only reinforces it (brand file §7),
 * which matters most here: "unfulfilled" and "refunded" are opposite kinds of
 * work and a merchant should not have to tell amber from grey to know which.
 *
 * `neutral` for refunded is the badge the brand file draws for exactly this —
 * present, and asking nothing of anyone.
 */
const STANDING: Record<
    OrderStanding,
    { label: string; variant: "draft" | "success" | "neutral" }
> = {
    UNFULFILLED: { label: "Unfulfilled", variant: "draft" },
    FULFILLED: { label: "Fulfilled", variant: "success" },
    REFUNDED: { label: "Refunded", variant: "neutral" },
    CANCELLED: { label: "Cancelled", variant: "neutral" },
};

/**
 * The tabs.
 *
 * Their ids are a URL contract — the API hands merchants links carrying
 * `?view=`, so renaming one breaks a link that is already out in the world.
 *
 * The design draws a fourth tab called "Abandoned". An abandoned order is a
 * cart someone walked away from BEFORE it became an order, and Saroh does not
 * model carts — the tab would sit at 0 forever and quietly promise a feature.
 * "Cancelled" is a real state and a real question, so the tab is named for
 * what it can actually show.
 */
const FILTERS: DataFilter<BusinessOrder>[] = [
    { id: "all", label: "All" },
    {
        id: "unfulfilled",
        label: "Unfulfilled",
        predicate: (o) => o.standing === "UNFULFILLED",
    },
    {
        id: "refunds",
        label: "Refunds",
        predicate: (o) => o.standing === "REFUNDED",
    },
    {
        id: "cancelled",
        label: "Cancelled",
        predicate: (o) => o.standing === "CANCELLED",
    },
];

/** Two letters from the name, or one from the email when there is no name. */
function initials(order: BusinessOrder): string {
    const name = order.customer?.name ?? "";
    const letters = name
        .split(/[\s&]+/)
        .filter((w) => /^[A-Za-zÀ-ÿ]/.test(w))
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join("");
    if (letters.length > 0) return letters;
    return (order.customer?.email ?? "?").charAt(0).toUpperCase();
}

/**
 * Sell → Orders: every order in the business, not one storefront at a time.
 *
 * The rail has badged a count of unfulfilled orders across the whole business
 * for as long as it has had a count, and until now there was no screen that
 * could show them — a merchant with three storefronts had to open each one and
 * add up. This is that screen, so the number and the list are finally the same
 * fact.
 *
 * The storefront control is a FILTER, not a scope: orders belong to the
 * business. Narrowing to one storefront answers "what is waiting at Hill
 * Road", and the count label keeps saying how many storefronts are in view so
 * nobody mistakes a filtered list for all of it.
 */
export function OrdersScreen({
    orders,
    stores,
    initialFilterId,
}: {
    orders: BusinessOrder[];
    stores: { id: string; name: string }[];
    /** From `?view=`, so a link from Home lands on the right tab. */
    initialFilterId?: string;
}) {
    const [storeId, setStoreId] = useState<string | null>(null);
    const many = stores.length > 1;

    const rows = useMemo(
        () => (storeId ? orders.filter((o) => o.store.id === storeId) : orders),
        [orders, storeId],
    );

    const columns: DataColumn<BusinessOrder>[] = [
        {
            id: "order",
            header: "Order",
            priority: "primary",
            sortValue: (o) => o.customer?.name?.toLowerCase() ?? "",
            cell: (o) => (
                <span className="flex min-w-0 items-center gap-3">
                    <span
                        aria-hidden
                        className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-neutral-700 dark:text-foreground"
                    >
                        {initials(o)}
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">
                            {o.customer?.name ??
                                o.customer?.email ??
                                "Unknown customer"}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                            {`#${o.orderId} · `}
                            {o.itemCount === 1
                                ? "1 item"
                                : `${o.itemCount} items`}
                            {` · ${o.store.name}`}
                        </span>
                    </span>
                </span>
            ),
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            width: "132px",
            sortValue: (o) => STANDING[o.standing].label,
            cell: (o) => (
                <Badge variant={STANDING[o.standing].variant}>
                    {STANDING[o.standing].label}
                </Badge>
            ),
        },
        {
            id: "placed",
            header: "Placed",
            priority: "secondary",
            width: "150px",
            sortValue: (o) => o.placedAt,
            cell: (o) => <ViewerDate iso={o.placedAt} />,
        },
        {
            id: "total",
            header: "Total",
            priority: "secondary",
            numeric: true,
            money: true,
            width: "128px",
            sortValue: (o) => Number(o.total),
            cell: (o) => formatMoneyMajor(o.total, o.currency),
        },
    ];

    return (
        <>
            <PageHeader
                breadcrumb={["Sell", "Orders"]}
                title="Orders"
                className="mb-0"
                actions={
                    stores.length > 0 ? (
                        <>
                            <Button
                                variant="outline"
                                disabled={rows.length === 0}
                                onClick={() =>
                                    downloadCsv(
                                        rows,
                                        stores.find((s) => s.id === storeId)
                                            ?.name,
                                    )
                                }
                            >
                                <Download className="mr-1.5 size-4" />
                                Export
                            </Button>
                            <Button asChild>
                                {/* Into the storefront in view, or — with several
                                and none chosen — a page that asks which. */}
                                <Link
                                    href={newOrderHref(
                                        storeId ??
                                            (stores.length === 1
                                                ? stores[0].id
                                                : undefined),
                                    )}
                                >
                                    <Plus className="mr-1.5 size-4" />
                                    New order
                                </Link>
                            </Button>
                        </>
                    ) : undefined
                }
            />

            <DataView
                viewId="orders"
                rows={rows}
                columns={columns}
                rowKey={(o) => o.id}
                rowHref={(o) => orderHref(o.store.id, o.id)}
                modes={["table", "list"]}
                hideModeToggle
                filters={FILTERS}
                initialFilterId={initialFilterId}
                noun={{ one: "order", other: "orders" }}
                searchPlaceholder="Search orders"
                searchableColumnIds={["order"]}
                toolbarExtra={
                    many ? (
                        <StorefrontFilter
                            stores={stores}
                            countFor={(id) =>
                                orders.filter((o) => o.store.id === id).length
                            }
                            total={orders.length}
                            value={storeId}
                            onChange={setStoreId}
                            noun={{ one: "order", other: "orders" }}
                            label="Show orders placed at"
                            note="A filter, not a scope. The count beside Sell keeps counting every storefront, so narrowing here never hides work from you."
                        />
                    ) : undefined
                }
                countLabel={(visible) =>
                    `${visible} ${visible === 1 ? "order" : "orders"}` +
                    (storeId || !many
                        ? ""
                        : ` across ${stores.length} storefronts`)
                }
                emptyState={{
                    icon: (
                        <Store
                            aria-hidden
                            className="size-[30px] stroke-[1.8] text-muted-foreground"
                        />
                    ),
                    title: "No orders yet",
                    note: "When someone buys from one of your storefronts, the order appears here — and the count beside Sell tells you before you go looking.",
                }}
            />
        </>
    );
}

/**
 * Hand the orders in view to the browser as a CSV file. Named for the
 * storefront when the list is filtered to one, and dated, so a folder of
 * exports sorts itself.
 */
function downloadCsv(rows: BusinessOrder[], storeName?: string) {
    // A byte-order mark, so Excel reads ₹ and names in the right encoding.
    const blob = new Blob(["\ufeff", ordersToCsv(rows)], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const day = new Date().toISOString().slice(0, 10);
    const scope = storeName
        ? `-${storeName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")}`
        : "";
    a.href = url;
    a.download = `orders${scope}-${day}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
