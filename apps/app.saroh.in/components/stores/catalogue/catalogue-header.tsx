"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IntentLink } from "@saroh/ui/intent-link";
import { planLabel } from "@saroh/ui/lib/state-copy";
import { PageHeader } from "@saroh/ui/page-header";
import { ChevronDown, Store } from "lucide-react";

import { PlanWay } from "@/components/billing/plan-way";
import type { PlanMeter } from "@/lib/billing/meter";
import { meterBeside } from "@/lib/billing/meter";
import { newProductHref, productSettingsHref } from "@/lib/products/links";
import { importProductsHref } from "@/lib/stores/links";

/**
 * The Products header (the design): "More ▾" — Import from a spreadsheet,
 * Product settings — and New product. With several storefronts and none
 * picked, New product asks where first (a picker only with more than one).
 * Only a role that changes products sees them.
 *
 * On a plan with a product limit, "4 of 10 products" sits beside them from
 * the first product (UX-036); at the limit New product is off, says why,
 * and Upgrade takes its place — never the full editor, refused on Create.
 */
export function CatalogueHeader({
    stores,
    storeId,
    canWrite,
    meter = null,
    bannerShown = false,
    count,
}: {
    /** "12 products across 2 locations", beside the title; none at zero. */
    count?: string;
    stores: { id: string; name: string }[];
    /** The storefront filter, if one is picked. */
    storeId: string | null;
    canWrite: boolean;
    /** The plan's product limit, when one stops the business. */
    meter?: PlanMeter | null;
    /**
     * The page's limit banner says it already (from 80%): the count and
     * Upgrade aren't said twice (#874).
     */
    bannerShown?: boolean;
}) {
    const beside = meterBeside(meter, bannerShown);
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
                            <IntentLink
                                data-ph-unmask=""
                                href={importProductsHref(
                                    here?.id ?? (many ? undefined : first.id),
                                )}
                            >
                                Import from a spreadsheet
                            </IntentLink>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <IntentLink
                                data-ph-unmask=""
                                href={productSettingsHref()}
                            >
                                Product settings
                            </IntentLink>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                {meter?.full ? (
                    <>
                        <Button disabled title={meter.reason ?? undefined}>
                            New product
                        </Button>
                        <span className="sr-only">{meter.reason}</span>
                        {beside.upgrade ? (
                            <PlanWay fallback={null}>
                                <Button asChild variant="outline">
                                    <IntentLink href={meter.href}>
                                        {planLabel(meter.upgradeTo)}
                                    </IntentLink>
                                </Button>
                            </PlanWay>
                        ) : null}
                    </>
                ) : many && !here ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button>
                                New product
                                <ChevronDown className="ml-1 size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel className="label">
                                Add it to
                            </DropdownMenuLabel>
                            {stores.map((s) => (
                                <DropdownMenuItem key={s.id} asChild>
                                    <IntentLink href={newProductHref(s.id)}>
                                        <Store />
                                        {s.name}
                                    </IntentLink>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Button asChild>
                        <IntentLink href={newProductHref((here ?? first).id)}>
                            New product
                        </IntentLink>
                    </Button>
                )}
            </>
        ) : undefined;
    return (
        <PageHeader
            breadcrumb={["Sell", "Products"]}
            title="Products"
            count={count}
            className="mb-0"
            // The plan's meter is a figure, not a button: before them.
            meta={
                actions && meter && beside.label ? (
                    // Beside "71 products" it must say why it's fewer.
                    <span
                        title="Archived products don't count toward your plan."
                        className={
                            meter.full
                                ? "text-[12.5px] font-semibold text-destructive-subtle-foreground"
                                : "text-[12.5px] text-muted-foreground"
                        }
                    >
                        {beside.label} on your plan
                    </span>
                ) : undefined
            }
            actions={actions}
        />
    );
}
