import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import type { ProductOverview } from "@/lib/products/overview";
import {
    DISCOUNT_REACH_LABEL,
    discountAmount,
    plural,
} from "@/lib/products/overview-rules";

import { PanelFailed, PanelForbidden } from "./panel-state";

const STATE = {
    ACTIVE: { label: "Applies now", variant: "success" },
    SCHEDULED: { label: "Scheduled", variant: "info" },
    EXPIRED: { label: "Ended", variant: "neutral" },
    EXHAUSTED: { label: "Used up", variant: "neutral" },
} as const;

/**
 * The discount codes that reach this product — set on it, on its category,
 * on its storefront or on everything. What applies now comes first; ended
 * ones stay listed, quieter, because "why did that order get 10% off" is
 * asked after the fact.
 */
export function ProductDiscountsTab({
    overview,
    retryHref,
}: {
    overview: ProductOverview;
    retryHref: string;
}) {
    const { product, discounts } = overview;
    if (discounts.status === "failed") {
        return <PanelFailed what="discounts" retryHref={retryHref} />;
    }
    if (discounts.status === "forbidden")
        return <PanelForbidden what="discounts" />;
    const money = (amount: string) =>
        formatMoneyMajor(amount, product.currency) ?? amount;

    if (discounts.data.length === 0) {
        return (
            <EmptyState
                title="No discount codes reach it yet"
                description="A code set on this product, its category, the storefront or everything in the shop shows here."
                action={
                    <Button asChild variant="outline">
                        <Link href="/commerce/discounts">Open Discounts</Link>
                    </Button>
                }
            />
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <p className="text-[12.5px] text-muted-foreground">
                Codes that reach this product. Set up and changed in Discounts.
            </p>
            <ul className="flex flex-col gap-2.5">
                {discounts.data.map((d) => {
                    const state =
                        d.state in STATE
                            ? STATE[d.state as keyof typeof STATE]
                            : STATE.EXPIRED;
                    const ended =
                        d.state === "EXPIRED" || d.state === "EXHAUSTED";
                    return (
                        <li key={d.id}>
                            <Card
                                className={cn(
                                    "px-4 py-3",
                                    ended && "bg-muted/40",
                                )}
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-[13px] font-semibold">
                                        {d.code}
                                    </span>
                                    <Badge variant={state.variant}>
                                        {state.label}
                                    </Badge>
                                    <Link
                                        href="/commerce/discounts"
                                        className="ml-auto text-[12.5px] font-medium underline-offset-4 hover:underline"
                                    >
                                        Open in Discounts
                                    </Link>
                                </div>
                                <p className="mt-1 text-[13.5px]">
                                    {discountAmount(d, money)}{" "}
                                    {DISCOUNT_REACH_LABEL[d.appliesTo] ?? ""}
                                    {d.description ? ` — ${d.description}` : ""}
                                </p>
                                <p className="mt-0.5 text-[12px] text-muted-foreground">
                                    {d.endsAt ? (
                                        <>
                                            {ended ? "Ended " : "Until "}
                                            <ViewerDate iso={d.endsAt} />
                                        </>
                                    ) : (
                                        "No end date"
                                    )}
                                    {" · "}used{" "}
                                    {plural(d.usedOnProduct, "time")} on this
                                    product
                                </p>
                            </Card>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
