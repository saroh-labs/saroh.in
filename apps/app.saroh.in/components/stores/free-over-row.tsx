"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useState } from "react";

import type { SectionProps } from "./location-save";
import { Note } from "./storefront-section";

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/**
 * "Free delivery over [999] INR": one amount for the location, not one per
 * way (`StoreSettings.freeShippingThreshold` is a single column), so it sits
 * under the ways rather than in a column beside each.
 *
 * Said as it is: it is saved, but nothing reads it yet. The website's
 * checkout adds the Local delivery or Shipping fee whatever the order comes
 * to (`checkout-quote.ts` `feeCents`), and neither the order nor the
 * receipt marks it free. The line says so rather than promise free
 * delivery. Kept, not cut, so a saved amount isn't lost.
 */
export function FreeOverRow({ store, canEdit, pending, save }: SectionProps) {
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
            className="grid gap-2"
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
            <Label htmlFor="storefront-free-over">Free delivery over</Label>
            <div className="flex items-center gap-2">
                <div className="relative w-40">
                    <Input
                        id="storefront-free-over"
                        inputMode="decimal"
                        value={threshold}
                        placeholder="Never"
                        readOnly={!canEdit}
                        aria-invalid={!valid || undefined}
                        aria-describedby="storefront-free-over-note"
                        onChange={(e) => setThreshold(e.target.value)}
                        className="pr-12 tabular-nums"
                    />
                    <span
                        aria-hidden
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-muted-foreground"
                    >
                        {store.currency}
                    </span>
                </div>
                {canEdit && dirty ? (
                    <Button type="submit" disabled={pending}>
                        Save
                    </Button>
                ) : null}
            </div>
            <Note id="storefront-free-over-note">
                {valid
                    ? "Saved, but checkout doesn't apply it yet: orders still pay the delivery fee."
                    : "A number with up to 2 decimals, or empty."}
            </Note>
        </form>
    );
}
