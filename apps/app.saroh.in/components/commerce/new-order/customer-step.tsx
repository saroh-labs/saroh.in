"use client";

import { cn } from "@saroh/ui/lib/utils";

import { CustomerPicker } from "@/components/customers/customer-picker";
import type { CustomerPick } from "@/lib/customers/picker";
import { pickName } from "@/lib/customers/picker";
import { pickMeta } from "@/lib/orders/new-order";

import { SMALL_BUTTON, StepCard } from "./parts";

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
                <button
                    type="button"
                    onClick={() => onPick(null)}
                    aria-label={`Change the customer, now ${pickName(pick)}`}
                    className={cn(
                        SMALL_BUTTON,
                        "h-[30px] px-[11px] text-[12.5px] coarse:h-11",
                    )}
                >
                    Change
                </button>
            </div>
            {attention ? (
                <div
                    role="alert"
                    className="mt-[9px] rounded-lg bg-destructive-subtle px-2.5 py-2 text-[12.5px] font-semibold leading-[1.45] text-destructive-subtle-foreground"
                >
                    {attention}
                </div>
            ) : null}
        </StepCard>
    );
}
