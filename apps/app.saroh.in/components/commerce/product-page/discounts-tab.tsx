import { Badge } from "@saroh/ui/badge";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import { Tag } from "lucide-react";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import { formatMoneyMajor } from "@/lib/format/money";
import type { ProductOverview } from "@/lib/products/overview";
import {
    DISCOUNT_REACH_LABEL,
    discountAmount,
    plural,
} from "@/lib/products/overview-rules";

import {
    PanelFailed,
    PanelForbidden,
    StateLink,
    TabState,
} from "./panel-state";

const STATE = {
    ACTIVE: { label: "Applies now", variant: "success" },
    SCHEDULED: { label: "Scheduled", variant: "neutral" },
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
            <TabState
                icon={Tag}
                title="No discounts reach it yet"
                description="A code set on this product, its category, the storefront or everything in the shop shows here."
            >
                <StateLink href="/commerce/discounts">Open Discounts</StateLink>
            </TabState>
        );
    }

    return (
        <div>
            <p className="mb-3 text-pretty text-[12.5px] text-muted-foreground">
                Discounts that reach this product — set on it, its category, the
                storefront or everything. Set up in Discounts.
            </p>
            <ul className="flex flex-col gap-2.5">
                {discounts.data.map((d) => {
                    const state =
                        d.state in STATE
                            ? STATE[d.state as keyof typeof STATE]
                            : STATE.EXPIRED;
                    const ended =
                        d.state === "EXPIRED" || d.state === "EXHAUSTED";
                    // Only what applies now is at full strength.
                    const quiet = d.state !== "ACTIVE";
                    return (
                        <li key={d.id}>
                            <Card
                                className={cn(
                                    "rounded-[12px] px-4 py-[13px]",
                                    quiet && "opacity-70",
                                )}
                            >
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <span className="font-mono text-[13px] font-medium">
                                        {d.code}
                                    </span>
                                    <Badge
                                        variant={state.variant}
                                        className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-[1.3]"
                                    >
                                        {state.label}
                                    </Badge>
                                    <Link
                                        href="/commerce/discounts"
                                        className="ml-auto text-[12px] text-brand hover:text-foreground"
                                    >
                                        Open in Discounts
                                    </Link>
                                </div>
                                <p className="mt-1.5 text-[13.5px]">
                                    {discountAmount(d, money)}{" "}
                                    {DISCOUNT_REACH_LABEL[d.appliesTo] ?? ""}
                                    {d.description ? ` — ${d.description}` : ""}
                                </p>
                                <p className="mt-1 text-[12px] text-muted-foreground">
                                    {d.endsAt ? (
                                        <>
                                            {ended ? "Ended " : "Until "}
                                            <ViewerDate
                                                iso={d.endsAt}
                                                variant="dayMonth"
                                            />
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
