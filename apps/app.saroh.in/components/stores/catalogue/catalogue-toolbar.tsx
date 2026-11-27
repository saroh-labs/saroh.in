"use client";

import type { ReactNode } from "react";

import {
    ListFilter,
    MoreFilters,
} from "@/components/shared/lists/list-toolbar";
import { FailedRead } from "@saroh/ui/failed-read";
import { ListSearch } from "@saroh/ui/list-search";

import { StorefrontFilter } from "@/components/stores/locations/storefront-filter";
import type { FilterChoices } from "@/lib/products/filter-choices";
import type { ListQuery } from "@/lib/products/list-query";
import type { CatalogueSort } from "@/lib/products/list-sort";
import type { CataloguePage, ProductStatus } from "@/lib/products/service";
import { PRODUCT_STATUS_WORD } from "@/lib/products/status-word";

const ANY = "";
/** `?category=none`: the products with no category. */
const UNCATEGORIZED = "none";

/** Live and draft first, what the list opens on (DEC-268). */
const STATUSES: {
    value: ProductStatus | "ALL" | typeof ANY;
    label: string;
}[] = [
    { value: ANY, label: "Live and draft" },
    { value: "PUBLISHED", label: PRODUCT_STATUS_WORD.PUBLISHED },
    { value: "DRAFT", label: PRODUCT_STATUS_WORD.DRAFT },
    { value: "ARCHIVED", label: PRODUCT_STATUS_WORD.ARCHIVED },
    { value: "ALL", label: "All statuses" },
];

interface ToolbarProps {
    query: ListQuery;
    /** Replace the address with `patch` applied. */
    go: (patch: Partial<ListQuery>) => void;
}

/**
 * The Products list's toolbar (#519), in the one list toolbar's row:
 * search, then its three most used filters as dropdowns (the status, a
 * category, and the location where there is more than one), then one
 * Filters button for the rest (a collection). DataView adds
 * how many are in this view. Everything goes into the address, and the
 * server reads the first page again: search covers the whole catalogue,
 * not the page on screen.
 */
export function CatalogueSearch({
    query,
    go,
    searching = false,
}: ToolbarProps & {
    /** The list is being read again. */
    searching?: boolean;
}) {
    return (
        <ListSearch
            placeholder="Search products"
            defaultValue={query.q}
            searching={searching}
            onSearch={(q) => {
                if (q !== query.q) go({ q });
            }}
        />
    );
}

/** The row's three most used: the status, the category and the location. */
export function CatalogueFilters({
    query,
    go,
    storefronts,
    stores,
    choices,
}: ToolbarProps & {
    /** Null while the page is on its way: the locations, uncounted. */
    storefronts: CataloguePage["storefronts"] | null;
    stores: { id: string; name: string }[];
    choices: FilterChoices;
}) {
    const list = storefronts?.byStorefront ?? stores;
    const many = list.length > 1;
    return (
        <>
            <ListFilter<ProductStatus | "ALL" | typeof ANY>
                label="Status"
                value={query.status ?? ANY}
                onValueChange={(status) => go({ status: status || null })}
                options={STATUSES}
            />
            <ChoiceFilter
                label="Category"
                any="All categories"
                things="categories"
                empty="No categories yet"
                choices={
                    choices.categories && [
                        ...choices.categories,
                        // Settings › Categories links its Uncategorized here.
                        { id: UNCATEGORIZED, name: "Uncategorized" },
                    ]
                }
                value={query.category}
                onPick={(category) => go({ category })}
            />
            {many ? (
                <StorefrontFilter
                    stores={list}
                    countFor={(id) =>
                        storefronts
                            ? (storefronts.byStorefront.find((s) => s.id === id)
                                  ?.count ?? 0)
                            : null
                    }
                    total={storefronts?.everywhere ?? null}
                    value={query.storefront}
                    onChange={(storefront) => go({ storefront })}
                    noun={{ one: "product", other: "products" }}
                    note="Shows what this location sells. Products belong to the business."
                />
            ) : null}
        </>
    );
}

/**
 * The filter past the row's three (status, category, location): which
 * collection, behind the one Filters button.
 */
export function CatalogueMoreFilters({
    query,
    go,
    choices,
    phone = null,
}: ToolbarProps & {
    choices: FilterChoices;
    /** A phone's own row's filters and sort, folded in here. */
    phone?: ReactNode;
}) {
    return (
        <MoreFilters
            title="Filter products"
            count={(query.collection ? 1 : 0) + (query.option ? 1 : 0)}
        >
            {phone}
            {query.option ? (
                // Only reached from Settings › Options' count, so only
                // offered while it narrows.
                <ChoiceFilter
                    wide
                    label="Option"
                    any="All options"
                    things="options"
                    empty="No options yet"
                    choices={choices.options ?? null}
                    value={query.option}
                    onPick={(option) => go({ option })}
                />
            ) : null}
            <ChoiceFilter
                wide
                label="Collection"
                any="All collections"
                things="collections"
                empty="No collections yet"
                choices={choices.collections}
                value={query.collection}
                onPick={(collection) => go({ collection })}
            />
        </MoreFilters>
    );
}

const SORTS: { value: CatalogueSort; label: string }[] = [
    { value: "newest", label: "Newest first" },
    { value: "name", label: "Name, A to Z" },
    { value: "-name", label: "Name, Z to A" },
    { value: "stock", label: "Stock, lowest first" },
    { value: "-stock", label: "Stock, highest first" },
    { value: "price", label: "Price, lowest first" },
    { value: "-price", label: "Price, highest first" },
];

/**
 * The list's order (owner, 15 Nov; HPProductsDesk), at the toolbar's
 * right: by name, stock or price, or newest first. The whole catalogue is
 * read in that order (`?sort=`), never one page sorted on its own.
 */
export function CatalogueSortSelect({ query, go }: ToolbarProps) {
    return (
        <ListFilter<CatalogueSort>
            label="Sort"
            value={query.sort}
            onValueChange={(sort) => go({ sort })}
            options={SORTS}
            narrowed={false}
        />
    );
}

/** Whether the toolbar has narrowed the catalogue, a search included. */
export const catalogueNarrowed = (query: ListQuery) =>
    [
        query.q,
        query.status,
        query.category,
        query.option,
        query.collection,
        query.storefront,
    ].some(Boolean);

function ChoiceFilter({
    label,
    any,
    things,
    empty,
    choices,
    value,
    onPick,
    wide = false,
}: {
    /** The width of what holds it (the Filters popover). */
    wide?: boolean;
    label: string;
    any: string;
    things: string;
    empty: string;
    /** `null` when the list couldn't be read. */
    choices: { id: string; name: string }[] | null;
    value: string | null;
    onPick: (id: string | null) => void;
}) {
    if (choices === null) return <FailedRead things={things} />;
    return (
        <ListFilter
            holdsData
            label={label}
            value={value ?? ANY}
            onValueChange={(v) => onPick(v === ANY ? null : v)}
            options={[
                { value: ANY, label: any },
                ...choices.map((c) => ({ value: c.id, label: c.name })),
            ]}
            footer={choices.length === 0 ? empty : undefined}
            className={wide ? "w-full" : undefined}
        />
    );
}
