"use client";

import { cn } from "@saroh/ui/lib/utils";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import type { StockDraft, StockLine } from "@/lib/products/editor-sections";
import { isCount } from "@/lib/products/editor-sections";

import { boxClass, FieldHelp } from "./fields";

/**
 * The Stock section's two ways of counting, after the Editor design: one
 * count for the product, or a row per variant with the product's total
 * under them. Promised is what open orders hold; Orders sets it, so it is
 * shown and never typed.
 */

/** One count: on hand, warn at, and what is promised. */
export function WholeStock({
    draft,
    promised,
    ro,
    qtyBad,
    note,
    noteBad,
    onChange,
}: {
    draft: StockDraft;
    promised: number;
    ro: boolean;
    /** On hand is below what open orders promise. */
    qtyBad: boolean;
    note: ReactNode;
    noteBad: boolean;
    onChange: (patch: Partial<StockDraft>) => void;
}) {
    return (
        <>
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
                        aria-label="Quantity on hand"
                        onChange={(e) => onChange({ quantity: e.target.value })}
                        className={boxClass({
                            small: true,
                            bad: !isCount(draft.quantity) || qtyBad,
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
                            onChange({ lowStockAlert: e.target.value })
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
                        {promised}
                    </p>
                </div>
            </div>
            <FieldHelp className="mt-[9px]" tone={noteBad ? "bad" : "quiet"}>
                {note}
            </FieldHelp>
        </>
    );
}

const GRID =
    "grid grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-1.5";

/** The variants the Stock section counts at or under their warning level. */
export function lowLines(lines: readonly StockLine[]): StockLine[] {
    return lines.filter(
        (l) =>
            isCount(l.quantity) &&
            isCount(l.lowStockAlert) &&
            Number(l.lowStockAlert) > 0 &&
            Number(l.quantity) <= Number(l.lowStockAlert),
    );
}

/** A row per variant, then the product's total. */
export function VariantStockTable({
    lines,
    ro,
    onLine,
}: {
    lines: StockLine[];
    ro: boolean;
    onLine: (variantId: string, patch: Partial<StockLine>) => void;
}) {
    const low = lowLines(lines);
    const total = lines.reduce(
        (n, l) => n + (isCount(l.quantity) ? Number(l.quantity) : 0),
        0,
    );
    const promised = lines.reduce((n, l) => n + l.promised, 0);
    return (
        <>
            <div
                className={cn(
                    GRID,
                    "pb-[5px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80",
                )}
            >
                <span>Variant</span>
                <span>On hand</span>
                <span>Warn at</span>
                <span className="text-right">Promised</span>
            </div>
            <div className="flex flex-col gap-1.5">
                {lines.map((l) => (
                    <div key={l.variantId} className={cn(GRID, "items-center")}>
                        <span className="flex min-w-0 items-center gap-1.5">
                            {low.includes(l) ? (
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
                                onLine(l.variantId, {
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
                                onLine(l.variantId, {
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
                ))}
                <div
                    className={cn(
                        GRID,
                        "mt-0.5 items-center border-t border-border/70 pt-2",
                    )}
                >
                    <span className="text-[12px] text-muted-foreground">
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
        </>
    );
}

/** At or under the warning level: said by name, in the warning's colours. */
export function LowNote({ children }: { children: ReactNode }) {
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
