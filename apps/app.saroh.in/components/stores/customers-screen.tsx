"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { Plus, Store, Upload, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DataView } from "@/components/shared/data-view/data-view";
import type { DataColumn } from "@/components/shared/data-view/types";
import { ViewerDate } from "@/components/shared/viewer-date";
import { StorefrontFilter } from "@/components/stores/storefront-filter";
import { StorefrontPartial } from "@/components/stores/storefront-partial";
import type { DirectoryRow } from "@/lib/customers/directory";
import { inStorefront, mergeCustomers } from "@/lib/customers/directory";
import {
    customerHref,
    importCustomersHref,
    newCustomerHref,
} from "@/lib/customers/links";
import type { CustomerListItem } from "@/lib/customers/service";
import { formatMoneyMajor } from "@/lib/format/money";

/** Two letters from the name, or one from the email when there is no name. */
function initials(row: DirectoryRow): string {
    const letters = row.name
        .split(/[\s&]+/)
        .filter((w) => /^[A-Za-zÀ-ÿ]/.test(w))
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join("");
    return letters.length > 0 ? letters : row.email.charAt(0).toUpperCase();
}

function Avatar({ row }: { row: DirectoryRow }) {
    return (
        <span
            aria-hidden
            className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-neutral-700 dark:text-foreground"
        >
            {initials(row)}
        </span>
    );
}

/**
 * Sell → Customers: everyone who has bought from this business.
 *
 * The same shape as the catalogue, for the same reason: customers are stored
 * per storefront, but a person who buys at two of them is one person. The
 * storefront control is a FILTER on this one list, and says so — the workspace
 * design is explicit that customers belong to the business, not to a
 * storefront.
 *
 * What a row shows is what a merchant judges a customer by: what they have
 * paid, how often, and when they last bought. "Spent" is money that actually
 * arrived — an unpaid order is not spend — and where someone has paid in more
 * than one currency the row says so rather than adding them together.
 */
export function CustomersScreen({
    stores,
    customersByStore,
    missing = [],
}: {
    stores: { id: string; name: string }[];
    customersByStore: Record<string, CustomerListItem[]>;
    /** Storefronts whose list could not be read; see `StorefrontPartial`. */
    missing?: { id: string; name: string }[];
}) {
    const directory = useMemo(
        () => mergeCustomers(stores, customersByStore),
        [stores, customersByStore],
    );
    const [storeId, setStoreId] = useState<string | null>(null);
    const many = stores.length > 1;
    const store = stores.find((s) => s.id === storeId);
    const first = stores.at(0);

    const rows = useMemo(() => {
        if (!storeId) return directory;
        return directory
            .map((r) => inStorefront(r, storeId))
            .filter((r): r is DirectoryRow => r !== null);
    }, [directory, storeId]);

    const columns: DataColumn<DirectoryRow>[] = [
        {
            id: "customer",
            header: "Customer",
            priority: "primary",
            sortValue: (r) => r.name.toLowerCase(),
            cell: (r) => (
                <span className="flex min-w-0 items-center gap-3">
                    <Avatar row={r} />
                    <span className="min-w-0">
                        <span className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-medium">
                                {r.name}
                            </span>
                            {r.orderCount > 1 ? (
                                <Badge variant="success">Returning</Badge>
                            ) : null}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                            {r.name === r.email ? null : `${r.email} · `}
                            {r.orderCount === 1
                                ? "1 order"
                                : `${r.orderCount} orders`}
                            {!storeId && r.places.length > 1
                                ? ` · ${r.places.length} storefronts`
                                : ""}
                        </span>
                    </span>
                </span>
            ),
        },
        {
            id: "spent",
            header: "Spent",
            priority: "secondary",
            numeric: true,
            money: true,
            width: "132px",
            sortValue: (r) => Number(r.spent ?? 0),
            cell: (r) =>
                r.spent === null ? (
                    // Never a zero: nothing paid is not the same fact as
                    // nothing spent, and an em dash says which one this is.
                    <span className="text-muted-foreground">—</span>
                ) : (
                    <span
                        className={cn(r.mixedCurrency && "text-neutral-600")}
                        title={
                            r.mixedCurrency
                                ? `Paid in more than one currency. This is what they have paid in ${r.currency}.`
                                : undefined
                        }
                    >
                        {formatMoneyMajor(r.spent, r.currency)}
                        {r.mixedCurrency ? "+" : ""}
                    </span>
                ),
        },
        {
            id: "last",
            header: "Last order",
            priority: "secondary",
            width: "128px",
            sortValue: (r) => r.lastOrderAt ?? "",
            cell: (r) =>
                r.lastOrderAt === null ? (
                    <span className="text-muted-foreground">Never</span>
                ) : (
                    <ViewerDate iso={r.lastOrderAt} />
                ),
        },
    ];

    // The storefront in view, or the only one. With several and none chosen,
    // the link leads to a page that asks — never quietly to the first.
    const target = store?.id ?? (many ? undefined : first?.id);

    return (
        <>
            <PageHeader
                breadcrumb={["Sell", "Customers"]}
                title="Customers"
                className="mb-0"
                actions={
                    first ? (
                        <>
                            <Button variant="outline" asChild>
                                <Link href={importCustomersHref(target)}>
                                    <Upload className="mr-1.5 size-4" />
                                    Import
                                </Link>
                            </Button>
                            <Button asChild>
                                <Link href={newCustomerHref(target)}>
                                    <Plus className="mr-1.5 size-4" />
                                    Add customer
                                </Link>
                            </Button>
                        </>
                    ) : undefined
                }
            />

            <StorefrontPartial
                missing={missing}
                missingWhat="people who have only bought there"
            />

            {stores.length === 0 ? (
                <div className="flex flex-col items-center gap-[9px] rounded-[11px] border border-dashed border-border-strong px-6 py-12 text-center">
                    <Store
                        aria-hidden
                        className="size-[30px] stroke-[1.8] text-muted-foreground"
                    />
                    <p className="font-display text-[19px] font-semibold tracking-[-0.025em]">
                        No storefront yet
                    </p>
                    <p className="max-w-[48ch] text-[13.5px] leading-[1.55] text-neutral-600">
                        A customer appears here the first time someone orders.
                        Make a storefront, and the list starts filling itself.
                    </p>
                    <Button asChild className="mt-1">
                        <Link href="/stores/new">Create a storefront</Link>
                    </Button>
                </div>
            ) : (
                <DataView
                    viewId="customers"
                    rows={rows}
                    columns={columns}
                    rowKey={(r) => r.key}
                    // Their record at the storefront in view, or their first;
                    // the customer's page links the others.
                    rowHref={(r) => {
                        const place =
                            r.places.find((p) => p.storeId === storeId) ??
                            r.places[0];
                        return customerHref(place.storeId, place.customer.id);
                    }}
                    modes={["table", "list"]}
                    hideModeToggle
                    noun={{ one: "customer", other: "customers" }}
                    searchPlaceholder="Search customers"
                    searchableColumnIds={["customer"]}
                    toolbarExtra={
                        many ? (
                            <StorefrontFilter
                                stores={stores}
                                countFor={(id) =>
                                    directory.filter((r) =>
                                        r.places.some((p) => p.storeId === id),
                                    ).length
                                }
                                total={directory.length}
                                value={storeId}
                                onChange={setStoreId}
                                noun={{
                                    one: "customer",
                                    other: "customers",
                                }}
                                label="Show people who bought at"
                                note="A filter, not a scope. Customers belong to the business; a storefront is where they happened to buy."
                            />
                        ) : undefined
                    }
                    countLabel={(visible) =>
                        `${visible} ${visible === 1 ? "customer" : "customers"}` +
                        (store
                            ? ` at ${store.name}`
                            : many
                              ? ` across ${stores.length} storefronts`
                              : "")
                    }
                    emptyState={{
                        icon: <Users />,
                        title: "No customers yet",
                        note: `Nobody has bought from ${store?.name ?? (many ? "these storefronts" : (first?.name ?? "your storefront"))} yet. A customer appears here the first time an order is paid for — or add one now.`,
                        action: first ? (
                            <Button asChild>
                                <Link href={newCustomerHref(target)}>
                                    Add customer
                                </Link>
                            </Button>
                        ) : undefined,
                    }}
                />
            )}

            {rows.length > 0 ? (
                // The design's list note: the sentence that stops a merchant
                // reading a filtered list as the whole truth.
                <p className="mt-2.5 text-pretty text-[11.5px] text-muted-foreground">
                    {store
                        ? `Customers belong to the business — this list is filtered to ${store.name}, not owned by it.`
                        : "Spent counts orders that were paid for. Someone who has ordered but not paid shows an em dash, not a zero."}
                </p>
            ) : null}
        </>
    );
}
