"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ComponentPropsWithRef } from "react";
import { useId, useState, useTransition } from "react";

import type { GroupLine } from "@/lib/home/group-words";
import {
    groupsCountLabel,
    phoneGroupTag,
    phoneGroupTitle,
} from "@/lib/home/group-words";
import { openTotal } from "@/lib/home/inline-actions";
import { couldntCheckLine, phoneLines } from "@/lib/home/phone-home";
import type { HomeNeedGroup, HomeUnavailable } from "@/lib/home/service";

import { GROUP_ICONS } from "../need-group";
import { useInlineActions } from "../use-inline-actions";
import { NeedSheet } from "./need-sheet";

/**
 * Needs you on a phone (DEC-171, plan U17, A2, boards `HPHome`,
 * `HPStates`): one line per group, at most five (late first, then money,
 * then the rest), then "Show 2 more · review, low stock"; each line opens
 * its group in a sheet. The count beside the heading is the sum of the
 * groups, less what was done here; with a part that couldn't be read it
 * says "13 we could check", and the first line says what couldn't be
 * checked, with Try again: one message, not a banner and a line.
 */
export function PhoneNeeds({
    groups,
    total,
    inProgress,
    unavailable,
    fresh = false,
    dueToday = 0,
}: {
    groups: readonly HomeNeedGroup[];
    total: number;
    inProgress: number;
    unavailable: readonly HomeUnavailable[];
    /** Nothing sold, booked or paid yet: says what will show here. */
    fresh?: boolean;
    /** Orders due today, for the orders line's tag when none is late. */
    dueToday?: number;
}) {
    const headingId = useId();
    const actions = useInlineActions();
    const [all, setAll] = useState(false);
    const now = new Date();
    const doneHere = groups
        .flatMap((g) => g.rows)
        .filter((n) => n.id in actions.done).length;
    const partial = unavailable.length > 0;
    const said = groupsCountLabel(openTotal(total, doneHere), partial);
    const lines = phoneLines(groups);
    const shown = all ? [...lines.shown, ...lines.folded] : lines.shown;
    const couldnt = couldntCheckLine(unavailable);

    return (
        <section
            aria-labelledby={headingId}
            data-phone-needs=""
            className="grid min-w-0 gap-2"
        >
            <div className="flex items-baseline gap-2">
                <h2
                    id={headingId}
                    data-ph-unmask=""
                    className="font-display text-[17px] font-semibold tracking-[-0.02em]"
                >
                    Needs you
                </h2>
                {said ? (
                    <span
                        data-needs-count=""
                        className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-full bg-primary px-[7px] text-[11.5px] font-bold tabular-nums text-primary-foreground"
                    >
                        {partial ? said : openTotal(total, doneHere)}
                    </span>
                ) : null}
            </div>

            {groups.length === 0 && !couldnt ? (
                <p className="rounded-[14px] border border-border bg-card p-4 text-sm text-neutral-700 dark:text-muted-foreground">
                    {fresh
                        ? "New orders, bookings and enquiries show here."
                        : "Nothing needs you right now."}
                </p>
            ) : null}

            {groups.length > 0 || couldnt ? (
                <ul className="overflow-hidden rounded-[14px] border border-border bg-card">
                    {couldnt ? (
                        <li>
                            <CouldntCheck text={couldnt} />
                        </li>
                    ) : null}
                    {shown.map((group) => (
                        <li
                            key={group.kind}
                            className="border-t border-border first:border-t-0"
                        >
                            <NeedSheet
                                group={group}
                                actions={actions}
                                inProgress={inProgress}
                                trigger={
                                    <PhoneNeedLine
                                        group={group}
                                        tag={phoneGroupTag(
                                            group,
                                            now,
                                            group.kind === "ORDERS"
                                                ? dueToday
                                                : 0,
                                        )}
                                    />
                                }
                            />
                        </li>
                    ))}
                    {lines.more && !all ? (
                        <li className="border-t border-border">
                            <button
                                type="button"
                                onClick={() => setAll(true)}
                                className="flex min-h-[46px] w-full cursor-pointer items-center justify-center border-0 bg-transparent px-4 text-[13px] font-semibold text-neutral-700 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent-active dark:text-muted-foreground"
                            >
                                {lines.more}
                            </button>
                        </li>
                    ) : null}
                </ul>
            ) : null}
        </section>
    );
}

const LINE =
    "flex min-h-[54px] w-full cursor-pointer items-center gap-3 border-0 bg-transparent py-2 pl-3.5 pr-3 text-left text-foreground transition-colors duration-fast hover:bg-muted active:bg-accent-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const TAG_TONE: Record<NonNullable<GroupLine["tag"]>["tone"], string> = {
    bad: "text-destructive-subtle-foreground",
    due: "text-warning-subtle-foreground",
    info: "text-muted-foreground",
};

/**
 * A group's one line: its glyph, what to do, the tag in its own colour
 * and words ("3 late"), and a chevron. One button that opens the group's
 * sheet; Radix's props pass through so focus comes back to it.
 */
export function PhoneNeedLine({
    group,
    tag,
    className,
    ...props
}: {
    group: HomeNeedGroup;
    tag: GroupLine["tag"];
} & ComponentPropsWithRef<"button">) {
    const Icon = GROUP_ICONS[group.kind];
    return (
        <button
            type="button"
            data-phone-line={group.kind}
            {...props}
            className={cn(LINE, className)}
        >
            <Icon
                aria-hidden
                className="size-[18px] shrink-0 text-neutral-700 dark:text-muted-foreground"
            />
            <span className="min-w-0 flex-1 text-[14.5px] font-semibold [overflow-wrap:anywhere]">
                {phoneGroupTitle(group)}
            </span>
            {tag ? (
                <span
                    className={cn(
                        "shrink-0 whitespace-nowrap text-xs font-semibold",
                        TAG_TONE[tag.tone],
                    )}
                >
                    {tag.label}
                </span>
            ) : null}
            <ChevronRight
                aria-hidden
                className="size-[18px] shrink-0 text-muted-foreground"
            />
        </button>
    );
}

/**
 * "Couldn't check bills just now · Try again" (`HPStates`): the part of
 * Home that couldn't be read, said once, at the top of the list. Pressed,
 * the page reads again and the rest stays where it was.
 */
function CouldntCheck({ text }: { text: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    return (
        <button
            type="button"
            data-couldnt-check=""
            disabled={pending}
            onClick={() => start(() => router.refresh())}
            className={LINE}
        >
            <RotateCw
                aria-hidden
                className={cn(
                    "size-[18px] shrink-0 text-warning-subtle-foreground",
                    pending && "motion-safe:animate-spin",
                )}
            />
            <span className="min-w-0 flex-1 text-[14.5px] font-semibold [overflow-wrap:anywhere]">
                {text}
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-warning-subtle-foreground">
                {pending ? "Checking…" : "Try again"}
            </span>
        </button>
    );
}
