"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { OptionSelect } from "@saroh/ui/option-select";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useId, useMemo, useRef, useState } from "react";

import type { CatalogueRow } from "@/lib/products/catalogue";
import { stockWords } from "@/lib/products/catalogue";
import { addQuickStock } from "@/lib/products/list-actions";
import type { NeedDetail } from "@/lib/products/needs-you";
import { optionWord } from "@/lib/products/needs-you";
import type { QuickShelf } from "@/lib/products/quick-look";
import {
    foldShelves,
    orderShelves,
    quickStock,
    readAdd,
    shelfLine,
    shelfTone,
    shortTitle,
    showShelves,
    stockHeadline,
    storefrontsLine,
} from "@/lib/products/quick-look";
import { addedWords } from "@/lib/stock/levels";

import { runAction } from "@/lib/api/run-action";
import { Label } from "@saroh/ui/label";
import { Notice } from "@saroh/ui/notice";
import { TONE_TEXT } from "./tones";

/**
 * Stock: the headline, the short alert, and each variant with "Qty · Add"
 * for someone who can count stock. Shelves that need someone come first
 * (short, out, low), so the one shade that's out isn't the 26th row; past
 * six healthy ones the rest wait behind "Show all 28 shades". Someone who
 * counts stock always gets an Add row, even for one shelf: Restock lands
 * here. Untracked says so, never 0.
 */
export function StockBlock({
    row,
    storeId,
    canStock,
    need,
    onChanged,
}: {
    row: CatalogueRow;
    storeId: string | null;
    canStock: boolean;
    /** What Needs you says about it, if anything. */
    need: NeedDetail | null;
    onChanged: () => void;
}) {
    const addId = useId();
    const stock = useMemo(() => quickStock(row, storeId), [row, storeId]);
    const ordered = useMemo(() => orderShelves(stock.shelves), [stock]);
    const [all, setAll] = useState(false);
    const { shown, hidden } = foldShelves(ordered, all);
    const where = row.places.filter((p) =>
        stock.shelves.some((s) => s.storeIds.includes(p.storeId)),
    );
    // Add starts where Needs you says it is needed, else the first place.
    const needed = where.find((p) => need?.places?.includes(p.storeName));
    const [addAt, setAddAt] = useState<string | null>(
        (needed ?? where.at(0))?.storeId ?? null,
    );
    const across = storeId ? null : storefrontsLine(row);
    const words = stockWords(row, need);
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
                <dd
                    className={cn(
                        "text-[13px]",
                        TONE_TEXT[need ? words.tone : lineTone],
                    )}
                >
                    {stock.tracked
                        ? stockHeadline(stock.total, need)
                        : words.tone === "danger"
                          ? "Sold out · marked by hand"
                          : "Not tracked · always available"}
                </dd>
            </div>
            {across ? (
                <p
                    className={cn(
                        "pl-[98px] text-[12px]",
                        // Sold out somewhere: said in the warning tone, not
                        // grey, so it isn't read past.
                        across.startsWith("Sold out")
                            ? "text-warning-subtle-foreground"
                            : "text-muted-foreground",
                    )}
                >
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
            {showShelves(stock, canStock) ? (
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
                    {shown.map((s) => (
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
                    {hidden > 0 ? (
                        <Button
                            type="button"
                            variant="link"
                            size="inline"
                            className="self-start text-[12.5px]"
                            onClick={() => setAll(true)}
                        >
                            Show all {ordered.length}
                            {need?.option
                                ? ` ${optionWord(need.option, ordered.length)}`
                                : ""}
                        </Button>
                    ) : null}
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
    const input = useRef<HTMLInputElement>(null);
    const units = readAdd(draft);
    // Off only where Add can't add (this location doesn't sell it) or
    // while saving — never for "not typed yet": muted until a number, and
    // pressed early it puts the keyboard in the box.
    const off = storeId === null || saving;

    async function add() {
        if (units === null) {
            input.current?.focus();
            return;
        }
        if (storeId === null || saving) return;
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
                        ref={input}
                        data-add-input=""
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
                        placeholder="Qty"
                        className="w-[52px] text-right"
                    />
                    <Button
                        size="sm"
                        variant={units === null ? "outline" : "default"}
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
