"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { useState } from "react";

import type { StorefrontSettings } from "@/lib/stores/storefronts";
import { taxRateField, taxRateValid } from "@/lib/stores/tax-rate";

import type { Saver } from "./location-save";

/** The row the sheet is opened from; its Edit takes the keyboard back. */
export const TAX_RATE_ROW_ID = "location-tax-rate";

/**
 * The tax rate's Edit sheet, opened from its row in Payments (owner, 10
 * Oct: read first, as Delivery is). The one field the tab always had, with
 * its note and its bounds.
 *
 * Nothing saves until Save. Cancel, Escape, the close button and a press
 * outside drop what was typed. A refusal keeps the sheet open with it, and
 * the sheet can't be dismissed while a save is on its way. The row gives
 * each opening its own `key`, so it starts from the saved rate.
 */
export function TaxRateSheet({
    store,
    open,
    pending,
    save,
    onClose,
}: {
    store: Pick<StorefrontSettings, "taxRate">;
    open: boolean;
    pending: boolean;
    save: Saver;
    onClose: () => void;
}) {
    const [rate, setRate] = useState(() => taxRateField(store.taxRate));
    const valid = taxRateValid(rate);
    const changed = valid && Number(rate) !== Number(store.taxRate);

    return (
        <Sheet
            open={open}
            onOpenChange={(o) => {
                if (!o && !pending) onClose();
            }}
        >
            <SheetContent
                className="flex w-full flex-col sm:max-w-md"
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    document
                        .querySelector<HTMLElement>(
                            `#${TAX_RATE_ROW_ID} button`,
                        )
                        ?.focus();
                }}
            >
                <SheetHeader>
                    <SheetTitle>Tax rate</SheetTitle>
                    <SheetDescription>
                        The tax added to each new order at this location.
                    </SheetDescription>
                </SheetHeader>
                <form
                    id={`${TAX_RATE_ROW_ID}-panel`}
                    className="mt-5 flex min-h-0 flex-1 flex-col"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!valid) return;
                        if (!changed) {
                            onClose();
                            return;
                        }
                        save(
                            { taxRate: rate.trim() },
                            `Tax rate set to ${Number(rate)}%`,
                            undefined,
                            undefined,
                            onClose,
                        );
                    }}
                >
                    <div className="-mx-1 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-1 pb-1">
                        <Label htmlFor="storefront-tax-rate">Tax rate</Label>
                        <div className="relative w-28">
                            <Input
                                id="storefront-tax-rate"
                                inputMode="decimal"
                                value={rate}
                                aria-invalid={!valid || undefined}
                                aria-describedby="storefront-tax-rate-note"
                                onChange={(e) => setRate(e.target.value)}
                                className="pr-7 tabular-nums"
                            />
                            <span
                                aria-hidden
                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground"
                            >
                                %
                            </span>
                        </div>
                        <p
                            id="storefront-tax-rate-note"
                            role={valid ? undefined : "alert"}
                            className={
                                valid
                                    ? "text-pretty text-[12.5px] leading-[1.5] text-muted-foreground"
                                    : "text-pretty text-[12.5px] leading-[1.5] text-destructive"
                            }
                        >
                            {valid
                                ? "A percentage of the order's items, before delivery."
                                : "A percentage from 0 to 100, with up to 2 decimals."}
                        </p>
                    </div>

                    <SheetFooter className="mt-4 flex-row flex-wrap items-center gap-2 border-t border-border pt-4 sm:justify-start sm:space-x-0">
                        <Button
                            type="submit"
                            variant="brand"
                            disabled={pending}
                        >
                            {pending ? "Saving…" : "Save"}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={pending}
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
