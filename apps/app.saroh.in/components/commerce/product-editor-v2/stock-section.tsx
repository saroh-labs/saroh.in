"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { setInventory, setVariantStock } from "@/lib/products/actions";
import { isCount } from "@/lib/products/editor-sections";
import type { ProductDetail } from "@/lib/products/service";

import { useEditor, useSection } from "./editor-state";
import { boxClass, FieldHelp } from "./fields";
import { SectionCard } from "./section-card";

interface Line {
    variantId: string;
    title: string;
    quantity: string;
    lowStockAlert: string;
    promised: number;
}

interface StockDraft {
    quantity: string;
    lowStockAlert: string;
    lines: Line[];
}

const DEFAULT_WARN = "10";

function draftFrom(p: ProductDetail): StockDraft {
    const own = p.inventory;
    const perVariant = p.stockMode === "variant";
    return {
        quantity: String(own?.quantity ?? 0),
        lowStockAlert: String(own?.lowStockAlert ?? DEFAULT_WARN),
        lines: [...p.variants]
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((v, i) => ({
                variantId: v.id,
                title: v.title || v.sku,
                // Moving to a count per variant starts the first on the
                // product's whole count, so nothing on the shelf vanishes.
                quantity: String(
                    perVariant
                        ? (v.inventory?.quantity ?? 0)
                        : i === 0
                          ? (own?.quantity ?? 0)
                          : 0,
                ),
                lowStockAlert: String(
                    v.inventory?.lowStockAlert ??
                        own?.lowStockAlert ??
                        DEFAULT_WARN,
                ),
                promised: v.inventory?.reserved ?? 0,
            })),
    };
}

const same = (a: StockDraft, b: StockDraft) =>
    JSON.stringify(a) === JSON.stringify(b);

/**
 * Stock: how many there are and when to warn. Once a product has variants,
 * each keeps its own count — a small bottle runs out before a large one —
 * and the product's total is the sum. Promised stock is what open orders
 * hold; Orders sets it, so it is shown and never typed.
 */
export function StockSection({
    product,
    storeId,
}: {
    product: ProductDetail;
    storeId: string;
}) {
    const { canWrite } = useEditor();
    const ro = !canWrite;
    const fromProduct = draftFrom(product);
    const loadedKey = JSON.stringify(fromProduct);
    const [base, setBase] = useState(fromProduct);
    const [draft, setDraft] = useState(fromProduct);
    const [seen, setSeen] = useState(loadedKey);
    const [adding, setAdding] = useState(false);
    if (seen !== loadedKey) {
        setSeen(loadedKey);
        setBase(fromProduct);
        setDraft(fromProduct);
    }

    const perVariant = product.variants.length > 0;
    const counted = perVariant
        ? product.stockMode === "variant"
        : product.inventory !== null;
    const collapsed = !counted && !adding;
    const dirty = !same(draft, base) || (adding && !counted);

    const qtyBad = !isCount(draft.quantity) || !isCount(draft.lowStockAlert);
    const reserved = product.inventory?.reserved ?? 0;
    const belowPromised = perVariant
        ? draft.lines.find(
              (l) => isCount(l.quantity) && Number(l.quantity) < l.promised,
          )
        : isCount(draft.quantity) && Number(draft.quantity) < reserved
          ? { title: "", promised: reserved }
          : undefined;
    const lineBad = draft.lines.some(
        (l) => !isCount(l.quantity) || !isCount(l.lowStockAlert),
    );
    const problem = (perVariant ? lineBad : qtyBad)
        ? "Whole numbers, zero or more."
        : belowPromised
          ? `${belowPromised.promised} promised to open orders${
                belowPromised.title ? ` for ${belowPromised.title}` : ""
            } — on hand can't go below that.`
          : "";

    useSection(
        "stock",
        { dirty, problem },
        {
            save: async () => {
                const res = perVariant
                    ? await setVariantStock(
                          storeId,
                          product.id,
                          draft.lines.map((l) => ({
                              variantId: l.variantId,
                              quantity: Number(l.quantity),
                              lowStockAlert: Number(l.lowStockAlert),
                          })),
                      )
                    : await setInventory(storeId, product.id, {
                          quantity: Number(draft.quantity),
                          lowStockAlert: Number(draft.lowStockAlert),
                      });
                if (!res.ok) {
                    showError(res.error);
                    return false;
                }
                setBase(draft);
                setAdding(false);
                return true;
            },
            discard: () => {
                setDraft(base);
                setAdding(false);
            },
        },
    );

    const setLine = (id: string, patch: Partial<Line>) =>
        setDraft({
            ...draft,
            lines: draft.lines.map((l) =>
                l.variantId === id ? { ...l, ...patch } : l,
            ),
        });

    if (collapsed) {
        return (
            <SectionCard k="stock" title="Stock">
                <p className="mb-3 text-pretty text-[12.5px] leading-[1.55] text-foreground/75">
                    {perVariant
                        ? `No stock count yet. Each of the ${product.variants.length} variants gets its own, so a small one can run out before a large one.`
                        : "No stock count yet. Add one to see how many you have and get a warning when it runs low."}
                </p>
                <button
                    type="button"
                    disabled={ro}
                    onClick={() => setAdding(true)}
                    className="inline-flex h-[34px] items-center gap-[7px] rounded-[9px] border border-border bg-card px-[13px] text-[12.5px] font-semibold hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60 coarse:h-11"
                >
                    <Plus aria-hidden className="size-3.5" strokeWidth={2.2} />
                    Add stock
                </button>
            </SectionCard>
        );
    }

    if (!perVariant) {
        const qty = Number(draft.quantity);
        const low = Number(draft.lowStockAlert);
        const lowNow = !qtyBad && qty <= low;
        return (
            <SectionCard k="stock" title="Stock">
                <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-[92px] flex-[0_1_112px]">
                        <label
                            htmlFor="pe-qty"
                            className="mb-[5px] block text-[12px] font-medium"
                        >
                            On hand
                        </label>
                        <input
                            id="pe-qty"
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={draft.quantity}
                            disabled={ro}
                            onChange={(e) =>
                                setDraft({ ...draft, quantity: e.target.value })
                            }
                            className={boxClass({
                                small: true,
                                bad:
                                    !isCount(draft.quantity) || !!belowPromised,
                            })}
                        />
                    </div>
                    <div className="min-w-[92px] flex-[0_1_112px]">
                        <label
                            htmlFor="pe-low"
                            className="mb-[5px] block text-[12px] font-medium"
                        >
                            Warn at
                        </label>
                        <input
                            id="pe-low"
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={draft.lowStockAlert}
                            disabled={ro}
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    lowStockAlert: e.target.value,
                                })
                            }
                            aria-label="Warn when on hand reaches"
                            className={boxClass({
                                small: true,
                                bad: !isCount(draft.lowStockAlert),
                            })}
                        />
                    </div>
                    <div className="min-w-0 flex-[1_1_96px]">
                        <p className="mb-[5px] text-[12px] font-medium">
                            Promised to orders
                        </p>
                        <p className="flex h-8 items-center font-display text-[15px] font-semibold tabular-nums">
                            {reserved}
                        </p>
                    </div>
                </div>
                <FieldHelp
                    className="mt-[9px]"
                    tone={problem ? "bad" : "quiet"}
                >
                    {problem ||
                        "Promised to orders is set by Orders, so it cannot be changed here."}
                </FieldHelp>
                {lowNow ? (
                    <LowNote>
                        {qty === 0
                            ? product.status === "PUBLISHED"
                                ? "Nothing on hand. The product stays published and cannot be bought."
                                : "Nothing on hand yet. Set a quantity before you publish it."
                            : `On hand has reached the alert level — ${qty} left, alerting at ${low}.`}
                    </LowNote>
                ) : null}
            </SectionCard>
        );
    }

    const lowLines = draft.lines.filter(
        (l) =>
            isCount(l.quantity) &&
            isCount(l.lowStockAlert) &&
            Number(l.lowStockAlert) > 0 &&
            Number(l.quantity) <= Number(l.lowStockAlert),
    );
    const total = draft.lines.reduce(
        (n, l) => n + (isCount(l.quantity) ? Number(l.quantity) : 0),
        0,
    );
    const promised = draft.lines.reduce((n, l) => n + l.promised, 0);
    const grid =
        "grid grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-1.5";

    return (
        <SectionCard k="stock" title="Stock">
            <div
                className={cn(
                    grid,
                    "pb-[5px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80",
                )}
            >
                <span>Variant</span>
                <span>On hand</span>
                <span>Warn at</span>
                <span className="text-right">Promised</span>
            </div>
            <div className="flex flex-col gap-1.5">
                {draft.lines.map((l) => {
                    const low = lowLines.includes(l);
                    return (
                        <div
                            key={l.variantId}
                            className={cn(grid, "items-center")}
                        >
                            <span className="flex min-w-0 items-center gap-1.5">
                                {low ? (
                                    <span
                                        aria-hidden
                                        className="size-[7px] shrink-0 rounded-full bg-highlight"
                                    />
                                ) : null}
                                <span className="truncate text-[12.5px] font-medium">
                                    {l.title}
                                </span>
                            </span>
                            <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={l.quantity}
                                disabled={ro}
                                aria-label={`${l.title} on hand`}
                                onChange={(e) =>
                                    setLine(l.variantId, {
                                        quantity: e.target.value,
                                    })
                                }
                                className={boxClass({
                                    small: true,
                                    bad:
                                        !isCount(l.quantity) ||
                                        Number(l.quantity) < l.promised,
                                })}
                            />
                            <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={l.lowStockAlert}
                                disabled={ro}
                                aria-label={`${l.title} warn when on hand reaches`}
                                onChange={(e) =>
                                    setLine(l.variantId, {
                                        lowStockAlert: e.target.value,
                                    })
                                }
                                className={boxClass({
                                    small: true,
                                    bad: !isCount(l.lowStockAlert),
                                })}
                            />
                            <span className="text-right font-display text-[14px] font-semibold tabular-nums">
                                {l.promised}
                            </span>
                        </div>
                    );
                })}
                <div
                    className={cn(
                        grid,
                        "mt-0.5 items-center border-t border-border/70 pt-2",
                    )}
                >
                    <span className="text-[12.5px] text-foreground/75">
                        Whole product
                    </span>
                    <span className="pl-2.5 font-display text-[14px] font-semibold tabular-nums">
                        {total}
                    </span>
                    <span />
                    <span className="text-right font-display text-[14px] font-semibold tabular-nums">
                        {promised}
                    </span>
                </div>
            </div>
            <FieldHelp className="mt-[9px]" tone={problem ? "bad" : "quiet"}>
                {problem ||
                    (product.stockMode === "variant" || !product.inventory
                        ? "Each variant counts on its own; the product's total is the sum. Promised to orders is set by Orders."
                        : "Saving counts each variant on its own. The first starts on the product's whole count, so nothing on the shelf vanishes.")}
            </FieldHelp>
            {lowLines.length > 0 && !problem ? (
                <LowNote>
                    {lowLines
                        .map((l) => `${l.title} has ${l.quantity} left`)
                        .join(", ")}{" "}
                    — at or under {lowLines.length === 1 ? "its" : "their"}{" "}
                    warning level.
                </LowNote>
            ) : null}
        </SectionCard>
    );
}

function LowNote({ children }: { children: React.ReactNode }) {
    return (
        <div
            role="status"
            className="mt-2.5 flex items-start gap-[9px] rounded-[9px] bg-brand-subtle px-3 py-2.5"
        >
            <TriangleAlert
                aria-hidden
                className="mt-px size-[15px] shrink-0 text-brand"
                strokeWidth={1.9}
            />
            <span className="text-pretty text-[12px] leading-[1.5] text-brand-subtle-foreground">
                {children}
            </span>
        </div>
    );
}
