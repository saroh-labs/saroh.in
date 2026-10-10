"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { OptionSelect } from "@saroh/ui/option-select";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useId, useMemo, useState } from "react";

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

import { runAction } from "@/lib/api/run-action";
import { Label } from "@saroh/ui/label";
import { Notice } from "@saroh/ui/notice";
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
    const addId = useId();
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
                <Notice tone="error">
                    <strong>{shortTitle(stock.total.short)}</strong>{" "}
                    {canStock
                        ? "Add stock below, or tell the customers their order will be late."
                        : "Someone who counts stock can add it, or tell the customers their order will be late."}
                </Notice>
            ) : null}
            {showShelves(stock) ? (
                <>
                    {canStock && where.length > 1 ? (
                        <div className="flex items-center gap-2">
                            <Label
                                htmlFor={`${addId}-add-at`}
                                className="text-[12px] font-normal text-muted-foreground"
                            >
                                Add at
                            </Label>
                            <OptionSelect
                                id={`${addId}-add-at`}
                                size="sm"
                                value={addAt ?? ""}
                                onValueChange={setAddAt}
                                options={where.map((p) => ({
                                    value: p.storeId,
                                    label: p.storeName,
                                }))}
                                className="w-auto min-w-[140px]"
                            />
                        </div>
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
        const res = await runAction(
            () =>
                addQuickStock({
                    storeId,
                    productId,
                    variantId: shelf.variantId,
                    units,
                    idempotencyKey: key,
                }),
            { setBusy: setSaving },
        );
        if (!res) return;
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
                    <Input
                        dense
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
                        className="w-[52px] text-right"
                    />
                    <Button
                        size="sm"
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
