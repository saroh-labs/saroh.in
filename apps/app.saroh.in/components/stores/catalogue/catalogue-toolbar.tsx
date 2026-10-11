"use client";

import { FailedRead } from "@/components/shared/failed-read";
import { FilterChips, ListFilter } from "@/components/shared/list-toolbar";
import { ListSearch } from "@saroh/ui/list-search";

import { StorefrontFilter } from "@/components/stores/storefront-filter";
import type { FilterChoices } from "@/lib/products/filter-choices";
import type { ListQuery } from "@/lib/products/list-query";
import type { CataloguePage, ProductStatus } from "@/lib/products/service";

const ANY = "";

const STATUS_CHIPS: { value: ProductStatus | typeof ANY; label: string }[] = [
    { value: ANY, label: "All" },
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
 * The Products list's toolbar (#519), in the one list toolbar's order:
 * search, then the dropdown filters (the location, only with more than
 * one, a category and a collection), then the status chips. DataView adds
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

/** Location, category and collection: each the toolbar's one dropdown. */
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
            <ChoiceFilter
                label="Category"
                any="Any category"
                things="categories"
                empty="No categories yet"
                choices={choices.categories}
                value={query.category}
                onPick={(category) => go({ category })}
            />
            <ChoiceFilter
                label="Collection"
                any="Any collection"
                things="collections"
                empty="No collections yet"
                choices={choices.collections}
                value={query.collection}
                onPick={(collection) => go({ collection })}
            />
        </>
    );
}

/** All, Live, Draft, Archived: the list's status, as the chip row. */
export function CatalogueStatusChips({ query, go }: ToolbarProps) {
    return (
        <FilterChips
            label="Status"
            value={query.status ?? ANY}
            onValueChange={(status) => go({ status: status || null })}
            chips={STATUS_CHIPS}
        />
    );
}

function ChoiceFilter({
    label,
    any,
    things,
    empty,
    choices,
    value,
    onPick,
}: {
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
        />
    );
}
