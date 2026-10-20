"use client";

import { Button } from "@saroh/ui/button";
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { noMatchLine, TRY_AGAIN } from "@saroh/ui/lib/state-copy";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { useState } from "react";

import { formatMoneyMajor } from "@/lib/format/money";
import type { PickRow } from "@/lib/invoices/new-invoice-lines";
import { lineRateWords, pickRows } from "@/lib/invoices/new-invoice-lines";

import { useProductSearch } from "./use-product-search";

/**
 * "+ Pick from your products" (INVNewA, U14 #1126): searches the catalogue
 * as it is typed into and, on a pick, hands the row back for a line to be
 * filled with its name, price, GST rate and HSN. Each row says what it
 * brings: "₹220 · GST 5% · HSN 19059090". The search is the catalogue's own
 * (names and SKUs); the last answer wins, and a refusal is said with Try
 * again, never as "no products".
 */
export function ProductPick({
    currency,
    registered,
    disabled,
    onPick,
}: {
    currency: string;
    registered: boolean;
    disabled?: boolean;
    onPick: (row: PickRow) => void;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const { found, error, searching, retry } = useProductSearch(open, q);

    const rows = found ? pickRows(found) : [];
    const money = (price: string) => formatMoneyMajor(price, currency);

    return (
        <Popover open={open} onOpenChange={setOpen} modal>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="link"
                    size="inline"
                    disabled={disabled}
                    className="py-1.5 text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast hover:decoration-foreground active:text-muted-foreground max-sm:min-h-11"
                >
                    + Pick from your products
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[min(360px,calc(100vw-32px))] p-0"
                align="start"
            >
                <Command shouldFilter={false} label="Pick from your products">
                    <CommandInput
                        value={q}
                        onValueChange={setQ}
                        placeholder="Search names and SKUs"
                    />
                    <CommandList aria-busy={searching}>
                        {error ? (
                            <div
                                role="alert"
                                className="px-3 py-3 text-[12.5px]"
                            >
                                <p className="text-destructive-subtle-foreground">
                                    {error}
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-2"
                                    onClick={retry}
                                >
                                    {TRY_AGAIN}
                                </Button>
                            </div>
                        ) : found === null ? (
                            <p className="px-3 py-3 text-[12.5px] text-muted-foreground">
                                Looking through your products…
                            </p>
                        ) : (
                            <CommandEmpty>
                                {q.trim()
                                    ? noMatchLine("products")
                                    : "No products in your catalogue yet."}
                            </CommandEmpty>
                        )}
                        {error
                            ? null
                            : rows.map((row) => {
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
                                              onPick(row);
                                              setOpen(false);
                                              setQ("");
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
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
