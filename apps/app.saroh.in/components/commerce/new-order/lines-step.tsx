"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useState } from "react";

import { Chip } from "@/components/shared/chip";
import type { CartLine, NewOrderSellable } from "@/lib/orders/new-order";
import { findSellables, itemCount, roomFor } from "@/lib/orders/new-order";
import type { NewOrderProduct } from "@/lib/orders/new-order-service";

import { FIELD, SMALL_BUTTON } from "./parts";

/**
 * New order's Items (B13): the lines, each with − and +, its total and,
 * for a customer with an allergy, the clash in red ("Contains peanuts") —
 * a warning, never a block. Below, the storefront's products: five to
 * start, eight once something is typed, each variant a chip saying how
 * many are left here.
 */
export function LinesStep({
    products,
    lines,
    byKey,
    clashes,
    storeName,
    format,
    onBump,
}: {
    products: NewOrderProduct[];
    lines: CartLine[];
    byKey: ReadonlyMap<string, NewOrderSellable>;
    /** A line's allergy clash, by its key; absent for none. */
    clashes: Readonly<Record<string, string>>;
    storeName: string;
    format: (cents: number) => string;
    onBump: (key: string, by: 1 | -1) => void;
}) {
    const [query, setQuery] = useState("");
    const shown = findSellables(products, query);
    const inCart = (key: string) =>
        lines.find((l) => l.key === key)?.quantity ?? 0;

    return (
        <section
            aria-label="Items"
            className="overflow-hidden rounded-xl border border-border bg-card"
        >
            <div className="flex items-baseline px-3.5 pb-2 pt-[13px]">
                <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Items
                </h3>
                <span className="text-[12px] text-muted-foreground">
                    {itemCount(lines)}
                </span>
            </div>
            <ul aria-label="In this order">
                {lines.map((line) => {
                    const s = byKey.get(line.key);
                    if (!s) return null;
                    const title = s.variantTitle
                        ? `${s.name}, ${s.variantTitle}`
                        : s.name;
                    const clash = clashes[line.key];
                    const room = roomFor(s, line.quantity);
                    return (
                        <li
                            key={line.key}
                            className="flex items-center gap-2 border-t border-border px-3.5 py-2"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-[13.5px] font-semibold">
                                    {title}
                                </div>
                                {clash ? (
                                    <div
                                        role="note"
                                        className="text-[11.5px] font-bold text-destructive-subtle-foreground"
                                    >
                                        {clash}
                                    </div>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                onClick={() => onBump(line.key, -1)}
                                aria-label={`One fewer ${title}`}
                                className={cn(
                                    SMALL_BUTTON,
                                    "size-8 text-[15px] font-normal coarse:size-11",
                                )}
                            >
                                −
                            </button>
                            <span
                                aria-label={`${line.quantity} of ${title}`}
                                className="min-w-[22px] text-center font-semibold tabular-nums"
                            >
                                {line.quantity}
                            </span>
                            <button
                                type="button"
                                onClick={() => onBump(line.key, 1)}
                                disabled={room === 0}
                                title={
                                    room === 0
                                        ? `None left at ${storeName}`
                                        : undefined
                                }
                                aria-label={`One more ${title}`}
                                className={cn(
                                    SMALL_BUTTON,
                                    "size-8 text-[15px] font-normal coarse:size-11",
                                )}
                            >
                                +
                            </button>
                            <span className="min-w-[70px] text-right font-semibold tabular-nums">
                                {format(s.priceCents * line.quantity)}
                            </span>
                        </li>
                    );
                })}
            </ul>
            <div className="border-t border-border bg-muted px-3.5 pb-[13px] pt-2.5">
                <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Add a product"
                    placeholder="Add a product — type to find it"
                    autoComplete="off"
                    className={FIELD}
                />
                <div className="mt-2 flex flex-col gap-1.5">
                    {shown.length === 0 ? (
                        <p className="text-[12.5px] text-muted-foreground">
                            {products.length === 0
                                ? `Nothing is sold at ${storeName} yet.`
                                : `Nothing called “${query.trim()}” here.`}
                        </p>
                    ) : null}
                    {shown.map((p) => (
                        <div
                            key={p.id}
                            className="flex flex-wrap items-center gap-2"
                        >
                            <span className="min-w-0 flex-[1_1_150px] text-[13px] font-medium">
                                {p.name}
                            </span>
                            <div
                                role="group"
                                aria-label={`Add ${p.name}`}
                                className="flex flex-wrap gap-[5px]"
                            >
                                {p.sellables.map((s) => {
                                    const room = roomFor(s, inCart(s.key));
                                    const out = room === 0;
                                    return (
                                        <Chip
                                            key={s.key}
                                            role="button"
                                            aria-checked={undefined}
                                            on={false}
                                            disabled={out}
                                            onClick={() => onBump(s.key, 1)}
                                            title={
                                                out
                                                    ? `None left at ${storeName}`
                                                    : room === null
                                                      ? undefined
                                                      : `${room} left at ${storeName}`
                                            }
                                            className="h-[30px] cursor-pointer active:scale-[0.97] disabled:cursor-not-allowed coarse:h-11"
                                        >
                                            {`${s.variantTitle ?? "Add"} · ${format(s.priceCents)}`}
                                        </Chip>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
