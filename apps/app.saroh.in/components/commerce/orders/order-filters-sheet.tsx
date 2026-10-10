"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { QuickLook } from "@/components/shared/quick-look";
import type { OrderFilterOptions } from "@/lib/orders/business-service";
import { filtersOn, NO_FILTERS } from "@/lib/orders/list-filters";
import type { OrdersQuery } from "@/lib/orders/list-query";

import { OrderFilters } from "./order-filters";

/**
 * The Orders list's filters on a phone (plan B, B5; DEC-067): a Filters
 * button beside the search, saying how many are on, that opens the filter
 * bar's own menus in a sheet from the bottom. The design draws no phone
 * filters; stacked in the page, the menus pushed the first order below the
 * fold, so this is a recorded deviation.
 *
 * Every change still goes straight into the address, as at the desk, and
 * the list behind the sheet follows it; Done closes the sheet, and Clear
 * filters (once any is on) turns them all off. Drawn under 760px only: at
 * the desk the bar is on the page.
 */
export function OrderFiltersSheet({
    query,
    options,
    go,
    className,
}: {
    query: OrdersQuery;
    options: OrderFilterOptions | null;
    go: (patch: Partial<OrdersQuery>) => void;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const on = filtersOn(query);

    return (
        <>
            <Button
                data-ph-unmask=""
                type="button"
                variant="outline"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={on > 0 ? `Filters, ${on} on` : "Filters"}
                onClick={() => setOpen(true)}
                className={cn(
                    "h-11 cursor-pointer gap-1.5 rounded-[9px] px-3 text-[13.5px] font-medium active:scale-[0.98]",
                    on > 0 && "border-foreground",
                    className,
                )}
            >
                <SlidersHorizontal aria-hidden className="size-4" />
                Filters
                {on > 0 ? (
                    <span
                        aria-hidden
                        className="ml-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-[11px] font-bold tabular-nums text-background"
                    >
                        {on}
                    </span>
                ) : null}
            </Button>
            <QuickLook
                open={open}
                onOpenChange={setOpen}
                side="bottom"
                title="Filter orders"
                description="Choose which orders the list shows. Each change applies at once."
                footer={
                    <>
                        {on > 0 ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => go({ ...NO_FILTERS })}
                                className="mr-auto h-11 cursor-pointer rounded-[9px] px-3.5 text-[13.5px] font-semibold active:scale-[0.98]"
                            >
                                Clear filters
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="ml-auto h-11 cursor-pointer rounded-[9px] px-5 text-[13.5px] font-semibold active:scale-[0.98]"
                        >
                            Done
                        </Button>
                    </>
                }
            >
                <OrderFilters query={query} options={options} go={go} stacked />
            </QuickLook>
        </>
    );
}
