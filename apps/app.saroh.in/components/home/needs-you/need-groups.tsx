"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { TextLink } from "@saroh/ui/text-link";
import Link from "next/link";
import type { ReactNode } from "react";
import { useId, useMemo, useState } from "react";

import { count } from "@/lib/format/plural";
import { deskChequesAt, totalWithCheques } from "@/lib/home/cheques";
import type { GroupOneAction } from "@/lib/home/group-body";
import {
    emptiedLine,
    groupEmptied,
    groupOneAction,
} from "@/lib/home/group-body";
import {
    groupLine,
    groupsCountLabel,
    onItsWayLabel,
} from "@/lib/home/group-words";
import { openTotal } from "@/lib/home/inline-actions";
import { formatList, IN_PROGRESS_HREF } from "@/lib/home/needs";
import { REMIND_ALL_KEY, remindLine } from "@/lib/home/remind-all";
import type {
    HomeChequesWaiting,
    HomeNeedGroup,
    HomeNeedKind,
    HomeUnavailable,
} from "@/lib/home/service";

import { DeskChequesLine } from "./cheques-line";
import { NeedGroup } from "./need-group";
import { NeedGroupBody } from "./need-group-body";
import { RemindAll } from "./remind-all";
import type { InlineActions } from "./use-inline-actions";
import { confirmKey, useInlineActions } from "./use-inline-actions";

/** The group Home opens with: what to pack or hand over (plan U7). */
const OPEN_FIRST: readonly HomeNeedKind[] = ["ORDERS"];

/**
 * Needs you on Home A, at a desk (DEC-171, plan U6 and U7, boards
 * `HAPageD`, `HANeedsD`, `HAInlineD`, `HAQuietD`, `HAMemberD`,
 * `HAFailedD`): one line per kind of thing to do, each opening its rows in
 * place, under a heading that counts them all ("24 things", the sum of the
 * groups, so the header and a group never disagree) and says how many
 * orders are on their way.
 *
 * The orders group opens with Home; the others are one line with their
 * one action and open on a press. A group's rows are `NeedGroupBody`, the
 * same body a phone hosts in a sheet (U17), so no action is written twice.
 * A group whose every thing was done here folds to "All done", and the
 * heading's count drops with each.
 *
 * "Nothing needs you." is said only when every source was read; with a
 * part missing the list says what it couldn't check, and the count says
 * "7 things we could check".
 *
 * "Cheques not in the bank" (plan U18, DEC-173) is one line in the money
 * group, under the bills group or in its place, only while a cheque
 * waits; it counts as one thing and opens the invoices list filtered to
 * those cheques. Home never marks a cheque.
 */
export function NeedGroups({
    groups,
    total,
    inProgress,
    unavailable,
    next,
    fresh = false,
    dueToday = 0,
    defaultOpen = OPEN_FIRST,
    remindAll,
    cheques = null,
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
    /**
     * The bills group's Remind all (U8), drawn before See bills. It is
     * handed Home's inline actions, so its ten-second hold is the one slot
     * every other held action on Home shares.
     */
    remindAll?: (group: HomeNeedGroup, actions: InlineActions) => ReactNode;
    /** Cheques not in the bank (U18); null while none waits. */
    cheques?: HomeChequesWaiting | null;
}) {
    const headingId = useId();
    const [open, setOpen] = useState<ReadonlySet<HomeNeedKind>>(
        () => new Set(defaultOpen),
    );
    const actions = useInlineActions();
    const doneIds = useMemo(
        () => new Set(Object.keys(actions.done)),
        [actions.done],
    );
    const rows = groups.flatMap((g) => g.rows);
    const doneHere = rows.filter((n) => doneIds.has(n.id)).length;
    const partial = unavailable.length > 0;
    const now = new Date();

    // A group emptied here folds, once; it can be opened again to see
    // what was done, and Undo there brings it back.
    //
    // Folded while rendering, in the same render that marks its last row
    // done, never in an effect after paint: an effect lets the screen draw
    // the open group with the held row and its Undo for a frame, then pulls
    // it away, so a press on that Undo lands on nothing (DEV_LEARNINGS,
    // 20 Oct). React re-renders before committing when state is set here.
    const emptied = groups
        .filter((g) => groupEmptied(g, doneIds))
        .map((g) => g.kind);
    const emptiedKey = emptied.join(",");
    const [foldedKey, setFoldedKey] = useState("");
    if (foldedKey !== emptiedKey) {
        const was = new Set(foldedKey === "" ? [] : foldedKey.split(","));
        const newly = emptied.filter((k) => !was.has(k));
        setFoldedKey(emptiedKey);
        if (newly.length > 0) {
            setOpen((open) => {
                const next = new Set(open);
                for (const k of newly) next.delete(k);
                return next;
            });
        }
    }

    const toggle = (kind: HomeNeedKind) =>
        setOpen((was) => {
            const next = new Set(was);
            if (next.has(kind)) next.delete(kind);
            else next.add(kind);
            return next;
        });

    /** A closed group's one action: open it, and that row's confirm. */
    const start = (kind: HomeNeedKind, rowId: string) => {
        setOpen((was) => new Set(was).add(kind));
        actions.openFor(confirmKey(rowId));
    };

    const said = groupsCountLabel(
        openTotal(totalWithCheques(total, cheques), doneHere),
        partial,
    );
    const lines = groups.length > 0 || cheques !== null;
    const chequesAt = deskChequesAt(groups);
    const chequesLine = cheques ? (
        <DeskChequesLine key="cheques" cheques={cheques} />
    ) : null;
    // Remind all waiting its ten seconds, or sent (U8, `HARemindUndoD`).
    const remind =
        REMIND_ALL_KEY in actions.done
            ? actions.done[REMIND_ALL_KEY].remind
            : undefined;
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
                        {lines
                            ? onItsWay
                            : `${count(inProgress, "order")} in progress`}
                    </TextLink>
                ) : null}
            </div>

            {!lines && !partial ? (
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

            {!lines && partial ? (
                <p className="rounded-xl border border-border bg-card px-4 py-3.5 text-sm text-neutral-700 dark:text-muted-foreground">
                    <strong className="font-semibold text-foreground">
                        Nothing else we could check needs you.
                    </strong>{" "}
                    {formatList(unavailable.map((u) => u.label))} couldn't be
                    checked, so there may be more.
                </p>
            ) : null}

            {lines ? (
                <ul className="overflow-hidden rounded-xl border border-border bg-card">
                    {groups.slice(0, chequesAt).map(drawGroup)}
                    {chequesLine}
                    {groups.slice(chequesAt).map(drawGroup)}
                </ul>
            ) : null}
        </section>
    );

    function drawGroup(group: HomeNeedGroup) {
        const isOpen = open.has(group.kind);
        const gone = emptied.includes(group.kind);
        return (
            <NeedGroup
                key={group.kind}
                kind={group.kind}
                line={
                    gone
                        ? emptiedLine(group.kind)
                        : remindLine(
                              groupLine(
                                  group,
                                  now,
                                  group.kind === "ORDERS" ? dueToday : 0,
                              ),
                              group.kind === "BILLS" ? remind : undefined,
                          )
                }
                href={group.href}
                open={isOpen}
                onToggle={() => toggle(group.kind)}
                actions={
                    gone ? null : (
                        <GroupActions
                            group={group}
                            open={isOpen}
                            one={groupOneAction(group, doneIds)}
                            onStart={(rowId) => start(group.kind, rowId)}
                            remindAll={
                                remind
                                    ? undefined
                                    : (g) =>
                                          remindAll
                                              ? remindAll(g, actions)
                                              : remindAllOf(g, actions)
                            }
                        />
                    )
                }
            >
                <NeedGroupBody
                    group={group}
                    actions={actions}
                    className="mb-1.5 border-t border-dashed border-border pl-3.5 pr-3 sm:ml-[62px] sm:pl-0 sm:pr-2.5"
                />
            </NeedGroup>
        );
    }
}

/**
 * Remind all (U8) on the bills group, for whoever the API sent its bills
 * to (`group.remind`, `invoice:write`); nothing for anyone else.
 */
export function remindAllOf(
    group: HomeNeedGroup,
    actions: InlineActions,
): ReactNode {
    return group.remind?.invoiceIds.length ? (
        <RemindAll group={group} actions={actions} />
    ) : null;
}

/**
 * The group's own buttons beside its tag, as the boards draw them: Open
 * orders on the orders group; Remind all (U8, through `remindAll`) and See
 * bills on the bills group; on the others, while closed, their one action
 * ("Send payment link", "Reply", "Retry by payment link", "Add stock",
 * `HAFailedD`), which opens the group and that row's confirm in place.
 * Open, the rows carry their own actions, so the one action steps aside.
 */
export function GroupActions({
    group,
    open,
    one,
    onStart,
    remindAll,
}: {
    group: HomeNeedGroup;
    open: boolean;
    one: GroupOneAction | null;
    onStart: (rowId: string) => void;
    remindAll?: (group: HomeNeedGroup) => ReactNode;
}) {
    if (group.kind === "ORDERS") {
        return (
            <Button asChild variant="outline" size="sm">
                <Link href={group.href}>Open orders</Link>
            </Button>
        );
    }
    if (group.kind === "BILLS") {
        return (
            <>
                {/* U8's seam: Remind all sits before See bills. */}
                {remindAll ? remindAll(group) : null}
                <Button asChild variant="ghost" size="sm">
                    <Link href={group.href}>See bills</Link>
                </Button>
            </>
        );
    }
    if (open || !one) return null;
    if (one.kind === "link") {
        return (
            <Button asChild variant="outline" size="sm">
                <Link href={one.href}>{one.label}</Link>
            </Button>
        );
    }
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onStart(one.rowId)}
        >
            {one.label}
        </Button>
    );
}
