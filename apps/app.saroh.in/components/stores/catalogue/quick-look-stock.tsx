"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useMemo, useState } from "react";

import type { CatalogueRow } from "@/lib/products/catalogue";
import { stockWords } from "@/lib/products/catalogue";
import { addQuickStock } from "@/lib/products/list-actions";
import type { QuickShelf } from "@/lib/products/quick-look";
import {
    quickStock,
    readAdd,
    shelfLine,
    shelfTone,
    shortTitle,
    showShelves,
    stockLine,
    storefrontsLine,
} from "@/lib/products/quick-look";
import { addedWords } from "@/lib/stock/levels";

import { TONE_TEXT } from "./tones";

/**
 * Stock: the line, the short alert, and each variant with "+N · Add" for
 * someone who can count stock. Untracked says so, never 0.
 */
export function StockBlock({
    row,
    storeId,
    canStock,
    onChanged,
}: {
    row: CatalogueRow;
    storeId: string | null;
    canStock: boolean;
    onChanged: () => void;
}) {
    const stock = useMemo(() => quickStock(row, storeId), [row, storeId]);
    const where = row.places.filter((p) =>
        stock.shelves.some((s) => s.storeIds.includes(p.storeId)),
    );
    const [addAt, setAddAt] = useState<string | null>(
        where.at(0)?.storeId ?? null,
    );
    const across = storeId ? null : storefrontsLine(row);
    const words = stockWords(row);
    const lineTone = stock.tracked
        ? shelfTone({
              short: stock.total.short,
              canSell: stock.total.canSell,
              warnAt: row.lowStockAlert ?? 0,
          })
        : words.tone;
    return (
        <div className="flex flex-col gap-2 border-b border-muted pb-[11px]">
            <div className="flex items-baseline gap-3">
                <dt className="w-[86px] shrink-0 text-[12.5px] text-muted-foreground">
                    Stock
                </dt>
                <dd className={cn("text-[13px]", TONE_TEXT[lineTone])}>
                    {stock.tracked
                        ? stockLine(stock.total)
                        : words.tone === "danger"
                          ? "Sold out · marked by hand"
                          : "Not tracked · always available"}
                </dd>
            </div>
            {across ? (
                <p className="pl-[98px] text-[12px] text-muted-foreground">
                    {across}
                </p>
            ) : null}
            {stock.total.short > 0 ? (
                <div
                    role="alert"
                    className="rounded-[9px] bg-destructive-subtle px-[11px] py-[9px] text-[12.5px] leading-[1.45] text-destructive-subtle-foreground"
                >
                    <strong>{shortTitle(stock.total.short)}</strong>{" "}
                    {canStock
                        ? "Add stock below, or tell the customers their order will be late."
                        : "Someone who counts stock can add it, or tell the customers their order will be late."}
                </div>
            ) : null}
            {showShelves(stock) ? (
                <>
                    {canStock && where.length > 1 ? (
                        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                            Add at
                            <select
                                value={addAt ?? ""}
                                onChange={(e) => setAddAt(e.target.value)}
                                className="h-[30px] rounded-[7px] border border-border bg-card py-0 pl-2 pr-8 text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11"
                            >
                                {where.map((p) => (
                                    <option key={p.storeId} value={p.storeId}>
                                        {p.storeName}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : null}
                    {stock.shelves.map((s) => (
                        <ShelfRow
                            key={s.variantId ?? "whole"}
                            shelf={s}
                            productId={row.id}
                            storeId={
                                s.storeIds.length === 1
                                    ? (s.storeIds[0] ?? null)
                                    : addAt && s.storeIds.includes(addAt)
                                      ? addAt
                                      : null
                            }
                            storeName={
                                where.length > 1
                                    ? row.places.find(
                                          (p) =>
                                              p.storeId ===
                                              (s.storeIds.length === 1
                                                  ? s.storeIds[0]
                                                  : addAt),
                                      )?.storeName
                                    : undefined
                            }
                            canStock={canStock}
                            onChanged={onChanged}
                        />
                    ))}
                </>
            ) : null}
        </div>
    );
}

function ShelfRow({
    shelf,
    productId,
    storeId,
    storeName,
    canStock,
    onChanged,
}: {
    shelf: QuickShelf;
    productId: string;
    /** Where Add adds; null when the picked storefront doesn't sell it. */
    storeId: string | null;
    storeName?: string;
    canStock: boolean;
    onChanged: () => void;
}) {
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [key, setKey] = useState(() => crypto.randomUUID());
    const units = readAdd(draft);
    const off = units === null || storeId === null || saving;

    async function add() {
        if (units === null || storeId === null || saving) return;
        setSaving(true);
        const res = await addQuickStock({
            storeId,
            productId,
            variantId: shelf.variantId,
            units,
            idempotencyKey: key,
        });
        setSaving(false);
        if (!res.ok) {
            showError("The stock didn't change.", res.error);
            return;
        }
        setDraft("");
        setKey(crypto.randomUUID());
        const what = storeName ? `${shelf.title} at ${storeName}` : shelf.title;
        showSuccess(addedWords(units, what, res.data.shelf.canSell));
        onChanged();
    }

    return (
        <div className="flex items-center gap-2 rounded-[8px] bg-foreground/[0.03] px-[9px] py-[7px]">
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{shelf.title}</div>
                <div
                    className={cn("text-[11.5px]", TONE_TEXT[shelfTone(shelf)])}
                >
                    {shelfLine(shelf)}
                </div>
            </div>
            {canStock ? (
                <>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={draft}
                        onChange={(e) =>
                            setDraft(e.target.value.replace(/[^0-9]/g, ""))
                        }
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void add();
                            }
                        }}
                        aria-label={`Add stock to ${shelf.title}`}
                        placeholder="+0"
                        className="h-[30px] w-[52px] rounded-[7px] border border-border bg-card px-2 text-right text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11"
                    />
                    <Button
                        size="sm"
                        className="h-[30px] px-2.5 coarse:h-11"
                        disabled={off}
                        onClick={() => void add()}
                        aria-label={`Add to ${shelf.title}`}
                    >
                        Add
                    </Button>
                </>
            ) : null}
        </div>
    );
}
