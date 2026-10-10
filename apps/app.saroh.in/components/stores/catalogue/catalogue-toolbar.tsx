"use client";

import { FailedRead } from "@/components/shared/failed-read";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { Check, ListFilter } from "lucide-react";

import { StorefrontFilter } from "@/components/stores/storefront-filter";
import type { FilterChoices } from "@/lib/products/filter-choices";
import type { ListQuery } from "@/lib/products/list-query";
import type { CataloguePage, ProductStatus } from "@/lib/products/service";

const STATUS_LABEL: Record<ProductStatus, string> = {
    PUBLISHED: "Live",
    DRAFT: "Draft",
    ARCHIVED: "Archived",
};

/**
 * The Products list's toolbar (#519, the design): search, the storefront
 * filter (only with more than one storefront) and Filter; DataView adds how
 * many are in this view. Everything it changes goes into the address, and the server
 * reads the first page again — search covers the whole catalogue, not the
 * page on screen.
 */
export function CatalogueToolbar({
    query,
    go,
    storefronts,
    choices,
    searching = false,
}: {
    /** The list is being read again. */
    searching?: boolean;
    query: ListQuery;
    /** Replace the address with `patch` applied. */
    go: (patch: Partial<ListQuery>) => void;
    storefronts: CataloguePage["storefronts"];
    choices: FilterChoices;
}) {
    const many = storefronts.byStorefront.length > 1;
    return (
        <>
            <ListSearch
                placeholder="Search products"
                defaultValue={query.q}
                searching={searching}
                onSearch={(q) => {
                    if (q !== query.q) go({ q });
                }}
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
                    label="Show products sold at"
                    note="A filter, not a scope. The catalogue belongs to the business, and a location decides what it sells from it."
                />
            ) : null}
            <FilterMenu query={query} go={go} choices={choices} />
        </>
    );
}

/**
 * Filter: status (the working filter the design leaves out, kept), a
 * category and a collection. The button says how many are on.
 */
function FilterMenu({
    query,
    go,
    choices,
}: {
    query: ListQuery;
    go: (patch: Partial<ListQuery>) => void;
    choices: FilterChoices;
}) {
    const on =
        (query.status ? 1 : 0) +
        (query.category ? 1 : 0) +
        (query.collection ? 1 : 0);
    const statuses: (ProductStatus | null)[] = [
        null,
        "PUBLISHED",
        "DRAFT",
        "ARCHIVED",
    ];
    const categoryName = choices.categories?.find(
        (c) => c.id === query.category,
    )?.name;
    const collectionName = choices.collections?.find(
        (c) => c.id === query.collection,
    )?.name;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "gap-[7px] font-medium text-neutral-600 dark:text-foreground",
                        on > 0 && "border-foreground",
                    )}
                    aria-label={
                        on > 0
                            ? `Filter: ${on} on. Change it.`
                            : "Filter products"
                    }
                >
                    <ListFilter className="size-4" />
                    {on > 0 ? `Filter · ${on}` : "Filter"}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="label">Status</DropdownMenuLabel>
                {statuses.map((s) => (
                    <DropdownMenuItem
                        key={s ?? "any"}
                        onSelect={() => go({ status: s })}
                    >
                        <span className="flex-1">
                            {s ? STATUS_LABEL[s] : "Any status"}
                        </span>
                        {s === query.status ? <Check aria-hidden /> : null}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <ChoiceSub
                    label="Category"
                    current={categoryName}
                    choices={choices.categories}
                    value={query.category}
                    empty="No categories yet"
                    onPick={(category) => go({ category })}
                />
                <ChoiceSub
                    label="Collection"
                    current={collectionName}
                    choices={choices.collections}
                    value={query.collection}
                    empty="No collections yet"
                    onPick={(collection) => go({ collection })}
                />
                {on > 0 ? (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={() =>
                                go({
                                    status: null,
                                    category: null,
                                    collection: null,
                                })
                            }
                        >
                            Clear filters
                        </DropdownMenuItem>
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function ChoiceSub({
    label,
    current,
    choices,
    value,
    empty,
    onPick,
}: {
    label: string;
    current: string | undefined;
    choices: { id: string; name: string }[] | null;
    value: string | null;
    empty: string;
    onPick: (id: string | null) => void;
}) {
    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger>
                <span className="flex-1">{label}</span>
                <span className="max-w-[96px] truncate text-xs text-muted-foreground">
                    {current ?? "Any"}
                </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
                {choices === null ? (
                    <FailedRead className="px-2 py-1.5" things="these" />
                ) : choices.length === 0 ? (
                    <EmptyState
                        size="inline"
                        className="px-2 py-1.5"
                        title={empty}
                    />
                ) : (
                    <>
                        <DropdownMenuItem onSelect={() => onPick(null)}>
                            <span className="flex-1">Any</span>
                            {value === null ? <Check aria-hidden /> : null}
                        </DropdownMenuItem>
                        {choices.map((c) => (
                            <DropdownMenuItem
                                key={c.id}
                                onSelect={() => onPick(c.id)}
                            >
                                <span className="flex-1 truncate">
                                    {c.name}
                                </span>
                                {c.id === value ? <Check aria-hidden /> : null}
                            </DropdownMenuItem>
                        ))}
                    </>
                )}
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    );
}
