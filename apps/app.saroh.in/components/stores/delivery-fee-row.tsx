"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { useState } from "react";

import type { StorefrontInput } from "@/lib/stores/storefronts";

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

type Saver = (
    input: StorefrontInput,
    said: string,
    onFail?: () => void,
) => void;

/**
 * "Local delivery fee on your website [60] Save" (round-2 G13): the flat
 * amount the site's checkout adds when a customer picks Local delivery or
 * Shipping. Empty or 0 is free. Shown only while the business's website
 * shop is open, and only for a way this storefront offers.
 */
export function DeliveryFeeRow({
    type,
    fee,
    currency,
    canEdit,
    pending,
    save,
}: {
    type: "LOCAL_DELIVERY" | "SHIPPING";
    fee: string | null;
    currency: string;
    canEdit: boolean;
    pending: boolean;
    save: Saver;
}) {
    const [value, setValue] = useState(fee ?? "");
    const typed = value.trim();
    const ok = typed === "" || MONEY_RE.test(typed);
    const saved = fee ?? "";
    const dirty = typed !== saved && !(typed === "0" && saved === "");
    const noun = type === "LOCAL_DELIVERY" ? "Local delivery" : "Shipping";
    const id = `storefront-fee-${type.toLowerCase()}`;
    const field =
        type === "LOCAL_DELIVERY" ? "localDeliveryFee" : "shippingFee";

    return (
        <form
            className="grid gap-1.5"
            onSubmit={(e) => {
                e.preventDefault();
                if (!ok || !dirty) return;
                const next = typed === "" || Number(typed) === 0 ? null : typed;
                save(
                    { [field]: next },
                    next
                        ? `${noun} on your website now costs ${currency} ${next}`
                        : `${noun} on your website is now free`,
                );
            }}
        >
            <Label htmlFor={id} className="text-[12.5px] font-medium">
                {noun} fee on your website ({currency})
            </Label>
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    id={id}
                    inputMode="decimal"
                    placeholder="Free"
                    value={value}
                    readOnly={!canEdit}
                    aria-invalid={!ok || undefined}
                    aria-describedby={`${id}-note`}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-28 tabular-nums"
                />
                {canEdit && dirty ? (
                    <Button type="submit" disabled={pending || !ok}>
                        Save
                    </Button>
                ) : null}
            </div>
            <p
                id={`${id}-note`}
                role={ok ? undefined : "alert"}
                className={cn(
                    "text-pretty text-[12px] leading-[1.5]",
                    ok ? "text-muted-foreground" : "text-destructive",
                )}
            >
                {ok
                    ? "Added to orders placed on your website. Leave it empty for free."
                    : "A number with up to 2 decimals, like 60 or 49.50."}
            </p>
        </form>
    );
}
