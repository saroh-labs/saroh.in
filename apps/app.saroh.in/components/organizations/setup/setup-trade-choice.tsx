"use client";

import { useId } from "react";

import type { SetupTrade } from "@/lib/organizations/setup-steps";
import { TRADE_CHOICES, tradeLine } from "@/lib/organizations/setup-steps";
import { ChipGroup } from "@saroh/ui/choice-group";

/**
 * Bookings' trade at setup (#1193, DEC-189), under the goals when Bookings
 * is picked: Salon, Gym or Something else, as chips (44px under a thumb).
 * Salon or Gym starts the business with sample services, prices and hours
 * to edit, in place of the first service it would otherwise make.
 */
export function SetupTradeChoice({
    value,
    onChange,
}: {
    value: SetupTrade | undefined;
    onChange: (trade: SetupTrade) => void;
}) {
    const id = useId();
    const line = tradeLine("APPOINTMENTS", value);
    return (
        <div className="mt-5" data-trade-choice="">
            <div className="mb-1.5 text-[12px] font-medium" id={`${id}-label`}>
                What kind of place is it?
            </div>
            <ChipGroup
                labelledBy={`${id}-label`}
                describedBy={line ? `${id}-line` : undefined}
                value={value ?? null}
                onChange={onChange}
                choices={TRADE_CHOICES.map((c) => ({
                    value: c.value,
                    label: c.label,
                    data: { "data-trade": c.value },
                }))}
            />
            {line ? (
                <p
                    id={`${id}-line`}
                    className="mt-2 text-pretty text-[12px] leading-snug text-muted-foreground"
                >
                    {line}
                </p>
            ) : null}
        </div>
    );
}
