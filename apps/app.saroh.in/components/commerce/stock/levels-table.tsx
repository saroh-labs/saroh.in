"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import type { CSSProperties } from "react";

import { productHref } from "@/lib/products/links";
import type { StockCell } from "@/lib/stock/levels";
import {
    cellHead,
    cellSub,
    countDiff,
    countKey,
    lastChangeWords,
    rowSub,
} from "@/lib/stock/screen";
import type { StockLevelRow } from "@/lib/stock/service";

import { TEXT_TONE } from "./tones";

/**
 * The Levels table (#527): a row per product or size, a column per
 * storefront, and "Last change". Beyond two storefronts the columns scroll
 * sideways and the product column stays put. While counting, each shelf a
 * storefront sells or holds turns into a 92px box with "Log says N" under
 * it.
 *
 * On a phone (under 760px, T2) the same rows read as cards, by CSS alone
 * so nothing flashes on hydration and nothing renders twice: the product
 * and its size on one wrapping line, then a line per storefront ("Hill Road
 * · 11 can sell · 12 on hand · 1 promised"), then "Last change" as a muted
 * sub-line. Nothing scrolls sideways there.
 */
export function LevelsTable({
    storefronts,
    rows,
    timezone,
    counting,
    values,
    onValue,
    empty,
}: {
    storefronts: { id: string; name: string }[];
    rows: StockLevelRow[];
    timezone: string;
    counting: boolean;
    values: Readonly<Record<string, string>>;
    onValue: (key: string, raw: string, logSaid: number) => void;
    /** What the table says with no rows. */
    empty: string;
}) {
    const n = storefronts.length;
    // Product, a column per storefront, Last change — the design's widths.
    // Set as variables so they apply at the desk only (`DESK_GRID`).
    const vars = {
        "--levels-cols": `minmax(150px, 1.4fr) repeat(${n}, minmax(118px, 1fr)) minmax(120px, 1fr)`,
        // Beyond two storefronts, the columns keep their width and scroll.
        "--levels-min": `${n > 2 ? 150 + n * 130 + 132 + 12 * (n + 1) + 32 : 560}px`,
    } as CSSProperties;

    return (
        <div className="rounded-xl border border-border bg-card min-[760px]:overflow-x-auto">
            <div
                className="px-4 min-[760px]:min-w-[var(--levels-min)]"
                style={vars}
            >
                <div
                    className={cn(
                        DESK_GRID,
                        "gap-3 border-b border-border py-[11px] pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground max-[759px]:hidden",
                    )}
                >
                    <span className="sticky left-0 z-10 -ml-4 bg-card pl-4">
                        Product
                    </span>
                    {storefronts.map((s) => (
                        <span key={s.id} className="truncate">
                            {s.name}
                        </span>
                    ))}
                    <span>Last change</span>
                </div>
                <div role="list" aria-label="Stock levels">
                    {rows.map((row) => {
                        const sub = rowSub(row);
                        return (
                            <div
                                key={`${row.productId}|${row.variantId ?? ""}`}
                                role="listitem"
                                className={cn(
                                    DESK_GRID,
                                    "items-center gap-3 border-b border-border py-[11px] last:border-b-0 max-[759px]:gap-1",
                                )}
                            >
                                <Link
                                    href={productHref(
                                        null,
                                        row.productId,
                                        "variants",
                                    )}
                                    className="sticky left-0 z-10 -ml-4 grid min-w-0 gap-px bg-card pl-4 text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:text-muted-foreground max-[759px]:static max-[759px]:ml-0 max-[759px]:flex max-[759px]:min-h-11 max-[759px]:flex-wrap max-[759px]:content-center max-[759px]:items-baseline max-[759px]:gap-x-2 max-[759px]:pl-0"
                                >
                                    <span className="text-[13.5px] font-semibold [overflow-wrap:anywhere] min-[760px]:truncate">
                                        {row.productName}
                                    </span>
                                    <span className="text-[11.5px] text-muted-foreground [overflow-wrap:anywhere] min-[760px]:truncate">
                                        {sub || " "}
                                    </span>
                                </Link>
                                {row.cells.map((cell, i) => (
                                    <Cell
                                        key={cell.storeId}
                                        store={storefronts[i]?.name ?? ""}
                                        cell={cell}
                                        counting={counting}
                                        countKey={countKey(row, cell.storeId)}
                                        label={`${row.productName}${row.variantTitle ? ` ${row.variantTitle}` : ""} counted at ${storefronts[i]?.name ?? "this location"}`}
                                        values={values}
                                        onValue={onValue}
                                    />
                                ))}
                                <span className="text-pretty text-[12px] leading-[1.45] text-muted-foreground max-[759px]:pt-0.5">
                                    {lastChangeWords(row.lastChange, timezone)}
                                </span>
                            </div>
                        );
                    })}
                </div>
                {rows.length === 0 ? (
                    <p className="py-7 text-center text-[13px] text-muted-foreground">
                        {empty}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

/**
 * The desk grid, from `--levels-cols`; under 760px one column, where each
 * cell is a line of the card.
 */
const DESK_GRID =
    "grid max-[759px]:grid-cols-1 min-[760px]:[grid-template-columns:var(--levels-cols)]";

/** On a phone, a cell's line starts with its storefront: "Hill Road ·". */
function StoreLabel({ name }: { name: string }) {
    return (
        <span className="text-[13px] font-medium text-foreground min-[760px]:hidden">
            {name}
            <span aria-hidden className="text-muted-foreground">
                {" "}
                ·
            </span>
        </span>
    );
}

/** A cell's words in a row at the desk, inline on a phone's card. */
const CELL_LINE =
    "grid min-w-0 gap-0.5 max-[759px]:flex max-[759px]:flex-wrap max-[759px]:items-baseline max-[759px]:gap-x-1.5";

function Cell({
    store,
    cell,
    counting,
    countKey: key,
    label,
    values,
    onValue,
}: {
    /** The storefront's name, shown on a phone where there are no columns. */
    store: string;
    cell: StockCell;
    counting: boolean;
    countKey: string;
    label: string;
    values: Readonly<Record<string, string>>;
    onValue: (key: string, raw: string, logSaid: number) => void;
}) {
    // A storefront that doesn't sell it, and holds none: nothing to count.
    const notHere = !cell.soldHere || cell.word === "NOT_SOLD_HERE";
    if (notHere && !(counting && cell.onHand > 0)) {
        return (
            <span className="min-w-0 text-[12px] text-muted-foreground max-[759px]:flex max-[759px]:flex-wrap max-[759px]:gap-x-1.5 max-[759px]:text-[13px]">
                <StoreLabel name={store} />
                {cell.onHand > 0
                    ? `Not sold here · ${cell.onHand} on hand`
                    : "Not sold here"}
            </span>
        );
    }
    if (counting) {
        const raw = values[key] ?? "";
        const diff = countDiff(raw, cell.onHand);
        return (
            <div className="grid min-w-0 gap-[3px] max-[759px]:flex max-[759px]:flex-wrap max-[759px]:items-center max-[759px]:gap-x-2">
                <StoreLabel name={store} />
                <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={raw}
                    placeholder={String(cell.onHand)}
                    aria-label={label}
                    aria-invalid={diff.tone === "danger" || undefined}
                    onChange={(e) => onValue(key, e.target.value, cell.onHand)}
                    className="h-8 w-[92px] rounded-[8px] border-border-strong bg-card px-[9px] text-[13px] tabular-nums coarse:h-11"
                />
                <span
                    className={cn("text-[11.5px]", TEXT_TONE[diff.tone])}
                    aria-live="polite"
                >
                    {diff.text}
                </span>
            </div>
        );
    }
    const head = cellHead(cell);
    return (
        <div className={CELL_LINE}>
            <StoreLabel name={store} />
            <span
                className={cn(
                    "text-[13.5px] font-semibold tabular-nums",
                    TEXT_TONE[head.tone],
                )}
            >
                {head.text}
            </span>
            <span
                aria-hidden
                className="text-muted-foreground min-[760px]:hidden"
            >
                ·
            </span>
            <span className="text-[11.5px] tabular-nums text-muted-foreground max-[759px]:text-[12.5px]">
                {cellSub(cell)}
            </span>
        </div>
    );
}
