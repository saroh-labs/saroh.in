"use client";

import { Button } from "@saroh/ui/button";
import { TextLink } from "@saroh/ui/text-link";
import Link from "next/link";
import type { ReactElement } from "react";
import { useState } from "react";

import { onItsWayLabel, phoneGroupTitle } from "@/lib/home/group-words";
import { IN_PROGRESS_HREF } from "@/lib/home/needs";
import { REMIND_ALL_KEY, remindLine } from "@/lib/home/remind-all";
import type { HomeNeedGroup } from "@/lib/home/service";

import { groupOpenAll } from "@/lib/home/group-body";

import { NeedGroupBody } from "@/components/home/needs-you/need-group-body";
import { RemindAll } from "@/components/home/needs-you/remind-all";
import type { RemindAllState } from "@/lib/home/remind-all";

import type { InlineActions } from "@/components/home/needs-you/use-inline-actions";
import { HomeSheet } from "./home-sheet";

/**
 * One Needs you group in a sheet, on a phone (DEC-171, plan U17, board
 * `HPSheets`): the group's line names it, and its rows open here with
 * every inline action the desk has (Mark sent and its Undo, Send
 * reminder, Reply with its limit, Retry by payment link, Refund, review
 * reply, Add stock). The body is the desk's own (`NeedGroupBody`, U7), so
 * no action is written twice; `actions` is the one `useInlineActions()`
 * the list owns, so a row done in a sheet stays done when it is opened
 * again, one confirm is open at a time across sheets, and the heading's
 * count drops by what was done.
 *
 * Its foot is the group's way to the whole list (`groupOpenAll`): Open all
 * orders, See bills, Open bookings, Set stock levels… On the bills, Remind
 * all (U8) sits beside See bills for whoever the API sent its bills to;
 * while the reminders wait their ten seconds the foot says who they go to
 * in its place, and the toast holds Undo.
 */
export function NeedSheet({
    group,
    actions,
    trigger,
    inProgress,
}: {
    group: HomeNeedGroup;
    actions: InlineActions;
    /** The group's line, which opens it and has focus back on closing. */
    trigger: ReactElement;
    /** Open orders due later: "and 1 order on its way", orders only. */
    inProgress: number;
}) {
    const [open, setOpen] = useState(false);
    const onItsWay = group.kind === "ORDERS" ? onItsWayLabel(inProgress) : "";
    const held =
        group.kind === "BILLS" && REMIND_ALL_KEY in actions.done
            ? actions.done[REMIND_ALL_KEY]
            : undefined;
    const foot = sheetFoot(group, actions, held?.remind, held?.undo);
    return (
        <HomeSheet
            name={group.kind}
            open={open}
            onOpenChange={setOpen}
            eyebrow="Needs you"
            title={phoneGroupTitle(group)}
            trigger={trigger}
            foot={foot}
        >
            {group.kind === "BILLS" && group.late > 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                    {group.late} overdue, oldest first.
                </p>
            ) : null}
            <NeedGroupBody
                group={group}
                actions={actions}
                className="overflow-hidden rounded-xl border border-border bg-card px-4 pb-2"
            />
            {onItsWay ? (
                <TextLink
                    href={IN_PROGRESS_HREF}
                    tone="muted"
                    className="justify-self-start text-[12.5px] coarse:min-h-11"
                >
                    {onItsWay}
                </TextLink>
            ) : null}
        </HomeSheet>
    );
}

/** The group's own way out to its list, as the boards draw each foot. */
function sheetFoot(
    group: HomeNeedGroup,
    actions: InlineActions,
    remind: RemindAllState | undefined,
    undo: (() => void) | undefined,
) {
    const all = groupOpenAll(group);
    const offers = group.kind === "BILLS" && !!group.remind?.invoiceIds.length;
    if (!offers) {
        return (
            <Button asChild variant="outline" className="w-full">
                <Link href={all.href}>{all.label}</Link>
            </Button>
        );
    }
    const line = remind
        ? remindLine({ title: "", sub: null, tag: null }, remind)
        : null;
    return (
        <>
            <Button asChild variant="outline" className="flex-1">
                <Link href={all.href}>{all.label}</Link>
            </Button>
            {line ? (
                <p
                    data-remind-status=""
                    role="status"
                    className="min-w-0 flex-[2_1_0] text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]"
                >
                    {line.sub}
                    {/* The toast's Undo sits behind this sheet: the same
                        Undo, here, as a done row's is (`HPSheets`). */}
                    {remind?.phase === "held" && undo ? (
                        <>
                            {" · "}
                            <Button
                                type="button"
                                variant="link"
                                size="inline"
                                onClick={undo}
                            >
                                Undo
                            </Button>
                        </>
                    ) : null}
                </p>
            ) : (
                <RemindAll group={group} actions={actions} inSheet />
            )}
        </>
    );
}
