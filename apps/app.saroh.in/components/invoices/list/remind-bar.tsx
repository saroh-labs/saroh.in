"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useRef } from "react";

import { count } from "@/lib/format/plural";
import { useBottomBarInset } from "@/lib/hooks/use-bottom-bar-inset";

const BAR_BUTTON =
    "h-8 cursor-pointer rounded-lg px-3 text-[12.5px] font-semibold transition-[background-color,transform] duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground active:scale-[0.97] coarse:h-11";

/**
 * The Invoices list's bar while rows are ticked (U12 #1124), the list's
 * bulk-bar pattern from Orders (`commerce/orders/bulk-bar.tsx`): the ink
 * bar at the foot of the screen, how many are ticked, Remind and Clear.
 * Remind opens Remind many's three steps on the ticked ones. It lifts the
 * toasts above itself, so an Undo never lands on its buttons.
 */
export function RemindBar({
    count: n,
    onRemind,
    onClear,
}: {
    count: number;
    onRemind: () => void;
    onClear: () => void;
}) {
    const bar = useRef<HTMLDivElement>(null);
    useBottomBarInset(bar, n > 0);
    return (
        <div
            ref={bar}
            className="pointer-events-none sticky bottom-[22px] z-20 pt-3.5 max-md:hidden"
        >
            <div
                role="region"
                aria-label="Ticked invoices"
                className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-[11px] bg-primary px-[15px] py-[11px] text-primary-foreground shadow-lg"
            >
                <span className="text-[13px] font-semibold tabular-nums">
                    {count(n, "invoice")} ticked
                </span>
                <div className="ml-auto flex flex-wrap gap-[7px]">
                    <button
                        type="button"
                        onClick={onRemind}
                        className={cn(
                            BAR_BUTTON,
                            "border border-primary-foreground/30 hover:bg-primary-foreground/10 active:bg-primary-foreground/15",
                        )}
                    >
                        Remind {n}
                    </button>
                    <button
                        type="button"
                        onClick={onClear}
                        className={cn(
                            BAR_BUTTON,
                            "px-2.5 font-medium opacity-80 hover:bg-primary-foreground/10 hover:opacity-100 active:bg-primary-foreground/15",
                        )}
                    >
                        Clear
                    </button>
                </div>
            </div>
        </div>
    );
}
