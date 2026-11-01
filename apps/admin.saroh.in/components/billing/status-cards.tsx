"use client";

import { Chip } from "@saroh/ui/chip";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Info } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { Query, StatusCardKey } from "@/lib/billing-filters";
import {
    activeCard,
    cardHref,
    planHref,
    STATUS_CARDS,
} from "@/lib/billing-filters";
import { formatPaise } from "@/lib/billing-words";

const figures = new Intl.NumberFormat("en-IN");

/** The figure's fine print, behind ⓘ. */
export const LIST_PRICE_FINE_PRINT =
    "Before GST, at each plan's list price, for plans that are paying or whose payment failed. A year's price is spread over twelve months. Coupons, custom prices and add-ons are not counted.";

function useFilterNav() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const query: Query = Object.fromEntries(params.entries());
    const go = (href: string) => router.push(href, { scroll: false });
    return { pathname, query, go };
}

/**
 * The subscriptions' total and their status chips (R26). The total is the
 * one card: "A month, at list price", with its fine print behind ⓘ. Each
 * status is a chip toggle (`aria-pressed`) with its count, as Invoices'
 * statuses are: pressed, the list shows only that status; pressed again,
 * everything. One is on at a time; the search and the plan stay as they are.
 */
export function StatusCards({
    mrrPaise,
    currency,
    counts,
}: {
    mrrPaise: number;
    currency: string;
    counts: Record<StatusCardKey, number>;
}) {
    const { pathname, query, go } = useFilterNav();
    const on = activeCard(query);

    return (
        <>
            <div className="rounded-[11px] border bg-card px-4 py-3.5 sm:max-w-xs">
                <div className="flex items-center justify-between gap-2">
                    <p className="label">A month, at list price</p>
                    <Popover>
                        <PopoverTrigger asChild>
                            <IconButton
                                label="What this counts"
                                icon={<Info />}
                                size="xs"
                                tooltip={false}
                                className="-my-1 -mr-1.5"
                            />
                        </PopoverTrigger>
                        <PopoverContent className="max-w-[300px] text-sm">
                            {LIST_PRICE_FINE_PRINT}
                        </PopoverContent>
                    </Popover>
                </div>
                <p
                    data-ph-mask=""
                    className="mt-[7px] font-display text-[25px] font-semibold tabular-nums leading-none tracking-[-0.03em]"
                >
                    {formatPaise(mrrPaise, currency)}
                </p>
            </div>
            <div
                role="group"
                aria-label="Status"
                className="flex flex-wrap items-center gap-2"
            >
                {STATUS_CARDS.map((card) => {
                    const pressed = on === card.key;
                    const count = counts[card.key];
                    const attention =
                        card.key === "failed" && count > 0 && !pressed;
                    return (
                        <Chip
                            key={card.key}
                            as="toggle"
                            on={pressed}
                            onClick={() =>
                                go(cardHref(pathname, query, card.key))
                            }
                        >
                            {card.label}
                            <span
                                className={cn(
                                    "tabular-nums opacity-70",
                                    attention &&
                                        "font-semibold text-warning-subtle-foreground opacity-100",
                                )}
                            >
                                {figures.format(count)}
                            </span>
                        </Chip>
                    );
                })}
            </div>
        </>
    );
}

/**
 * One chip per plan with a subscription (R26), each a toggle: pressed, the
 * list shows that plan; pressed again, every plan. The search and the
 * status card stay as they are.
 */
export function PlanChips({
    plans,
}: {
    plans: { key: string; name: string; count?: number }[];
}) {
    const { pathname, query, go } = useFilterNav();
    if (plans.length === 0) return null;
    return (
        <div
            role="group"
            aria-label="Plan"
            className="flex flex-wrap items-center gap-2"
        >
            {plans.map((plan) => (
                <Chip
                    key={plan.key}
                    as="toggle"
                    on={query.plan === plan.key}
                    onClick={() => go(planHref(pathname, query, plan.key))}
                >
                    {plan.name}
                    {plan.count !== undefined ? (
                        <span className="tabular-nums opacity-70">
                            {figures.format(plan.count)}
                        </span>
                    ) : null}
                </Chip>
            ))}
        </div>
    );
}
