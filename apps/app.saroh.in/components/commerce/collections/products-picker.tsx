"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { ArrowDown, ArrowUp, Check, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ProductThumb } from "@/components/stores/catalogue/product-thumb";
import type { PickableProduct } from "@/lib/collections/actions";
import { findProducts } from "@/lib/collections/actions";
import { capacity, movePicked, togglePicked } from "@/lib/collections/rules";

/**
 * A hand-picked collection's products (#524): the ones picked, in the
 * order the website lists them, each with up, down and remove; and a
 * search of the whole catalogue to pick more. The 500 cap is said as the
 * list fills and stops a pick past it — the API refuses one too.
 */
export function ProductsPicker({
    picked,
    known,
    onChange,
    onKnow,
    hiddenCount,
    disabled,
    error,
}: {
    picked: string[];
    /** What the sheet knows about each picked product. */
    known: Map<string, PickableProduct>;
    onChange: (next: string[]) => void;
    /** Remember a product found by the search, to draw it once picked. */
    onKnow: (p: PickableProduct) => void;
    /** Picked products set to Not sold, kept but not shown. */
    hiddenCount: number;
    disabled: boolean;
    error?: string;
}) {
    const [q, setQ] = useState("");
    const [found, setFound] = useState<{
        items: PickableProduct[];
        more: boolean;
    } | null>(null);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [searching, setSearching] = useState(false);
    const asked = useRef(0);
    const room = capacity(picked.length);

    // Search as they type, a beat after they stop; the last answer wins.
    useEffect(() => {
        if (disabled) return;
        const ticket = ++asked.current;
        const timer = setTimeout(() => {
            setSearching(true);
            void findProducts(q).then((res) => {
                if (ticket !== asked.current) return;
                setSearching(false);
                if (!res.ok) {
                    setSearchError(res.error);
                    return;
                }
                setSearchError(null);
                setFound(res.data);
            });
        }, 250);
        return () => clearTimeout(timer);
    }, [q, disabled]);

    return (
        <div className="space-y-3">
            <div className="flex items-baseline gap-2">
                <span
                    id="collection-products-label"
                    className="flex-1 text-[12.5px] font-medium"
                >
                    Products
                </span>
                <span
                    className={cn(
                        "text-[11.5px] tabular-nums",
                        room.full
                            ? "text-warning-subtle-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    {room.words}
                </span>
            </div>

            {picked.length === 0 ? (
                <p className="rounded-[9px] border border-dashed border-border-strong px-3 py-3 text-[12.5px] text-muted-foreground">
                    Nothing picked yet. Search below and tick the products it
                    should hold.
                </p>
            ) : (
                <ol
                    aria-labelledby="collection-products-label"
                    className="divide-y divide-border rounded-[9px] border border-border"
                >
                    {picked.map((id, i) => {
                        const p = known.get(id);
                        const name = p?.name ?? "A product";
                        return (
                            <li
                                key={id}
                                className="flex min-w-0 items-center gap-2.5 px-2.5 py-2"
                            >
                                <span className="w-5 shrink-0 text-right text-[11.5px] tabular-nums text-muted-foreground">
                                    {i + 1}
                                </span>
                                <ProductThumb
                                    name={name}
                                    image={p?.image ?? null}
                                />
                                <span className="min-w-0 flex-1 truncate text-[13px]">
                                    {name}
                                    {p?.status === "DRAFT" ? (
                                        <span className="text-muted-foreground">
                                            {" "}
                                            · draft
                                        </span>
                                    ) : null}
                                </span>
                                <RowButton
                                    label={`Move ${name} up`}
                                    disabled={disabled || i === 0}
                                    onClick={() =>
                                        onChange(movePicked(picked, id, -1))
                                    }
                                >
                                    <ArrowUp />
                                </RowButton>
                                <RowButton
                                    label={`Move ${name} down`}
                                    disabled={
                                        disabled || i === picked.length - 1
                                    }
                                    onClick={() =>
                                        onChange(movePicked(picked, id, 1))
                                    }
                                >
                                    <ArrowDown />
                                </RowButton>
                                <RowButton
                                    label={`Remove ${name}`}
                                    disabled={disabled}
                                    onClick={() =>
                                        onChange(togglePicked(picked, id))
                                    }
                                >
                                    <X />
                                </RowButton>
                            </li>
                        );
                    })}
                </ol>
            )}
            {hiddenCount > 0 ? (
                <p className="text-[11.5px] leading-[1.5] text-muted-foreground">
                    It also keeps {hiddenCount} archived{" "}
                    {hiddenCount === 1 ? "product" : "products"}. They
                    aren&apos;t shown, and come back here when sold again.
                </p>
            ) : null}
            {error ? (
                <p role="alert" className="text-[12px] text-destructive">
                    {error}
                </p>
            ) : null}

            {disabled ? null : (
                <div className="space-y-2 pt-1">
                    <label
                        htmlFor="collection-product-search"
                        className="block text-[12.5px] font-medium"
                    >
                        Add products
                    </label>
                    <div className="relative">
                        <Search
                            aria-hidden
                            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                        />
                        <Input
                            id="collection-product-search"
                            type="search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search names and SKUs"
                            className="pl-8"
                            autoComplete="off"
                        />
                    </div>
                    <div aria-live="polite" aria-busy={searching}>
                        {searchError ? (
                            <p
                                role="alert"
                                className="text-[12px] text-destructive"
                            >
                                {searchError}
                            </p>
                        ) : found === null ? (
                            <p className="text-[12px] text-muted-foreground">
                                Looking…
                            </p>
                        ) : found.items.length === 0 ? (
                            <p className="text-[12px] text-muted-foreground">
                                {q.trim()
                                    ? `No products match “${q.trim()}”.`
                                    : "No products yet."}
                            </p>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                {found.items.map((p) => {
                                    const on = picked.includes(p.id);
                                    const off = !on && room.full;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            role="checkbox"
                                            aria-checked={on}
                                            disabled={off}
                                            onClick={() => {
                                                onKnow(p);
                                                onChange(
                                                    togglePicked(picked, p.id),
                                                );
                                            }}
                                            className={cn(
                                                "flex w-full min-w-0 items-center gap-2.5 rounded-[9px] border border-border bg-card px-2.5 py-2 text-left text-[13px] coarse:min-h-11",
                                                off
                                                    ? "cursor-not-allowed bg-disabled text-muted-foreground"
                                                    : "hover:bg-muted",
                                            )}
                                        >
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    "flex size-4 shrink-0 items-center justify-center rounded-[4px]",
                                                    on
                                                        ? "bg-foreground text-background"
                                                        : "border-[1.5px] border-border-strong bg-card",
                                                )}
                                            >
                                                {on ? (
                                                    <Check
                                                        className="size-3"
                                                        strokeWidth={3}
                                                    />
                                                ) : null}
                                            </span>
                                            <ProductThumb
                                                name={p.name}
                                                image={p.image}
                                            />
                                            <span className="min-w-0 flex-1 truncate">
                                                {p.name}
                                            </span>
                                            {p.status !== "PUBLISHED" ? (
                                                <span className="shrink-0 text-[11.5px] text-muted-foreground">
                                                    {p.status === "DRAFT"
                                                        ? "Draft"
                                                        : "Archived"}
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                                {found.more ? (
                                    <p className="text-[11.5px] text-muted-foreground">
                                        Showing the first 20 — type more of a
                                        name to narrow it.
                                    </p>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function RowButton({
    label,
    disabled,
    onClick,
    children,
}: {
    label: string;
    disabled: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className="h-7 w-7 shrink-0 rounded-[7px] disabled:bg-transparent [&_svg]:size-3.5"
        >
            {children}
        </Button>
    );
}
