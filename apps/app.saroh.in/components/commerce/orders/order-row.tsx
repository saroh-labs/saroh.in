import { Checkbox } from "@saroh/ui/checkbox";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { RowAttention } from "@/lib/orders/attention";
import { rowAttention } from "@/lib/orders/attention";
import type { OrderRow } from "@/lib/orders/business-service";
import { orderHref } from "@/lib/orders/links";
import {
    rowAge,
    rowCustomer,
    rowInitials,
    rowMoney,
    rowProgress,
    rowSubline,
} from "@/lib/orders/list-row";

import { AgeText, StepBar, StepPill } from "./step-pill";

/**
 * One order in the list, after the "Saroh Orders Screen" design (plan B,
 * B3). At the desk it is a grid row: who and what, the step with its bar and
 * age (or "Late"), the unpaid line, when it was placed and the total. On a
 * phone (under 760px, where the tab bar takes over) the row stacks into a
 * card. Either way the whole row is the target (four scenes): the
 * customer's name opens the quick view (B5) and its hit area covers the
 * row, with the row menu in the last column at the desk. On a phone the
 * card opens the quick view as a sheet from the bottom (DEC-067), where the
 * design had it open the full page; without `onOpen` it still links there.
 *
 * Money shows only when the API sent it (`order:read`); the kitchen's view
 * keeps the pill, the bar and the age.
 *
 * The customer's Needs attention (B15) is a red tag beside their name at the
 * desk and in the card's meta line on a phone: "Allergy: Sesame", "+1" for
 * more, named in full for a screen reader. The API sends only what the
 * viewer may see; "Not available" when it couldn't be read.
 */

/** The desk grid: Order · Status · Placed · Total · the row menu (B5). */
export const ORDER_GRID =
    "grid grid-cols-[minmax(210px,1fr)_minmax(86px,122px)_minmax(104px,118px)_minmax(84px,92px)_44px] items-center px-3.5";

/** The same grid with the design's 38px selection column first (B6). */
export const ORDER_GRID_SELECT =
    "grid grid-cols-[38px_minmax(210px,1fr)_minmax(86px,122px)_minmax(104px,118px)_minmax(84px,92px)_44px] items-center px-3.5";

/** A row's selection box (B6): checked, and what toggling it does. */
export interface RowSelect {
    checked: boolean;
    onToggle: () => void;
}

/** The design's 17px box, above the row's full-row link. */
const BOX =
    "relative z-[1] size-[17px] cursor-pointer rounded-[5px] hover:border-foreground/60 active:scale-95";

/** The column heads over the desk rows. */
export function OrderGridHead({
    money,
    select,
}: {
    money: boolean;
    /** Select every order on the page (B6); absent without `order:stage`. */
    select?: { state: boolean | "indeterminate"; onToggle: () => void };
}) {
    return (
        <div
            className={cn(
                select ? ORDER_GRID_SELECT : ORDER_GRID,
                "h-10 rounded-t-[11px] border-b border-border bg-muted text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
            )}
        >
            {select ? (
                <div>
                    <Checkbox
                        checked={select.state}
                        onCheckedChange={select.onToggle}
                        aria-label="Select every order in this view"
                        className={BOX}
                    />
                </div>
            ) : null}
            <div aria-hidden>Order</div>
            <div aria-hidden>Status</div>
            <div aria-hidden>Placed</div>
            <div aria-hidden className="text-right">
                {money ? "Total" : ""}
            </div>
            <div aria-hidden />
        </div>
    );
}

function Avatar({ row }: { row: OrderRow }) {
    return (
        <span
            aria-hidden
            className="flex size-[30px] flex-none items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-neutral-700 dark:text-foreground"
        >
            {rowInitials(row)}
        </span>
    );
}

/** The row's words, worked out once for both layouts. */
function rowView(row: OrderRow, showStore: boolean) {
    return {
        href: orderHref(row.store.id, row.id),
        customer: rowCustomer(row),
        ref: `#${row.orderId}`,
        subline: rowSubline(row, showStore),
        progress: rowProgress(row),
        age: rowAge(row),
        money: rowMoney(row),
        attention: rowAttention(row),
    };
}

/** The design's Needs attention tag; words, never colour alone. */
function AttentionTag({ attention }: { attention: RowAttention }) {
    if (attention.state === "none") return null;
    return (
        <span
            role="img"
            aria-label={attention.name}
            title={attention.state === "shown" ? attention.title : undefined}
            className={cn(
                "max-w-[180px] flex-none truncate rounded-full px-1.5 py-px text-[11px] font-bold",
                attention.state === "shown"
                    ? "bg-destructive-subtle text-destructive-subtle-foreground"
                    : "bg-muted text-muted-foreground",
            )}
        >
            {attention.text}
        </span>
    );
}

/** A link whose hit area is the whole (relative) row around it. */
const ROW_LINK =
    "rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring";

export function OrderGridRow({
    row,
    showStore,
    open,
    onOpen,
    menu,
    select,
}: {
    row: OrderRow;
    showStore: boolean;
    /** Its selection box (B6); absent without `order:stage`. */
    select?: RowSelect;
    /** Whether its quick view is the one open (B5). */
    open?: boolean;
    /** Open its quick view (B5); without it the name links to the page. */
    onOpen?: () => void;
    /** The row menu (B5), in the last column. */
    menu?: ReactNode;
}) {
    const v = rowView(row, showStore);
    return (
        <li
            className={cn(
                select ? ORDER_GRID_SELECT : ORDER_GRID,
                "relative border-b border-border py-[11px] transition-colors duration-fast last:rounded-b-[11px] last:border-b-0 hover:bg-foreground/[0.035] active:bg-foreground/[0.06]",
                (open === true || select?.checked === true) &&
                    "bg-brand-subtle hover:bg-brand-subtle",
            )}
        >
            {select ? (
                <div className="flex items-center">
                    <Checkbox
                        checked={select.checked}
                        onCheckedChange={select.onToggle}
                        aria-label={`${select.checked ? "Deselect" : "Select"} order number ${row.orderId}`}
                        className={BOX}
                    />
                </div>
            ) : null}
            <div className="flex min-w-0 items-center gap-[11px] pr-3.5">
                <Avatar row={row} />
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 items-center gap-1.5">
                        {onOpen ? (
                            // The whole row opens the quick view, as the design
                            // has it; "Open full page" is in the row menu.
                            <button
                                type="button"
                                aria-haspopup="dialog"
                                onClick={onOpen}
                                className={cn(
                                    ROW_LINK,
                                    "block min-w-0 cursor-pointer truncate text-left text-[13.5px] font-medium text-foreground",
                                )}
                            >
                                {v.customer}
                            </button>
                        ) : (
                            <Link
                                href={v.href}
                                className={cn(
                                    ROW_LINK,
                                    "block min-w-0 truncate text-[13.5px] font-medium text-foreground",
                                )}
                            >
                                {v.customer}
                            </Link>
                        )}
                        <AttentionTag attention={v.attention} />
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        <span className="font-mono">{v.ref}</span>
                        {` · ${v.subline}`}
                    </div>
                </div>
            </div>
            <div className="grid min-w-0 justify-items-start gap-1.5">
                <StepPill progress={v.progress} />
                {v.progress.index !== null || v.age ? (
                    <div className="flex min-w-0 items-center gap-2">
                        <StepBar progress={v.progress} />
                        {v.age ? <AgeText age={v.age} /> : null}
                    </div>
                ) : null}
                {v.money.unpaid ? (
                    <div className="text-[11.5px] font-bold text-destructive-subtle-foreground">
                        {v.money.unpaid}
                    </div>
                ) : null}
            </div>
            <div className="min-w-0 truncate text-[12.5px] text-neutral-700 dark:text-muted-foreground">
                <ViewerDate iso={row.placedAt} variant="moment" />
            </div>
            <div className="whitespace-nowrap text-right font-display text-[13.5px] font-semibold tabular-nums tracking-[-0.02em]">
                {v.money.total}
            </div>
            <div className="flex justify-end">{menu}</div>
        </li>
    );
}

export function OrderCard({
    row,
    showStore,
    select,
    open,
    onOpen,
}: {
    row: OrderRow;
    showStore: boolean;
    /** Its selection box (B6), the design's 24px one; absent without `order:stage`. */
    select?: RowSelect;
    /** Whether its quick view is the one open (B5). */
    open?: boolean;
    /** Open its quick view (B5); without it the card links to the page. */
    onOpen?: () => void;
}) {
    const v = rowView(row, showStore);
    const name =
        "min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground";
    const card = (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-baseline gap-2">
                {onOpen ? (
                    <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={onOpen}
                        className={cn(
                            ROW_LINK,
                            name,
                            "cursor-pointer text-left",
                        )}
                    >
                        {v.customer}
                    </button>
                ) : (
                    <Link href={v.href} className={cn(ROW_LINK, name)}>
                        {v.customer}
                    </Link>
                )}
                {v.money.total ? (
                    <span className="font-display text-[14px] font-semibold tabular-nums">
                        {v.money.total}
                    </span>
                ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="font-mono">{v.ref}</span>
                <StepPill progress={v.progress} />
                <span>{row.fulfilmentLabel}</span>
                {v.age ? <AgeText age={v.age} /> : null}
                <AttentionTag attention={v.attention} />
            </div>
            {v.money.unpaid ? (
                <div className="text-[12px] font-bold text-destructive-subtle-foreground">
                    {v.money.unpaid}
                </div>
            ) : null}
        </div>
    );
    return (
        <li
            className={cn(
                "relative flex min-w-0 items-start gap-3 rounded-[11px] border border-border bg-card p-3 transition-colors duration-fast hover:bg-foreground/[0.035] active:bg-foreground/[0.06]",
                (open === true || select?.checked === true) &&
                    "border-highlight-border bg-brand-subtle hover:bg-brand-subtle",
            )}
        >
            {select ? (
                <Checkbox
                    checked={select.checked}
                    onCheckedChange={select.onToggle}
                    aria-label={`${select.checked ? "Deselect" : "Select"} order number ${row.orderId}`}
                    className={cn(BOX, "mt-px size-6 flex-none rounded-[6px]")}
                />
            ) : null}
            {card}
        </li>
    );
}
