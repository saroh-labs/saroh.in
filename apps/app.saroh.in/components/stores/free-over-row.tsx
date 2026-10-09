"use client";

import { Button } from "@saroh/ui/button";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { useState } from "react";

import { deliveryGrid, MoneyField, PAST_SWITCH } from "./delivery-fields";
import type { SectionProps } from "./location-save";

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/**
 * "Free delivery over [ Never ₹ ]": the Delivery list's last row, its box
 * under Fee. One amount for the location, not one per way
 * (`StoreSettings.freeShippingThreshold` is a single column).
 *
 * The website's checkout applies it (DEC-117): when the bag's subtotal,
 * less any discount code and before delivery, is at or above it, Local
 * delivery and Shipping add no fee. A counter's New order still fills in
 * the flat fee, so the line speaks of website orders only.
 */
export function FreeOverRow({
    store,
    canEdit,
    pending,
    save,
    withFee,
}: SectionProps & {
    /** Whether the list has a Fee column (the online shop is open). */
    withFee: boolean;
}) {
    const [threshold, setThreshold] = useState(
        store.freeShippingThreshold ?? "",
    );
    const next = threshold.trim();
    const valid = next === "" || MONEY_RE.test(next);
    const dirty =
        valid &&
        (next === ""
            ? store.freeShippingThreshold !== null
            : Number(next) !== Number(store.freeShippingThreshold ?? NaN));

    return (
        <form
            className={cn(
                "grid gap-x-4 gap-y-1.5 py-3 sm:items-center",
                deliveryGrid(withFee),
            )}
            onSubmit={(e) => {
                e.preventDefault();
                if (!dirty) return;
                save(
                    { freeShippingThreshold: next === "" ? null : next },
                    next === ""
                        ? "Free delivery amount removed"
                        : `Free delivery over ${next} ${store.currency} saved`,
                );
            }}
        >
            <Label
                htmlFor="storefront-free-over"
                className={cn("text-[13.5px] font-medium", PAST_SWITCH)}
            >
                Free delivery over
            </Label>
            <div className="max-w-40 sm:max-w-none">
                <MoneyField
                    id="storefront-free-over"
                    value={threshold}
                    placeholder="Never"
                    currency={store.currency}
                    readOnly={!canEdit}
                    invalid={!valid}
                    describedBy="storefront-free-over-note"
                    onChange={setThreshold}
                />
            </div>
            {/* The Late after column, beside Fee, has nothing for it. */}
            {withFee ? <span className="max-sm:hidden" /> : null}
            <div className="max-sm:empty:hidden sm:justify-self-end">
                {canEdit && dirty ? (
                    <Button type="submit" disabled={pending}>
                        Save
                    </Button>
                ) : null}
            </div>
            <p
                id="storefront-free-over-note"
                className={cn(
                    "text-pretty text-[12.5px] leading-[1.5] sm:col-span-full",
                    PAST_SWITCH,
                    valid ? "text-muted-foreground" : "text-destructive",
                )}
            >
                {valid
                    ? "Website orders at or above this, after any code, pay no delivery fee. Empty: always charge."
                    : "A number with up to 2 decimals, or empty."}
            </p>
        </form>
    );
}
