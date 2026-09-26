"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

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
    const grid = {
        gridTemplateColumns: `minmax(150px, 1.4fr) repeat(${n}, minmax(118px, 1fr)) minmax(120px, 1fr)`,
    };
    // Beyond two storefronts, the columns keep their width and scroll.
    const minWidth = n > 2 ? 150 + n * 130 + 132 + 12 * (n + 1) + 32 : 560;

    return (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <div className="px-4" style={{ minWidth }}>
                <div
                    className="grid gap-3 border-b border-border py-[11px] pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                    style={grid}
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
                {rows.map((row) => (
                    <div
                        key={`${row.productId}|${row.variantId ?? ""}`}
                        className="grid items-center gap-3 border-b border-border py-[11px] last:border-b-0"
                        style={grid}
                    >
                        <Link
                            href={productHref(null, row.productId, "variants")}
                            className="sticky left-0 z-10 -ml-4 grid min-w-0 gap-px bg-card pl-4 text-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                            <span className="truncate text-[13.5px] font-semibold">
                                {row.productName}
                            </span>
                            <span className="truncate text-[11.5px] text-muted-foreground">
                                {rowSub(row) || " "}
                            </span>
                        </Link>
                        {row.cells.map((cell, i) => (
                            <Cell
                                key={cell.storeId}
                                cell={cell}
                                counting={counting}
                                countKey={countKey(row, cell.storeId)}
                                label={`${row.productName}${row.variantTitle ? ` ${row.variantTitle}` : ""} counted at ${storefronts[i]?.name ?? "this storefront"}`}
                                values={values}
                                onValue={onValue}
                            />
                        ))}
                        <span className="text-pretty text-[12px] leading-[1.45] text-muted-foreground">
                            {lastChangeWords(row.lastChange, timezone)}
                        </span>
                    </div>
                ))}
                {rows.length === 0 ? (
                    <p className="py-7 text-center text-[13px] text-muted-foreground">
                        {empty}
                    </p>
                ) : null}
            </div>
        </div>
    );
}

function Cell({
    cell,
    counting,
    countKey: key,
    label,
    values,
    onValue,
}: {
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
            <span className="min-w-0 text-[12px] text-muted-foreground">
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
            <div className="grid min-w-0 gap-[3px]">
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
        <div className="grid min-w-0 gap-0.5">
            <span
                className={cn(
                    "text-[13.5px] font-semibold tabular-nums",
                    TEXT_TONE[head.tone],
                )}
            >
                {head.text}
            </span>
            <span className="text-[11.5px] tabular-nums text-muted-foreground">
                {cellSub(cell)}
            </span>
        </div>
    );
}
