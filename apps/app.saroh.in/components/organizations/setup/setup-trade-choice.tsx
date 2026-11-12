"use client";

import { Check } from "lucide-react";
import { useId } from "react";

import type { Trade } from "@/lib/organizations/trade";
import { TRADE_CHOICES } from "@/lib/organizations/trade";
import { ChipGroup } from "@saroh/ui/choice-group";

/**
 * "What kind of place is it?" (DEC-216, TPLD1 and TPLD2): the gallery's
 * trades as chips (44px under a thumb), with one line under them. Setup asks
 * it of a business on its first step, and Settings › Business changes it in
 * its sheet. A salon or a gym starts Bookings with sample services (DEC-189).
 */
export function SetupTradeChoice({
    value,
    onChange,
    hint,
    label = "What kind of place is it?",
    labelledBy,
}: {
    value: Trade | null | undefined;
    onChange: (trade: Trade) => void;
    /** The line under the chips. */
    hint?: string;
    /** Drawn above the chips, unless the caller names them (`labelledBy`). */
    label?: string;
    labelledBy?: string;
}) {
    const id = useId();
    return (
        <div data-trade-choice="">
            {labelledBy ? null : (
                <div
                    data-ph-unmask=""
                    className="mb-2 text-[12px] font-medium"
                    id={`${id}-label`}
                >
                    {label}
                </div>
            )}
            <ChipGroup
                labelledBy={labelledBy ?? `${id}-label`}
                describedBy={hint ? `${id}-line` : undefined}
                className="gap-2"
                value={value ?? null}
                onChange={onChange}
                choices={TRADE_CHOICES.map((c) => ({
                    value: c.value,
                    label: (
                        <>
                            {c.value === value ? (
                                <Check aria-hidden className="size-3.5" />
                            ) : null}
                            {c.label}
                        </>
                    ),
                    data: { "data-trade": c.value },
                }))}
            />
            {hint ? (
                <p
                    id={`${id}-line`}
                    data-ph-unmask=""
                    className="mt-2 text-pretty text-[12px] leading-snug text-muted-foreground"
                >
                    {hint}
                </p>
            ) : null}
        </div>
    );
}
