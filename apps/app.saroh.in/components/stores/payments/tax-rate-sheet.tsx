"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useState } from "react";

import { FormSheet } from "@/components/shared/forms/form-sheet";
import type { StorefrontSettings } from "@/lib/stores/storefronts";
import { taxRateField, taxRateValid } from "@/lib/stores/tax-rate";

import type { Saver } from "@/components/stores/locations/location-save";

/** The row the sheet is opened from; its Edit takes the keyboard back. */
export const TAX_RATE_ROW_ID = "location-tax-rate";

/**
 * The tax rate's Edit sheet, opened from its row in Payments (owner, 10
 * Oct: read first, as Delivery is). The one field the tab always had, with
 * its note and its bounds.
 *
 * Drawn in the app's one sheet frame
 * (`components/shared/forms/form-sheet.tsx`), which says how it saves
 * and closes. A refusal keeps the sheet open with what was typed. The row
 * gives each opening its own `key`, so it starts from the saved rate.
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
        <FormSheet
            id={`${TAX_RATE_ROW_ID}-panel`}
            returnFocusTo={() =>
                document.querySelector<HTMLElement>(
                    `#${TAX_RATE_ROW_ID} button`,
                )
            }
            title="Tax rate"
            description="The tax added to each new order at this location."
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                if (!valid) return;
                if (!changed) {
                    onClose();
                    return;
                }
                save(
                    { taxRate: rate.trim() },
                    `Tax rate set to ${Number(rate)}%.`,
                    undefined,
                    undefined,
                    onClose,
                );
            }}
        >
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
        </FormSheet>
    );
}
