"use client";

import { Button } from "@saroh/ui/button";
import {
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { noMatchLine, TRY_AGAIN } from "@saroh/ui/lib/state-copy";
import { Plus } from "lucide-react";
import { useState } from "react";

import { HeaderOverlay } from "@/components/bookings/calendar/header/header-overlay";
import { formatMoneyMajor } from "@/lib/format/money";
import type { PickRow } from "@/lib/invoices/new-invoice-lines";
import { lineRateWords, pickRows } from "@/lib/invoices/new-invoice-lines";

import { useProductSearch } from "../new-invoice/use-product-search";

export const ADD_LINE_ID = "paper-add-line";

/**
 * "Add a line · type or pick a product" (INVNewEdit): under the paper's
 * lines. Typing searches the products ("focac" finds Focaccia, with its
 * price, GST and HSN) and offers what was typed as a new line ("You'll set
 * price and GST"), which then opens for its price. Without products to
 * pick, it is the new line alone.
 */
export function AddLine({
    currency,
    registered,
    canPickProducts,
    disabled,
    onProduct,
    onTyped,
}: {
    currency: string;
    registered: boolean;
    canPickProducts: boolean;
    disabled: boolean;
    onProduct: (row: PickRow) => void;
    /** What was typed, as a new line to finish. */
    onTyped: (description: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const search = useProductSearch(open && canPickProducts, q);
    const rows = search.found ? pickRows(search.found) : [];
    const typed = q.trim();
    const money = (price: string) => formatMoneyMajor(price, currency);

    function done() {
        setOpen(false);
        setQ("");
    }

    const trigger = (
        <button
            type="button"
            id={ADD_LINE_ID}
            disabled={disabled}
            className="flex min-h-9 w-full cursor-pointer items-center gap-1.5 rounded-[6px] border border-dashed border-border-strong px-2.5 text-left text-[12px] text-muted-foreground transition-colors duration-fast hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
        >
            <Plus aria-hidden className="size-3.5" />
            {canPickProducts
                ? "Add a line · type or pick a product"
                : "Add a line"}
        </button>
    );

    return (
        <HeaderOverlay
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setQ("");
            }}
            trigger={trigger}
            title="Add a line"
            width={380}
        >
            <Command
                shouldFilter={false}
                label="Add a line"
                className="rounded-[10px] border border-border"
            >
                <CommandInput
                    value={q}
                    onValueChange={setQ}
                    placeholder={
                        canPickProducts
                            ? "Type what it's for, or a product"
                            : "Type what it's for"
                    }
                />
                <CommandList aria-busy={search.searching}>
                    {canPickProducts && search.error ? (
                        <div role="alert" className="px-3 py-3 text-[12.5px]">
                            <p className="text-destructive-subtle-foreground">
                                {search.error}
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={search.retry}
                            >
                                {TRY_AGAIN}
                            </Button>
                        </div>
                    ) : null}
                    {canPickProducts && !search.error && rows.length > 0 ? (
                        <CommandGroup heading="Your products">
                            {rows.map((row) => {
                                const bits = [
                                    money(row.price),
                                    registered
                                        ? lineRateWords(row.gstRate)
                                        : null,
                                    registered && row.hsnCode
                                        ? `HSN ${row.hsnCode}`
                                        : null,
                                ].filter(Boolean);
                                return (
                                    <CommandItem
                                        key={row.key}
                                        value={row.key}
                                        onSelect={() => {
                                            onProduct(row);
                                            done();
                                        }}
                                        className="min-h-11"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate">
                                                {row.name}
                                            </span>
                                            <span className="block truncate text-[12px] text-muted-foreground">
                                                {bits.join(" · ")}
                                            </span>
                                        </span>
                                        <span
                                            aria-hidden
                                            className="text-[12px] font-semibold"
                                        >
                                            Add
                                        </span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    ) : null}
                    {canPickProducts &&
                    !search.error &&
                    search.found !== null &&
                    rows.length === 0 &&
                    typed ? (
                        <p className="px-3 py-2 text-[12.5px] text-muted-foreground">
                            {noMatchLine("products")}
                        </p>
                    ) : null}
                    {typed ? (
                        <CommandGroup>
                            <CommandItem
                                value="__typed__"
                                onSelect={() => {
                                    onTyped(typed);
                                    done();
                                }}
                                className="min-h-11"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate">
                                        &ldquo;{typed}&rdquo; as a new line
                                    </span>
                                    <span className="block text-[12px] text-muted-foreground">
                                        {registered
                                            ? "You'll set price and GST"
                                            : "You'll set its price"}
                                    </span>
                                </span>
                            </CommandItem>
                        </CommandGroup>
                    ) : null}
                </CommandList>
            </Command>
        </HeaderOverlay>
    );
}
