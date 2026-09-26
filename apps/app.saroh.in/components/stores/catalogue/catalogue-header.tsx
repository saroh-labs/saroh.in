"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { PageHeader } from "@saroh/ui/page-header";
import { ChevronDown, Plus, Store } from "lucide-react";
import Link from "next/link";

import { newProductHref, productSettingsHref } from "@/lib/products/links";
import { importProductsHref } from "@/lib/stores/links";

/**
 * The Products header (the design): "More ▾" — Import from a spreadsheet,
 * Product settings — and New product. With several storefronts and none
 * picked, New product asks where first (a picker only with more than one).
 * Only a role that changes products sees them.
 */
export function CatalogueHeader({
    stores,
    storeId,
    canWrite,
}: {
    stores: { id: string; name: string }[];
    /** The storefront filter, if one is picked. */
    storeId: string | null;
    canWrite: boolean;
}) {
    const first = stores.at(0);
    const many = stores.length > 1;
    const here = stores.find((s) => s.id === storeId) ?? null;
    const actions =
        first && canWrite ? (
            <>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" aria-label="More actions">
                            More
                            <ChevronDown className="ml-1.5 size-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[220px]">
                        <DropdownMenuItem asChild>
                            <Link
                                href={importProductsHref(
                                    here?.id ?? (many ? undefined : first.id),
                                )}
                            >
                                Import from a spreadsheet
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href={productSettingsHref()}>
                                Product settings
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                {many && !here ? (
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
                                <DropdownMenuItem key={s.id} asChild>
                                    <Link href={newProductHref(s.id)}>
                                        <Store />
                                        {s.name}
                                    </Link>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Button asChild>
                        <Link href={newProductHref((here ?? first).id)}>
                            <Plus className="mr-1.5 size-4" />
                            New product
                        </Link>
                    </Button>
                )}
            </>
        ) : undefined;
    return (
        <PageHeader
            breadcrumb={["Sell", "Products"]}
            title="Products"
            className="mb-0"
            actions={actions}
        />
    );
}
