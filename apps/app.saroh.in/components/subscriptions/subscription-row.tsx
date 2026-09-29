"use client";

import { cn } from "@saroh/ui/lib/utils";

import type { Plan, Subscription } from "@/lib/subscriptions/service";
import {
    initials,
    listTab,
    olderPrice,
    rowWhen,
    shortPrice,
    TAB_LABEL,
    TAB_TONE,
} from "@/lib/subscriptions/view";

import { Pill } from "./pill";

/** A tab's count; a failed renewal's count is red while it has any. */
export function Count({ n, danger = false }: { n: number; danger?: boolean }) {
    return (
        <span
            className={cn(
                "ml-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold",
                danger && n > 0
                    ? "bg-destructive-subtle text-destructive-subtle-foreground"
                    : "bg-muted text-muted-foreground",
            )}
        >
            {n}
        </span>
    );
}

/** One subscription on the list; it opens the quick look. */
export function SubscriptionRow({
    sub,
    plans,
    now,
    open,
    onOpen,
}: {
    sub: Subscription;
    plans: readonly Plan[];
    now: Date;
    open: boolean;
    onOpen: () => void;
}) {
    const tab = listTab(sub);
    const when = rowWhen(sub, now);
    const older = olderPrice(sub, plans);
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-haspopup="dialog"
            className={cn(
                "flex w-full flex-wrap items-center gap-3 rounded-[11px] border border-border px-3.5 py-3 text-left hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active",
                open
                    ? "bg-brand-subtle shadow-[inset_3px_0_0_hsl(var(--highlight))]"
                    : "bg-card",
            )}
        >
            <span
                aria-hidden
                className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold text-foreground"
            >
                {initials(sub.contact.name)}
            </span>
            <span className="min-w-0 flex-[2_1_200px]">
                <span className="block text-[14px] font-semibold text-foreground">
                    {sub.contact.name}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {sub.plan.name}
                    {sub.pendingPlan && tab !== "cancelled"
                        ? ` → ${sub.pendingPlan.name} next renewal`
                        : ""}
                    {older ? (
                        <>
                            {" · "}
                            <span className="text-brand">older price</span>
                        </>
                    ) : null}
                </span>
            </span>
            <span className="min-w-0 flex-[1_1_110px]">
                <Pill tone={TAB_TONE[tab]}>{TAB_LABEL[tab]}</Pill>
            </span>
            <span
                className={cn(
                    "min-w-0 flex-[2_1_200px] text-[12.5px]",
                    when.danger
                        ? "text-destructive-subtle-foreground"
                        : "text-muted-foreground",
                )}
            >
                {when.text}
            </span>
            <span className="shrink-0 font-display text-[14px] font-semibold tabular-nums text-foreground">
                {shortPrice(sub.price, sub.currency, sub.interval)}
            </span>
        </button>
    );
}
