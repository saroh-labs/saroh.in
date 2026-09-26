"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";

import { productHref } from "@/lib/products/links";
import { noRowsWords, untrackedLine } from "@/lib/stock/screen";
import { loadLevelsPage } from "@/lib/stock/screen-actions";
import type { StockLevels } from "@/lib/stock/service";

import { LevelsTable } from "./levels-table";
import { chipClass } from "./tones";

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
    const [search, setSearch] = useState(q);
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
    const typed = useRef(q);
    useEffect(() => {
        if (search.trim() === typed.current) return;
        const t = setTimeout(() => {
            typed.current = search.trim();
            router.replace(href({ q: search.trim() || undefined }), {
                scroll: false,
            });
        }, 300);
        return () => clearTimeout(t);
    }, [search, href, router]);

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
                <Input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find a product or SKU"
                    aria-label="Find a product or SKU"
                    className="ml-auto h-8 w-[220px] max-w-full rounded-[8px] bg-card px-[11px] text-[12.5px] coarse:h-11"
                />
            </div>

            <LevelsTable
                storefronts={levels.storefronts}
                rows={rows}
                timezone={levels.timezone ?? "Asia/Kolkata"}
                counting={counting}
                values={values}
                onValue={onValue}
                empty={noRowsWords({
                    needs: show === "needs",
                    q,
                    all: show === "all" && !q,
                })}
            />

            {loaded.next ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={more}
                    >
                        {pending ? "Loading…" : "Show more"}
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
                                    <Link
                                        href={productHref(null, p.productId)}
                                        className="font-semibold text-brand hover:text-foreground"
                                    >
                                        {p.name}
                                    </Link>
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
