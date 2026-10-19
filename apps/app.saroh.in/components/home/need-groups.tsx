"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { TextLink } from "@saroh/ui/text-link";
import Link from "next/link";
import { useId, useState } from "react";

import { useArrivals } from "@/components/shared/use-arrivals";
import { count } from "@/lib/format/plural";
import {
    groupLine,
    groupsCountLabel,
    onItsWayLabel,
} from "@/lib/home/group-words";
import { openTotal } from "@/lib/home/inline-actions";
import { formatList, IN_PROGRESS_HREF } from "@/lib/home/needs";
import type {
    HomeNeedGroup,
    HomeNeedKind,
    HomeUnavailable,
} from "@/lib/home/service";

import { NeedGroup } from "./need-group";
import { NeedRow } from "./needs-you";
import type { InlineActions } from "./use-inline-actions";
import { useInlineActions } from "./use-inline-actions";

/**
 * Needs you on Home A, at a desk (DEC-171, plan U6, boards `HAPageD`,
 * `HAQuietD`, `HAMemberD`, `HAFailedD`): one line per kind of thing to do,
 * each opening its rows in place, under a heading that counts them all
 * ("24 things", the sum of the groups, so the header and a group never
 * disagree) and says how many orders are on their way.
 *
 * "Nothing needs you." is said only when every source was read; with a
 * part missing the list says what it couldn't check, and the count says
 * "7 things we could check".
 *
 * A group's body is U7's (`need-group-body.tsx`): until then each group
 * opens onto the rows Needs you has always drawn (`NeedRow`), with their
 * inline actions, so nothing a row offered is lost.
 */
export function NeedGroups({
    groups,
    total,
    inProgress,
    unavailable,
    next,
    fresh = false,
    dueToday = 0,
    defaultOpen = [],
}: {
    groups: readonly HomeNeedGroup[];
    /** The sum of every group's count. */
    total: number;
    /** Open orders due later (DEC-163): "and 1 order on its way". */
    inProgress: number;
    unavailable: readonly HomeUnavailable[];
    /** After "Nothing needs you.": the next booking, or the quiet. */
    next: string;
    /** Nothing sold, booked or paid yet: "Nothing needs you yet." */
    fresh?: boolean;
    /** Orders due today, for the orders group's tag when none is late. */
    dueToday?: number;
    /** The groups open when Home is opened. */
    defaultOpen?: readonly HomeNeedKind[];
}) {
    const headingId = useId();
    const [open, setOpen] = useState<ReadonlySet<HomeNeedKind>>(
        () => new Set(defaultOpen),
    );
    const actions = useInlineActions();
    const rows = groups.flatMap((g) => g.rows);
    const doneHere = rows.filter((n) => n.id in actions.done).length;
    const partial = unavailable.length > 0;
    const now = new Date();

    const toggle = (kind: HomeNeedKind) =>
        setOpen((was) => {
            const next = new Set(was);
            if (next.has(kind)) next.delete(kind);
            else next.add(kind);
            return next;
        });

    const said = groupsCountLabel(openTotal(total, doneHere), partial);
    const onItsWay = onItsWayLabel(inProgress);

    return (
        <section aria-labelledby={headingId} className="grid min-w-0 gap-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h2
                    id={headingId}
                    data-ph-unmask=""
                    className="font-display text-[19px] font-semibold leading-[1.25] tracking-[-0.02em]"
                >
                    Needs you
                </h2>
                {said ? (
                    <span className="text-[12.5px] text-muted-foreground">
                        {said}
                    </span>
                ) : null}
                {onItsWay ? (
                    <TextLink
                        href={IN_PROGRESS_HREF}
                        tone="muted"
                        className="text-[12.5px] coarse:min-h-11"
                    >
                        {groups.length > 0
                            ? onItsWay
                            : `${count(inProgress, "order")} in progress`}
                    </TextLink>
                ) : null}
            </div>

            {groups.length === 0 && !partial ? (
                <EmptyState
                    size="inline"
                    className="rounded-xl border border-border bg-card px-4 py-3.5"
                    title={
                        fresh ? "Nothing needs you yet." : "Nothing needs you."
                    }
                    description={
                        fresh
                            ? "New orders, bookings and enquiries show here."
                            : next
                    }
                />
            ) : null}

            {groups.length === 0 && partial ? (
                <p className="rounded-xl border border-border bg-card px-4 py-3.5 text-sm text-neutral-700 dark:text-muted-foreground">
                    <strong className="font-semibold text-foreground">
                        Nothing else we could check needs you.
                    </strong>{" "}
                    {formatList(unavailable.map((u) => u.label))} couldn't be
                    checked, so there may be more.
                </p>
            ) : null}

            {groups.length > 0 ? (
                <ul className="overflow-hidden rounded-xl border border-border bg-card">
                    {groups.map((group) => (
                        <NeedGroup
                            key={group.kind}
                            kind={group.kind}
                            line={groupLine(
                                group,
                                now,
                                group.kind === "ORDERS" ? dueToday : 0,
                            )}
                            href={group.href}
                            open={open.has(group.kind)}
                            onToggle={() => toggle(group.kind)}
                            actions={<GroupActions group={group} />}
                        >
                            <GroupRows group={group} actions={actions} />
                        </NeedGroup>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}

/**
 * The group's own buttons beside its tag, as the boards draw them: Open
 * orders on the orders group, See bills on the bills group. Remind all
 * (U8) and the one-press actions of the other groups (U7) join here.
 */
function GroupActions({ group }: { group: HomeNeedGroup }) {
    if (group.kind === "ORDERS") {
        return (
            <Button asChild variant="outline" size="sm">
                <Link href={group.href}>Open orders</Link>
            </Button>
        );
    }
    if (group.kind === "BILLS") {
        return (
            <Button asChild variant="ghost" size="sm">
                <Link href={group.href}>See bills</Link>
            </Button>
        );
    }
    return null;
}

/** What "4 more" names, per group. */
const MORE_NOUN: Record<HomeNeedKind, [string, string]> = {
    ORDERS: ["order", "orders"],
    BILLS: ["bill", "bills"],
    AWAITING_PAYMENT: ["booking", "bookings"],
    ENQUIRIES: ["enquiry", "enquiries"],
    PAYMENTS: ["payment", "payments"],
    REVIEWS: ["review", "reviews"],
    STOCK: ["product", "products"],
    SETUP: ["thing", "things"],
};

/**
 * The rows inside an open group: until U7's body lands, the rows Needs you
 * has always drawn, each with its inline action, and "4 more orders" to
 * the list. A seam: U7 replaces this with `NeedGroupBody`.
 */
function GroupRows({
    group,
    actions,
}: {
    group: HomeNeedGroup;
    actions: InlineActions;
}) {
    const arrivals = useArrivals(group.rows.map((n) => n.id));
    const [one, many] = MORE_NOUN[group.kind];
    return (
        <div className="border-t border-dashed border-border sm:ml-[62px]">
            <ul>
                {group.rows.map((need, i) => (
                    <NeedRow
                        key={need.id}
                        need={need}
                        first={i === 0}
                        actions={actions}
                        done={actions.done[need.id] ?? null}
                        arrived={arrivals.isNew(need.id)}
                        onTouch={() => arrivals.touch(need.id)}
                    />
                ))}
            </ul>
            {group.more > 0 ? (
                <p className="border-t border-border px-4 py-2.5">
                    <TextLink
                        href={group.href}
                        className="text-[12.5px] coarse:min-h-11"
                    >
                        {count(group.more, `more ${one}`, `more ${many}`)}
                    </TextLink>
                </p>
            ) : null}
        </div>
    );
}
