"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";
import { useState } from "react";

import type { StockDraft, StockLine } from "@/lib/products/editor-sections";
import { isCount, optionPlural } from "@/lib/products/editor-sections";
import type { PlaceShelf } from "@/lib/products/editor-stock";
import { allLocations } from "@/lib/products/editor-stock";

import {
    FIND_FROM,
    FindRow,
    matchesFind,
} from "@/components/commerce/product-variants/find-row";
import { Field } from "@saroh/ui/field";
import { Notice } from "@saroh/ui/notice";
import { FieldHelp } from "./fields";

/**
 * The Stock section's two ways of counting, after the Editor design: one
 * count for the product, or a row per variant with the product's total
 * under them. Promised is what open orders hold; Orders sets it, so it is
 * shown and never typed.
 *
 * Counts are text boxes with the number keyboard, not number inputs: a
 * number input with no maximum reads to a screen reader as a spinbutton
 * with a maximum of 0 (WCAG 4.1.2, products audit 16 Oct 2026).
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
                <Field
                    label="On hand"
                    className="min-w-[92px] flex-[0_1_112px]"
                >
                    <Input
                        dense
                        aria-invalid={!isCount(draft.quantity) || qtyBad}
                        id="pe-qty"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={draft.quantity}
                        disabled={ro}
                        aria-label="Quantity on hand"
                        onChange={(e) => onChange({ quantity: e.target.value })}
                    />
                </Field>
                <Field
                    label="Low stock at"
                    className="min-w-[92px] flex-[0_1_112px]"
                >
                    <Input
                        dense
                        aria-invalid={!isCount(draft.lowStockAlert)}
                        id="pe-low"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={draft.lowStockAlert}
                        disabled={ro}
                        onChange={(e) =>
                            onChange({ lowStockAlert: e.target.value })
                        }
                        aria-label="Warn when on hand reaches"
                    />
                </Field>
                <div className="min-w-0 flex-[1_1_96px]">
                    <p
                        data-ph-unmask=""
                        className="mb-1.5 text-[0.78125rem] font-medium leading-none"
                    >
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

/**
 * A product counted as a whole at several locations (HPEditDesk): a row
 * per location with its On hand and Low at, what its open orders hold, and
 * "All locations" under them — the same total the product page says. The
 * location this editor was opened at comes first.
 */
export function PlacesStock({
    shelves,
    ro,
    badStoreId,
    onShelf,
}: {
    shelves: readonly PlaceShelf[];
    ro: boolean;
    /** The shelf whose count is below what its orders hold. */
    badStoreId: string | null;
    onShelf: (storeId: string, patch: Partial<PlaceShelf>) => void;
}) {
    const all = allLocations(shelves);
    return (
        <div
            role="table"
            aria-label="Stock by location"
            className="text-[13.5px]"
        >
            <div
                role="row"
                data-ph-unmask=""
                className={cn(GRID, "label pb-1.5 text-muted-foreground")}
            >
                <span role="columnheader">Location</span>
                <span role="columnheader">On hand</span>
                <span role="columnheader">Low at</span>
                <span role="columnheader" className="text-right">
                    Promised
                </span>
            </div>
            {shelves.map((s) => (
                <div
                    role="row"
                    key={s.storeId}
                    className={cn(GRID, "items-center py-1")}
                >
                    <span role="cell" className="min-w-0 truncate">
                        {s.name}
                    </span>
                    <span role="cell">
                        <Input
                            dense
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={s.quantity}
                            disabled={ro}
                            aria-invalid={
                                !isCount(s.quantity) || badStoreId === s.storeId
                            }
                            aria-label={`On hand at ${s.name}`}
                            onChange={(e) =>
                                onShelf(s.storeId, { quantity: e.target.value })
                            }
                        />
                    </span>
                    <span role="cell">
                        <Input
                            dense
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={s.lowStockAlert}
                            disabled={ro}
                            aria-invalid={!isCount(s.lowStockAlert)}
                            aria-label={`Warn at ${s.name} when on hand reaches`}
                            onChange={(e) =>
                                onShelf(s.storeId, {
                                    lowStockAlert: e.target.value,
                                })
                            }
                        />
                    </span>
                    <span role="cell" className="text-right tabular-nums">
                        {s.promised}
                    </span>
                </div>
            ))}
            <div
                role="row"
                className={cn(
                    GRID,
                    "mt-1 border-t border-border pt-2 font-semibold",
                )}
            >
                <span role="cell" data-ph-unmask="">
                    All locations
                </span>
                <span role="cell" className="tabular-nums">
                    {all.onHand}
                </span>
                <span role="cell" />
                <span role="cell" className="text-right tabular-nums">
                    {all.promised}
                </span>
            </div>
        </div>
    );
}

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
    opt = "variant",
}: {
    lines: StockLine[];
    ro: boolean;
    onLine: (variantId: string, patch: Partial<StockLine>) => void;
    /** The option's name, lower case ("shade"); "variant" with none. */
    opt?: string;
}) {
    const [find, setFind] = useState("");
    // Past a dozen, a box finds one; a row with something to fix stays.
    const shown = lines.filter(
        (l) =>
            lines.length <= FIND_FROM ||
            matchesFind(find, l.title) ||
            !isCount(l.quantity) ||
            !isCount(l.lowStockAlert) ||
            Number(l.quantity) < l.promised,
    );
    const low = lowLines(lines);
    const total = lines.reduce(
        (n, l) => n + (isCount(l.quantity) ? Number(l.quantity) : 0),
        0,
    );
    const promised = lines.reduce((n, l) => n + l.promised, 0);
    return (
        <>
            {lines.length > FIND_FROM ? (
                <FindRow
                    label={`Search ${optionPlural(opt)}`}
                    value={find}
                    onChange={setFind}
                    shown={shown.length}
                    total={lines.length}
                />
            ) : null}
            <div
                className={cn(GRID, "label pb-[5px] text-muted-foreground/80")}
            >
                <span className="capitalize">{opt}</span>
                <span data-ph-unmask="">On hand</span>
                <span data-ph-unmask="">Low stock at</span>
                <span data-ph-unmask="" className="text-right">
                    Promised
                </span>
            </div>
            <div className="flex flex-col gap-1.5">
                {shown.map((l) => (
                    <div key={l.variantId} className={cn(GRID, "items-center")}>
                        <span className="flex min-w-0 items-center gap-1.5">
                            {low.includes(l) ? (
                                <span
                                    aria-hidden
                                    className="size-[7px] shrink-0 rounded-full bg-foreground"
                                />
                            ) : null}
                            <span className="truncate text-[12.5px] font-medium">
                                {l.title}
                            </span>
                        </span>
                        <Input
                            dense
                            aria-invalid={
                                !isCount(l.quantity) ||
                                Number(l.quantity) < l.promised
                            }
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={l.quantity}
                            disabled={ro}
                            aria-label={`${l.title} on hand`}
                            onChange={(e) =>
                                onLine(l.variantId, {
                                    quantity: e.target.value,
                                })
                            }
                        />
                        <Input
                            dense
                            aria-invalid={!isCount(l.lowStockAlert)}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={l.lowStockAlert}
                            disabled={ro}
                            aria-label={`${l.title} warn when on hand reaches`}
                            onChange={(e) =>
                                onLine(l.variantId, {
                                    lowStockAlert: e.target.value,
                                })
                            }
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
                    <span
                        data-ph-unmask=""
                        className="text-[12px] text-muted-foreground"
                    >
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
        <Notice tone="warning" className="mt-2.5">
            {children}
        </Notice>
    );
}
