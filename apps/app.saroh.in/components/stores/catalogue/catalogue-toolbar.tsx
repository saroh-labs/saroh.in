"use client";

import { FailedRead } from "@/components/shared/failed-read";
import { ListFilter, MoreFilters } from "@/components/shared/list-toolbar";
import { ListSearch } from "@saroh/ui/list-search";

import { StorefrontFilter } from "@/components/stores/storefront-filter";
import type { FilterChoices } from "@/lib/products/filter-choices";
import type { ListQuery } from "@/lib/products/list-query";
import type { CataloguePage, ProductStatus } from "@/lib/products/service";

const ANY = "";

const STATUSES: { value: ProductStatus | typeof ANY; label: string }[] = [
    { value: ANY, label: "All statuses" },
    { value: "PUBLISHED", label: "Live" },
    { value: "DRAFT", label: "Draft" },
    { value: "ARCHIVED", label: "Archived" },
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
    choices,
}: ToolbarProps & {
    storefronts: CataloguePage["storefronts"];
    choices: FilterChoices;
}) {
    const many = storefronts.byStorefront.length > 1;
    return (
        <>
            <ListFilter<ProductStatus | typeof ANY>
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
                choices={choices.categories}
                value={query.category}
                onPick={(category) => go({ category })}
            />
            {many ? (
                <StorefrontFilter
                    stores={storefronts.byStorefront}
                    countFor={(id) =>
                        storefronts.byStorefront.find((s) => s.id === id)
                            ?.count ?? 0
                    }
                    total={storefronts.everywhere}
                    value={query.storefront}
                    onChange={(storefront) => go({ storefront })}
                    noun={{ one: "product", other: "products" }}
                    note="A filter, not a scope. The catalogue belongs to the business, and a location decides what it sells from it."
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
}: ToolbarProps & { choices: FilterChoices }) {
    return (
        <MoreFilters title="Filter products" count={query.collection ? 1 : 0}>
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

/** Whether the toolbar has narrowed the catalogue, a search included. */
export const catalogueNarrowed = (query: ListQuery) =>
    [
        query.q,
        query.status,
        query.category,
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
