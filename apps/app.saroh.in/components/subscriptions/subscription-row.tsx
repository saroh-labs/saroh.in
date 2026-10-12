"use client";

import { AbsentOr } from "@saroh/ui/absent-value";
import { cn } from "@saroh/ui/lib/utils";

import { listTable } from "@/components/shared/list-toolbar";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Plan, Subscription } from "@/lib/subscriptions/service";
import {
    initials,
    listTab,
    olderPrice,
    rowWhen,
    shortPrice,
    subscriptionPay,
    TAB_LABEL,
    TAB_TONE,
} from "@/lib/subscriptions/view";

/** One subscription on the list; it opens the quick look. */
/**
 * The list's row and its columns, shared with the head band over it so the
 * two line up: initials, who and which plan, where it stands, what comes
 * next, and what they pay. From `md` they are one fixed grid, so a longer
 * price in one row can't move the columns of the next. They wrap on a
 * phone, where the head is left out.
 */
export const SUBSCRIPTION_ROW =
    "flex flex-wrap items-center gap-3 md:grid md:grid-cols-[34px_minmax(0,2fr)_minmax(110px,1fr)_minmax(0,2fr)_112px]";
export const SUBSCRIPTION_COLS = {
    who: "min-w-0 flex-[2_1_200px]",
    status: "min-w-0 flex-[1_1_110px]",
    when: "min-w-0 flex-[2_1_200px]",
    price: "min-w-[72px] text-right tabular-nums",
} as const;

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
                "w-full text-left",
                SUBSCRIPTION_ROW,
                listTable.rowInner,
                listTable.pressable,
                open && listTable.selected,
            )}
        >
            <span
                aria-hidden
                className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold text-foreground"
            >
                {initials(sub.contact.name)}
            </span>
            <span className={SUBSCRIPTION_COLS.who}>
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
                            <span className="text-foreground">older price</span>
                        </>
                    ) : null}
                </span>
            </span>
            <span className={SUBSCRIPTION_COLS.status}>
                <StatusBadge tone={TAB_TONE[tab]}>{TAB_LABEL[tab]}</StatusBadge>
            </span>
            <span
                className={cn(
                    SUBSCRIPTION_COLS.when,
                    "text-[12.5px]",
                    when.danger
                        ? "text-destructive-subtle-foreground"
                        : "text-muted-foreground",
                )}
            >
                <AbsentOr says="None">{when.text}</AbsentOr>
            </span>
            <span
                className={cn(
                    SUBSCRIPTION_COLS.price,
                    "font-display text-[14px] font-semibold text-foreground",
                )}
            >
                {/* What they pay a period, GST and all. */}
                {shortPrice(subscriptionPay(sub), sub.currency, sub.interval)}
            </span>
        </button>
    );
}
