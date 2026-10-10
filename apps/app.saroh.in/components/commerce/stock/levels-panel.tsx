"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";

import { productHref } from "@/lib/products/links";
import { untrackedLine } from "@/lib/stock/screen";
import { loadLevelsPage } from "@/lib/stock/screen-actions";
import type { StockLevels } from "@/lib/stock/service";
import { EmptyState } from "@saroh/ui/data-state";
import { Boxes } from "lucide-react";

import { chipClass } from "@/components/shared/chip";
import { ListSearch } from "@saroh/ui/list-search";
import { TextLink } from "@saroh/ui/text-link";
import { LevelsTable } from "./levels-table";

/**
 * Levels (#527): the chips (All, Needs you, a storefront), the search, the
 * table a page at a time, and the footer naming what isn't tracked. The
 * chip and the search are in the address; the next page comes on "Show
 * more".
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
    pageSize,
}: {
    levels: StockLevels;
    /** Every open storefront, for the chips and the footer. */
    allStorefronts: { id: string; name: string }[];
    needsYou: number;
    show: string;
    q: string;
    /** The screen's address with these changed. */
    href: (change: Record<string, string | undefined>) => string;
    counting: boolean;
    values: Readonly<Record<string, string>>;
    onValue: (key: string, raw: string, logSaid: number) => void;
    pageSize: number;
}) {
    const router = useRouter();
    const [loaded, setLoaded] = useState({
        from: levels,
        rows: levels.rows,
        next: levels.nextCursor ?? null,
    });
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pending, start] = useTransition();
    // New levels from the server (a filter, a save): start from them.
    if (loaded.from !== levels) {
        setLoaded({
            from: levels,
            rows: levels.rows,
            next: levels.nextCursor ?? null,
        });
    }

    // The search follows typing into the address, a beat behind.
    const [searching, startSearch] = useTransition();
    const search = (term: string) => {
        if (term === q) return;
        startSearch(() =>
            router.replace(href({ q: term || undefined }), { scroll: false }),
        );
    };

    const storefrontView = allStorefronts.some((s) => s.id === show);
    // One storefront's view: what it sells or still holds.
    const rows = storefrontView
        ? loaded.rows.filter((r) =>
              r.cells.some((c) => c.soldHere || c.onHand > 0),
          )
        : loaded.rows;

    const chips = [
        { id: "all", label: "All" },
        {
            id: "needs",
            label: needsYou > 0 ? `Needs you · ${needsYou}` : "Needs you",
        },
        // A storefront chip only where there is more than one (ADR-010).
        ...(allStorefronts.length > 1
            ? allStorefronts.map((s) => ({ id: s.id, label: s.name }))
            : []),
    ];

    const soldOutWords = (ids: string[] | undefined) => {
        if (!ids?.length) return null;
        if (allStorefronts.length <= 1) return "Sold out";
        const names = ids
            .map((id) => allStorefronts.find((s) => s.id === id)?.name)
            .filter(Boolean);
        return `Sold out at ${names.join(" and ")}`;
    };

    const more = () =>
        start(async () => {
            if (!loaded.next) return;
            setLoadError(null);
            const res = await loadLevelsPage({
                storefront: storefrontView ? show : undefined,
                q: q || undefined,
                needs: show === "needs",
                cursor: loaded.next,
                limit: pageSize,
            });
            if (!res.ok) {
                setLoadError(res.error);
                return;
            }
            setLoaded((l) => ({
                ...l,
                rows: [...l.rows, ...res.data.rows],
                next: res.data.nextCursor ?? null,
            }));
        });

    return (
        <div>
            <ListSearch
                placeholder="Search stock by product or SKU"
                defaultValue={q}
                searching={searching}
                onSearch={search}
                className="mb-3"
            />
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <div
                    role="group"
                    aria-label="Which products"
                    className="flex flex-wrap gap-2"
                >
                    {chips.map((c) => (
                        <Link
                            key={c.id}
                            href={href({
                                show: c.id === "all" ? undefined : c.id,
                            })}
                            scroll={false}
                            aria-current={show === c.id ? "true" : undefined}
                            className={chipClass(show === c.id)}
                        >
                            {c.label}
                        </Link>
                    ))}
                </div>
            </div>

            <LevelsTable
                storefronts={levels.storefronts}
                rows={rows}
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

            {loaded.next ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={more}
                        busy={pending}
                        busyLabel="Loading…"
                    >
                        Show more
                    </Button>
                    <span className="text-[12px] text-muted-foreground">
                        {`${new Set(loaded.rows.map((r) => r.productId)).size} products shown`}
                    </span>
                    {loadError ? (
                        <span
                            role="alert"
                            className="text-[12px] text-destructive"
                        >
                            {loadError}
                        </span>
                    ) : null}
                </div>
            ) : null}

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
