"use client";

import { Button } from "@saroh/ui/button";
import { rememberPageSize } from "@saroh/ui/page-sizes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useTransition } from "react";

import {
    AttentionToggle,
    ListFilter,
    ListPaging,
    ListToolbar,
} from "@/components/shared/lists/list-toolbar";

import { productHref } from "@/lib/products/links";
import type { StockHref, StockListPage } from "@/lib/stock/list-query";
import { STOCK_LISTS, STOCK_PAGES_LABEL } from "@/lib/stock/list-query";
import { untrackedLine } from "@/lib/stock/screen";
import type { StockLevels } from "@/lib/stock/service";
import { EmptyState } from "@saroh/ui/data-state";
import { Boxes } from "lucide-react";

import { ListSearch } from "@saroh/ui/list-search";
import { TextLink } from "@saroh/ui/text-link";
import { LevelsTable } from "./levels-table";

/**
 * Levels (#527): the one list toolbar (search, the location dropdown and
 * the Needs you toggle, in one row), the table a page at a time, the one
 * list footer (rows per page, the page numbers, Previous and Next), and
 * the line naming what isn't tracked. The filters, the search and the page
 * are in the address. A page is so many products: one that counts three
 * sizes draws three rows and is one of the footer's count.
 */
export function LevelsPanel({
    levels,
    allStorefronts,
    needsYou,
    show,
    q,
    href,
    counting,
    values,
    onValue,
    paging,
}: {
    levels: StockLevels;
    /** Every open storefront, for the chips and the footer. */
    allStorefronts: { id: string; name: string }[];
    needsYou: number;
    show: string;
    q: string;
    /** The screen's address with these changed. */
    href: StockHref;
    counting: boolean;
    values: Readonly<Record<string, string>>;
    onValue: (key: string, raw: string, logSaid: number) => void;
    /** The page on screen and its rows per page. */
    paging: StockListPage;
}) {
    const router = useRouter();

    // The search follows typing into the address, a beat behind.
    const [searching, startSearch] = useTransition();
    const search = (term: string) => {
        if (term === q) return;
        startSearch(() =>
            router.replace(href({ q: term || undefined }), { scroll: false }),
        );
    };

    // One storefront's view is what it sells or still holds: the API
    // leaves the rest out, so the footer counts what is drawn.
    const storefrontView = allStorefronts.some((s) => s.id === show);

    // Two ideas, so two controls: which location (a dropdown, as on the
    // Log), and the one attention toggle, "Needs you". Both write `?show=`
    // as they always have, so choosing one clears the other.
    const locations = [
        { value: "all", label: "All locations" },
        ...allStorefronts.map((s) => ({ value: s.id, label: s.name })),
    ];
    const show_ = (id: string) =>
        router.push(href({ show: id === "all" ? undefined : id }), {
            scroll: false,
        });

    const soldOutWords = (ids: string[] | undefined) => {
        if (!ids?.length) return null;
        if (allStorefronts.length <= 1) return "Sold out";
        const names = ids
            .map((id) => allStorefronts.find((s) => s.id === id)?.name)
            .filter(Boolean);
        return `Sold out at ${names.join(" and ")}`;
    };

    return (
        <div>
            <ListToolbar
                className="mb-3.5"
                search={
                    <ListSearch
                        placeholder="Search stock"
                        describe="By product or SKU"
                        defaultValue={q}
                        searching={searching}
                        onSearch={search}
                    />
                }
                filters={
                    // A location filter only where there is more than
                    // one (ADR-010).
                    allStorefronts.length > 1 ? (
                        <ListFilter
                            holdsData
                            label="Location"
                            value={storefrontView ? show : "all"}
                            onValueChange={show_}
                            options={locations}
                        />
                    ) : null
                }
                onClear={
                    q || show !== "all"
                        ? () =>
                              router.push(
                                  href({ q: undefined, show: undefined }),
                                  { scroll: false },
                              )
                        : undefined
                }
                attention={
                    <AttentionToggle
                        label="Needs you"
                        count={needsYou}
                        on={show === "needs"}
                        onToggle={() =>
                            show_(show === "needs" ? "all" : "needs")
                        }
                    />
                }
            />

            <LevelsTable
                storefronts={levels.storefronts}
                rows={levels.rows}
                timezone={levels.timezone ?? "Asia/Kolkata"}
                counting={counting}
                values={values}
                onValue={onValue}
                empty={
                    show === "needs" && !q ? (
                        <EmptyState
                            size="panel"
                            title="Nothing needs you"
                            description="Every size has more than its warning level."
                        />
                    ) : q ? (
                        <EmptyState
                            kind="no-results"
                            size="panel"
                            things="products"
                            query={q}
                            onClear={() => search("")}
                        />
                    ) : show === "all" ? (
                        <EmptyState
                            size="panel"
                            icon={<Boxes />}
                            title="No stock counted yet"
                            description="Turn on “Track stock” on a product and it shows here."
                            action={
                                <Button asChild variant="outline">
                                    <Link href="/commerce/products">
                                        Go to Products
                                    </Link>
                                </Button>
                            }
                        />
                    ) : (
                        <EmptyState
                            kind="no-results"
                            size="panel"
                            things="products"
                            cause="view"
                            clearHref={href({ show: undefined })}
                        />
                    )
                }
            />

            <ListPaging
                label={STOCK_PAGES_LABEL.levels}
                page={paging.page}
                total={levels.total ?? 0}
                size={paging.size}
                to={(n) => ({ href: href({ page: n }) })}
                onSize={(size) => {
                    rememberPageSize(STOCK_LISTS.levels, size);
                    router.push(href({ size }), { scroll: false });
                }}
            />

            {levels.untracked.length > 0 ? (
                <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
                    <span>{untrackedLine(levels.untracked.length)}</span>
                    {levels.untracked.map((p, i) => {
                        const soldOut = soldOutWords(p.soldOutAt);
                        return (
                            <Fragment key={p.productId}>
                                <span>
                                    <TextLink
                                        href={productHref(null, p.productId)}
                                    >
                                        {p.name}
                                    </TextLink>
                                    {soldOut ? (
                                        <span className="text-destructive">
                                            {` · ${soldOut}`}
                                        </span>
                                    ) : null}
                                    {i < levels.untracked.length - 1 ? "," : ""}
                                </span>
                            </Fragment>
                        );
                    })}
                    <span>
                        Turn tracking on from the product&apos;s editor.
                    </span>
                </p>
            ) : null}
        </div>
    );
}
