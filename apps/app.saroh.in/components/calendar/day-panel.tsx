import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";

import type { LayerStyle, Off } from "@/lib/calendar/layers";
import {
    dayCount,
    dayTitle,
    describeItem,
    itemsTotal,
} from "@/lib/calendar/layers";
import { toMajor, wholeMoney } from "@/lib/calendar/money";
import type { ProblemCan } from "@/lib/calendar/problems";
import { problemAction, problemOf } from "@/lib/calendar/problems";
import type { Shortcut } from "@/lib/calendar/range";
import type { CalendarDay, LayerKey } from "@/lib/calendar/types";

import { TONE_FILL } from "./tones";

/** How many of a layer's things the panel lists before pointing onward. */
const PER_GROUP = 12;

/** Where the rest of a layer lives, when a day holds more than the panel lists. */
const LAYER_HOME: Record<LayerKey, string> = {
    orders: "/commerce/orders",
    collections: "/billing/subscriptions",
    subscriptions: "/billing/subscriptions",
    invoices: "/billing/invoices",
    bookings: "/bookings",
    classes: "/bookings",
    payments: "/billing/invoices",
};

/**
 * One day, grouped by layer, each thing a link to its record. The side panel
 * on the desk, the sheet between 760 and 1100px, and the list under the month
 * on a phone — one body, so the three cannot say different things. A day
 * from today offers what can be made on it (E21), and a named problem —
 * a failed renewal, a late order, an overdue invoice, a no-show — shows
 * its fix beside it (E22).
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
    can,
}: {
    day: CalendarDay;
    layers: LayerStyle[];
    off: Off;
    today: string;
    timeZone: string;
    currency: string | null;
    /** The title's element: a plain heading, or the sheet's own title. */
    heading: (title: string) => React.ReactNode;
    /** "New order", "Book": what this person may make on this day. */
    shortcuts?: Shortcut[];
    /** The fixes this person may make to a named problem (E22). */
    can: ProblemCan;
}) {
    const n = dayCount(day, layers, off);
    // A shop's renewals are subscriptions; a diary's, memberships.
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
                dayTitle(day.date, today) +
                    (day.date === today ? " · today" : ""),
            )}
            <p className="mb-2.5 mt-0.5 min-h-[1lh] text-[12.5px] text-muted-foreground">
                {n > 0
                    ? `${n} ${n === 1 ? "thing" : "things"}${ahead ? " coming up" : ""}`
                    : ""}
            </p>
            {shortcuts.length > 0 ? (
                <div className="mb-1 mt-2 flex flex-wrap gap-1.5">
                    {shortcuts.map((s) => (
                        <Button
                            key={s.label}
                            asChild
                            variant="outline"
                            size="sm"
                            className="gap-1.5 px-3 text-[12.5px] font-semibold"
                        >
                            <Link href={s.href}>
                                <Plus
                                    aria-hidden
                                    className="size-3"
                                    strokeWidth={2.2}
                                />
                                {s.label}
                            </Link>
                        </Button>
                    ))}
                </div>
            ) : null}
            {groups.length === 0 ? (
                <p className="py-2.5 text-[13px] text-muted-foreground">
                    {hidden
                        ? "Nothing on this day for the layers you have on."
                        : day.date >= today
                          ? "Nothing on this day yet."
                          : "Nothing happened on this day."}
                </p>
            ) : null}
            {groups.map((layer) => {
                const cell = day.layers[layer.key];
                if (!cell) return null;
                const total = itemsTotal(cell.items, cell.count, currency);
                const more =
                    cell.count - Math.min(cell.items.length, PER_GROUP);
                return (
                    <section key={layer.key} className="mt-2">
                        <h3 className="mb-1 flex items-center gap-[7px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            <span
                                aria-hidden
                                className={cn(
                                    "inline-block size-[9px] rounded-[3px]",
                                    TONE_FILL[layer.tone],
                                )}
                            />
                            {layer.label} · {cell.count}
                            <span className="flex-1" />
                            {total !== null && currency ? (
                                <span className="font-medium normal-case tabular-nums tracking-normal">
                                    {wholeMoney(total, currency)}
                                </span>
                            ) : null}
                        </h3>
                        <ul>
                            {cell.items.slice(0, PER_GROUP).map((item) => {
                                const line = describeItem(layer.key, item, {
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
                                            href={line.href}
                                            className="-mx-2 flex items-baseline gap-2 rounded-lg px-2 py-[7px] text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/70"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13px] font-semibold">
                                                    {line.title}
                                                </span>
                                                {line.sub ? (
                                                    <span className="block text-[12px] text-muted-foreground">
                                                        {line.sub}
                                                    </span>
                                                ) : null}
                                            </span>
                                            {line.flag ? (
                                                <Badge
                                                    variant={
                                                        line.flag.tone === "bad"
                                                            ? "error"
                                                            : "draft"
                                                    }
                                                    className="shrink-0 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
                                                >
                                                    {line.flag.label}
                                                </Badge>
                                            ) : null}
                                            {action ? (
                                                <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold text-brand underline underline-offset-2">
                                                    {action}
                                                </span>
                                            ) : null}
                                            {item.amount !== undefined &&
                                            item.currency ? (
                                                <span className="shrink-0 text-[12.5px] font-semibold tabular-nums">
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
                                href={LAYER_HOME[layer.key]}
                                className="mt-1 block text-[12px] font-medium text-brand hover:text-foreground"
                            >
                                {more} more — open {layer.label}
                            </Link>
                        ) : null}
                    </section>
                );
            })}
        </>
    );
}
