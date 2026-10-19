import { formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";

import { dayRow } from "@/lib/calendar/day-rows";
import type { LayerStyle, Off } from "@/lib/calendar/layers";
import { dayCount, itemsTotal } from "@/lib/calendar/layers";
import type { CalendarCash } from "@/lib/calendar/money";
import {
    dayMoney,
    groupMoney,
    toMajor,
    wholeMoney,
} from "@/lib/calendar/money";
import type { ProblemCan } from "@/lib/calendar/problems";
import { problemAction, problemOf } from "@/lib/calendar/problems";
import type { Shortcut } from "@/lib/calendar/range";
import type { CalendarDay, LayerKey } from "@/lib/calendar/types";

import { TONE_FILL } from "./tones";

/** How many of a layer's things the day lists before pointing onward (the
 *  boards: five, then "3 more"). */
export const PER_GROUP = 5;

/** Where the rest of a layer lives, when a day holds more than it lists. */
const LAYER_HOME: Record<LayerKey, string> = {
    orders: "/commerce/orders",
    collections: "/billing/subscriptions",
    subscriptions: "/billing/subscriptions",
    invoices: "/billing/invoices",
    bookings: "/bookings",
    classes: "/bookings",
    payments: "/billing/invoices",
};

/** Bookings and classes live in the diary, which opens on the day itself. */
function moreHref(layer: LayerKey, date: string): string {
    return layer === "bookings" || layer === "classes"
        ? `/bookings?date=${encodeURIComponent(date)}&layout=day`
        : LAYER_HOME[layer];
}

/**
 * What can be made on the day — "Book on this day", "New order" — the
 * first as the day's one main action, the rest beside it. Under the title
 * in the desk's side panel; at the foot of a phone's sheet (the boards).
 */
export function DayActions({
    shortcuts,
    className,
}: {
    shortcuts: Shortcut[];
    className?: string;
}) {
    if (shortcuts.length === 0) return null;
    return (
        <div className={cn("grid gap-2", className)}>
            {shortcuts.map((s, i) => (
                <Button
                    key={s.label}
                    asChild
                    variant={i === 0 ? "default" : "outline"}
                    className="w-full gap-1.5 max-[759px]:h-12 max-[759px]:text-[15px]"
                >
                    <Link href={s.href}>
                        <Plus aria-hidden className="size-4" />
                        {s.label}
                    </Link>
                </Button>
            ))}
        </div>
    );
}

/**
 * One day, grouped by layer, each thing a row that opens its record: its
 * time, who it is for and what (bookings U13, BKMOverviewMonth's day sheet
 * and BKDCalMonth's side panel). The side panel on the desk, a sheet from
 * the right between 760 and 1100px, and a sheet from the foot of a phone —
 * one body, so the three cannot say different things. Under the title, who
 * is off or that the business is closed (E24), then one line: how many
 * things, and — for a role that reads money (`payment:read`, E23, DEC-098)
 * — what came in and went out. A layer lists five, then "3 more · open the
 * day in Bookings". A named problem — a failed renewal, a late order, an
 * overdue invoice, a no-show — shows its fix beside it (E22). Without the
 * money permission no amount is drawn anywhere on it.
 */
export function DayPanel({
    day,
    layers,
    off,
    today,
    timeZone,
    currency,
    heading,
    shortcuts = [],
    actions = true,
    can,
    money = null,
    amounts = true,
    offLine = null,
}: {
    day: CalendarDay;
    layers: LayerStyle[];
    off: Off;
    today: string;
    timeZone: string;
    currency: string | null;
    /** The title's element: a plain heading, or the sheet's own title. */
    heading: (title: string) => React.ReactNode;
    /** "Book on this day", "New order": what this person may make on it. */
    shortcuts?: Shortcut[];
    /** Draw them under the title; false where the sheet's foot holds them. */
    actions?: boolean;
    /** The fixes this person may make to a named problem (E22). */
    can: ProblemCan;
    /** `payment:read` only (E23): the month's money. Null: none drawn. */
    money?: CalendarCash | null;
    /** May see amounts at all (`payment:read`, DEC-098). */
    amounts?: boolean;
    /** Who is off, or the business closed, that day (E24). */
    offLine?: string | null;
}) {
    const entries = money?.shown.filter((e) => e.date === day.date) ?? [];
    const cash = money && amounts ? dayMoney(entries, money.currency) : null;
    const n = dayCount(day, layers, off);
    // A shop's renewals are subscriptions; a diary, memberships.
    const shop = layers.some((l) => l.key === "orders");
    const ahead = day.date > today;
    const groups = layers.filter(
        (l) => !off[l.key] && (day.layers[l.key]?.count ?? 0) > 0,
    );
    // Something is there, only under a layer switched off.
    const hidden = layers.some(
        (l) => off[l.key] && (day.layers[l.key]?.count ?? 0) > 0,
    );

    return (
        <>
            {heading(
                formatDay(day.date, { today, weekday: "short" }) +
                    (day.date === today ? " · today" : ""),
            )}
            {offLine ? (
                <p className="mt-[3px] text-[12.5px] text-neutral-600 dark:text-muted-foreground">
                    {offLine}
                </p>
            ) : null}
            <p
                data-day-line=""
                className="mt-0.5 min-h-[1lh] text-[12.5px] text-muted-foreground max-[759px]:text-[13px]"
            >
                {n > 0
                    ? `${count(n, "thing")}${ahead ? " coming up" : ""}`
                    : ""}
                {cash ? (
                    <>
                        {n > 0 ? " · " : ""}In{" "}
                        <span className="tabular-nums">{cash.in}</span> ·{" "}
                        <span
                            className={
                                cash.hasOut
                                    ? "text-destructive-subtle-foreground"
                                    : undefined
                            }
                        >
                            Out <span className="tabular-nums">{cash.out}</span>
                        </span>
                        {cash.due ? (
                            <>
                                {" "}
                                · Due{" "}
                                <span className="tabular-nums">{cash.due}</span>
                            </>
                        ) : null}
                    </>
                ) : null}
            </p>
            {cash?.why ? (
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {cash.why}
                </p>
            ) : null}
            {actions ? (
                <DayActions shortcuts={shortcuts} className="mb-1.5 mt-3" />
            ) : null}
            {groups.length === 0 ? (
                <EmptyState
                    size="inline"
                    className="py-2.5"
                    title={
                        hidden
                            ? "Nothing on this day for what you're showing"
                            : day.date >= today
                              ? "Nothing on this day yet"
                              : "Nothing happened on this day"
                    }
                />
            ) : null}
            {groups.map((layer) => {
                const cell = day.layers[layer.key];
                if (!cell) return null;
                // With money: what the layer took, is due and failed (E23);
                // without it, the amounts the items carry (a booking's
                // price) — and nothing at all without the permission.
                const total =
                    money && amounts
                        ? groupMoney(
                              entries.filter((e) => e.layer === layer.key),
                              money.currency,
                          )
                        : null;
                const sum =
                    amounts && total === null
                        ? itemsTotal(cell.items, cell.count, currency)
                        : null;
                const more =
                    cell.count - Math.min(cell.items.length, PER_GROUP);
                return (
                    <section key={layer.key} className="mt-3">
                        <h3 className="label mb-0.5 flex items-center gap-2">
                            <span
                                aria-hidden
                                className={cn(
                                    "inline-block size-2.5 rounded-[3px]",
                                    TONE_FILL[layer.tone],
                                )}
                            />
                            {layer.label} · {cell.count}
                            <span className="flex-1" />
                            {total ? (
                                <span className="text-[12.5px] font-semibold normal-case tabular-nums tracking-normal text-foreground">
                                    {total}
                                </span>
                            ) : sum !== null && currency ? (
                                <span className="text-[12.5px] font-semibold normal-case tabular-nums tracking-normal text-foreground">
                                    {wholeMoney(sum, currency)}
                                </span>
                            ) : null}
                        </h3>
                        <ul>
                            {cell.items.slice(0, PER_GROUP).map((item) => {
                                const row = dayRow(layer.key, item, {
                                    timeZone,
                                    ahead,
                                });
                                // A named problem carries its fix (E22). The
                                // whole row opens where the fix is made.
                                const problem = problemOf(layer.key, item, {
                                    date: day.date,
                                    today,
                                });
                                const action = problem
                                    ? problemAction(problem, { can, shop })
                                    : null;
                                return (
                                    <li key={item.id}>
                                        <Link
                                            href={row.href}
                                            className="flex min-h-[52px] items-center gap-2.5 border-b border-border/70 py-2 text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted/70 min-[760px]:min-h-0 min-[760px]:gap-3"
                                        >
                                            <span className="w-[62px] flex-none text-[13px] font-semibold tabular-nums min-[760px]:font-normal min-[760px]:text-muted-foreground">
                                                {row.time}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[14px] font-semibold min-[760px]:text-[13.5px]">
                                                    {row.title}
                                                </span>
                                                {row.sub ? (
                                                    <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                                                        {row.sub}
                                                    </span>
                                                ) : null}
                                            </span>
                                            {row.flag ? (
                                                <Badge
                                                    variant={
                                                        row.flag.tone === "bad"
                                                            ? "error"
                                                            : "draft"
                                                    }
                                                    size="sm"
                                                    className="shrink-0"
                                                >
                                                    {row.flag.label}
                                                </Badge>
                                            ) : null}
                                            {action ? (
                                                <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-foreground underline decoration-border-strong underline-offset-4">
                                                    {action}
                                                </span>
                                            ) : null}
                                            {amounts &&
                                            item.amount !== undefined &&
                                            item.currency ? (
                                                <span className="shrink-0 text-[13px] font-semibold tabular-nums">
                                                    {wholeMoney(
                                                        toMajor(item.amount),
                                                        item.currency,
                                                    )}
                                                </span>
                                            ) : null}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                        {more > 0 ? (
                            <Link
                                href={moreHref(layer.key, day.date)}
                                className="inline-flex min-h-11 items-center text-[13px] font-semibold text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast hover:decoration-foreground active:text-muted-foreground min-[760px]:min-h-9"
                            >
                                {layer.key === "bookings" ||
                                layer.key === "classes"
                                    ? `${more} more · open the day in Bookings`
                                    : `${more} more · open ${layer.label}`}
                            </Link>
                        ) : null}
                    </section>
                );
            })}
        </>
    );
}
