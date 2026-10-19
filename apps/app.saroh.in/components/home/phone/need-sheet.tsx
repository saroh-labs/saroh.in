"use client";

import { Button } from "@saroh/ui/button";
import { TextLink } from "@saroh/ui/text-link";
import Link from "next/link";
import type { ReactElement } from "react";
import { useState } from "react";

import { onItsWayLabel, phoneGroupTitle } from "@/lib/home/group-words";
import { IN_PROGRESS_HREF } from "@/lib/home/needs";
import type { HomeNeedGroup } from "@/lib/home/service";

import { groupOpenAll } from "@/lib/home/group-body";

import { NeedGroupBody } from "../need-group-body";
import type { InlineActions } from "../use-inline-actions";
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
 * orders, See bills, Open bookings, Set stock levels…
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
    const foot = sheetFoot(group);
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
function sheetFoot(group: HomeNeedGroup) {
    const all = groupOpenAll(group);
    return (
        <Button asChild variant="outline" className="w-full">
            <Link href={all.href}>{all.label}</Link>
        </Button>
    );
}
