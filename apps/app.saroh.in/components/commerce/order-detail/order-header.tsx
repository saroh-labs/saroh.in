import { cn } from "@saroh/ui/lib/utils";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { OrderRead } from "@/lib/orders/read";

import type { PillTone } from "./parts";
import { FOCUS, StatusPill } from "./parts";

/** "‹ Orders / #1063" — the bar above the order, back to the list. */
export function OrderCrumbs({ number }: { number: string }) {
    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-[9px] print:hidden">
            <Link
                href="/commerce/orders"
                className={cn(
                    FOCUS,
                    "flex items-center gap-[7px] rounded-lg px-[9px] py-1.5 text-[12.5px] text-neutral-700 hover:bg-muted coarse:min-h-11 dark:text-muted-foreground",
                )}
            >
                <ChevronLeft
                    aria-hidden
                    className="size-[15px]"
                    strokeWidth={2}
                />
                Orders
            </Link>
            <span aria-hidden className="text-[15px] text-muted-foreground">
                /
            </span>
            <span className="text-[13.5px] font-semibold" aria-current="page">
                {number}
            </span>
        </div>
    );
}

/**
 * The order's number and status, how long it has waited (Saffron past the
 * counter's 20-minute target), when and where it was placed and how it goes
 * out — and, on the right, the actions the screen passes in.
 */
export function OrderHeading({
    order,
    number,
    standing,
    age,
    children,
}: {
    order: OrderRead;
    number: string;
    standing: { label: string; tone: PillTone };
    age: { text: string; late: boolean } | null;
    /** The header's buttons. */
    children: ReactNode;
}) {
    const delivery = order.fulfilment === "DELIVERY";
    return (
        <div className="flex flex-wrap items-start gap-3.5">
            <div className="min-w-0 flex-[1_1_320px]">
                <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="m-0 font-display text-[28px] font-semibold tracking-[-0.03em]">
                        {number}
                    </h1>
                    <StatusPill tone={standing.tone}>
                        {standing.label}
                    </StatusPill>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                    {age ? (
                        <span
                            title={
                                age.late
                                    ? "Past the 20-minute target"
                                    : "Within the 20-minute target"
                            }
                            className={cn(
                                "rounded-full border px-2 py-0.5 text-[12px] font-bold tabular-nums",
                                age.late
                                    ? "border-highlight-border bg-brand-subtle text-brand-subtle-foreground"
                                    : "border-transparent bg-muted text-neutral-700 dark:text-muted-foreground",
                            )}
                        >
                            {age.text}
                        </span>
                    ) : null}
                    <span>
                        <ViewerDate iso={order.placedAt} variant="moment" /> ·{" "}
                        {order.store.name} ·{" "}
                        {delivery
                            ? `Delivery${order.deliveryAddress?.city ? ` to ${order.deliveryAddress.city}` : ""}`
                            : "Collection"}
                    </span>
                </div>
            </div>
            <div className="flex flex-none flex-wrap items-center gap-2 print:hidden">
                {children}
            </div>
        </div>
    );
}
