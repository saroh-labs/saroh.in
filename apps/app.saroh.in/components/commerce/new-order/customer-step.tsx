"use client";

import { Button } from "@saroh/ui/button";

import { CustomerPicker } from "@/components/customers/customer-picker";
import type { CustomerPick } from "@/lib/customers/picker";
import { pickName } from "@/lib/customers/picker";
import { pickMeta } from "@/lib/orders/new-order";

import { Notice } from "@saroh/ui/notice";
import { StepCard } from "./parts";

/**
 * Who it is for (B13): E4's shared picker, with Walk-in turned on — search
 * by name or phone, "+ Add ‹typed› as a new customer" (by email), or a
 * walk-in: a name alone makes no record, and a phone keeps them as a
 * customer (B13b). Once someone is picked, the
 * design's card: their name, how to reach them, Change, and their Needs
 * attention in red. A Member reads a picked customer's email with
 * `contact:read` alone, as the picker's search does.
 */
export function CustomerStep({
    pick,
    onPick,
    canSearch,
    attention,
}: {
    pick: CustomerPick | null;
    onPick: (pick: CustomerPick | null) => void;
    /** The viewer holds `contact:read`. */
    canSearch: boolean;
    /** Their Needs attention in words; null for none, or not read. */
    attention: string | null;
}) {
    if (!pick) {
        return (
            <StepCard title="Customer">
                <CustomerPicker
                    value={null}
                    onPick={onPick}
                    allowWalkIn
                    canSearch={canSearch}
                    showAttention={false}
                />
            </StepCard>
        );
    }
    const meta = pickMeta(pick);
    return (
        <StepCard title="Customer">
            <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">
                        {pickName(pick)}
                        {pick.kind === "new" ? (
                            <span className="font-normal text-muted-foreground">
                                {" "}
                                · new
                            </span>
                        ) : null}
                    </div>
                    <div className="break-words text-[12px] text-muted-foreground">
                        {meta}
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => onPick(null)}
                    aria-label={`Change the customer, now ${pickName(pick)}`}
                >
                    Change
                </Button>
            </div>
            {attention ? (
                <Notice tone="error" className="mt-[9px]">
                    {attention}
                </Notice>
            ) : null}
        </StepCard>
    );
}
