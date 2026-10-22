"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import Link from "next/link";
import { useRef } from "react";

import { arrivalProps } from "@/components/shared/live-refresh/arrival-props";
import { useArrivals } from "@/components/shared/live-refresh/use-arrivals";
import { addStockLink, moreLabel, stockNote } from "@/lib/home/group-body";
import { needLine, needTitle } from "@/lib/home/needs";
import type { HomeNeed, HomeNeedGroup } from "@/lib/home/service";

import {
    InlineButton,
    InlineConfirm,
    InlineDone,
    InlineLink,
} from "./inline-action";
import { TONE_BADGE } from "./tone";
import type { DoneRow, InlineActions } from "./use-inline-actions";
import { confirmKey } from "./use-inline-actions";

/**
 * What a Needs you group holds once it is open (DEC-171, Home plan U7,
 * boards `HANeedsD`, `HAInlineD`, `HAMemberD`, `HPSheets`): its rows, each
 * a link to its record with its inline action beside it, then "3 more
 * orders" to the list, and on low stock where stock levels are set.
 *
 * One component, two hosts: a desk opens it in place under the group's
 * line (`need-group.tsx`), a phone in a sheet (U17). It takes the group
 * and the screen's inline actions and draws; where it sits, its indent
 * and what surrounds it are the host's. `actions` comes from the host's
 * owner of Needs you (`useInlineActions`), so a confirm open in one group
 * closes another's, a done row stays done while its sheet is closed and
 * opened again, and the heading's count drops by what was done here.
 *
 * Every row keeps what it offered on the flat list: confirm in the row,
 * the hold or Undo, the struck-through result, Reply with its limit, a
 * new link to copy. Amounts are only what the API sent (DEC-098).
 */
export function NeedGroupBody({
    group,
    actions,
    className,
}: {
    group: HomeNeedGroup;
    actions: InlineActions;
    className?: string;
}) {
    const arrivals = useArrivals(group.rows.map((n) => n.id));
    const more = moreLabel(group);
    const note = stockNote(group);
    return (
        <div
            data-need-group-body={group.kind}
            className={cn("min-w-0", className)}
        >
            <ul>
                {group.rows.map((need) => (
                    <GroupRow
                        key={need.id}
                        need={need}
                        actions={actions}
                        done={actions.done[need.id] ?? null}
                        arrived={arrivals.isNew(need.id)}
                        onTouch={() => arrivals.touch(need.id)}
                    />
                ))}
            </ul>
            {more ? (
                <p className="pb-1 pt-2">
                    <TextLink
                        href={group.href}
                        className="text-[13px] coarse:inline-flex coarse:min-h-11 coarse:items-center"
                    >
                        {more}
                    </TextLink>
                </p>
            ) : null}
            {note ? (
                <p className="pb-1 pt-2 text-[12.5px] text-muted-foreground">
                    {note.text}{" "}
                    <TextLink
                        href={note.link.href}
                        className="text-[13px] coarse:inline-flex coarse:min-h-11 coarse:items-center"
                    >
                        {note.link.label}
                    </TextLink>
                </p>
            ) : null}
        </div>
    );
}

/**
 * One row inside a group, as `HANeedsD` draws it: the title and the line
 * under it are one link to the record; the tag and the action sit at the
 * end and wrap under it when narrow. Done here, the title is struck
 * through and the line under it says what happened, with Undo while there
 * is one ("Marked sent 2:14 pm · Undo", `HAInlineD`).
 */
function GroupRow({
    need,
    actions,
    done,
    arrived,
    onTouch,
}: {
    need: HomeNeed;
    actions: InlineActions;
    done: DoneRow | null;
    arrived: boolean;
    onTouch: () => void;
}) {
    const line = needLine(need);
    const firstRef = useRef<HTMLButtonElement>(null);
    const secondRef = useRef<HTMLButtonElement>(null);
    const { inline, second } = need;
    const openFirst =
        inline !== undefined && actions.open === confirmKey(need.id) && !done;
    const openSecond =
        second !== undefined &&
        actions.open === confirmKey(need.id, "second") &&
        !done;
    const confirming = openFirst || openSecond;
    const stock = addStockLink(need);
    const arrival = arrivalProps(arrived && !done, onTouch);
    return (
        <li
            {...arrival}
            data-need-row=""
            className={cn(
                "flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-border py-[9px] transition-colors duration-fast last:border-b-0",
                arrival.className,
            )}
        >
            <Link
                href={need.href}
                className="grid min-w-0 flex-[1_1_220px] content-center gap-0.5 rounded text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:min-h-11"
            >
                <span
                    className={cn(
                        "text-[13.5px] font-semibold [overflow-wrap:anywhere]",
                        done && "text-muted-foreground line-through",
                    )}
                >
                    {needTitle(need)}
                </span>
                {line ? (
                    <span className="text-pretty text-xs leading-[1.45] text-muted-foreground">
                        {line}
                    </span>
                ) : null}
            </Link>
            {done ? (
                // Under the struck title, as the design draws it.
                <span className="-mt-1 basis-full">
                    <InlineDone row={done} />
                </span>
            ) : (
                <span className="ml-auto flex flex-none flex-wrap items-center justify-end gap-2">
                    {need.tag ? (
                        <Badge variant={TONE_BADGE[need.tone]} size="sm">
                            {need.tag}
                        </Badge>
                    ) : null}
                    {!confirming && need.link ? (
                        <InlineLink link={need.link} />
                    ) : null}
                    {!confirming && stock ? (
                        <Button asChild variant="outline" size="sm">
                            <Link href={stock.href}>{stock.label}</Link>
                        </Button>
                    ) : null}
                    {!confirming && inline ? (
                        <InlineButton
                            inline={inline}
                            busy={actions.busy === need.id}
                            onOpen={() => actions.openFor(confirmKey(need.id))}
                            buttonRef={firstRef}
                        />
                    ) : null}
                    {!confirming && second ? (
                        <InlineButton
                            inline={second}
                            busy={actions.busy === need.id}
                            onOpen={() =>
                                actions.openFor(confirmKey(need.id, "second"))
                            }
                            buttonRef={secondRef}
                            quiet
                        />
                    ) : null}
                </span>
            )}
            {openFirst ? (
                <div className="basis-full">
                    <InlineConfirm
                        need={need}
                        inline={inline}
                        actions={actions}
                        onClose={() =>
                            requestAnimationFrame(() =>
                                firstRef.current?.focus(),
                            )
                        }
                    />
                </div>
            ) : null}
            {openSecond ? (
                <div className="basis-full">
                    <InlineConfirm
                        need={need}
                        inline={second}
                        which="second"
                        actions={actions}
                        onClose={() =>
                            requestAnimationFrame(() =>
                                secondRef.current?.focus(),
                            )
                        }
                    />
                </div>
            ) : null}
        </li>
    );
}
