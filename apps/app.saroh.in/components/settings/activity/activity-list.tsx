"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useState } from "react";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { QuickLook, QuickLookCard } from "@/components/shared/forms/quick-look";
import { listTable } from "@/components/shared/lists/list-toolbar";
import { useNarrow } from "@/lib/hooks/use-narrow";
import type { ActivityLine } from "@/lib/settings/activity";
import type { ActivityDetail } from "@/lib/settings/activity-detail";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";

export interface ActivityEntry {
    line: ActivityLine;
    detail: ActivityDetail;
}

/**
 * Settings › Activity ("Saroh Settings" design): one ruled card, 760px at
 * most, a line per change — when, who and what, and a link to where it
 * happened. The time is the viewer's own ("Today 09:14"), as a log reads.
 *
 * Below 480px the where-link drops under the sentence rather than squeezing
 * it: the sentence is the thing being read.
 *
 * The row opens a sheet with the whole change (#509): its sentence is a
 * button that covers the row, and the where-link sits above it, so a click
 * on the link still goes straight to the setting. The sheet comes from the
 * right on a desk and from the bottom under 760px.
 */
export function ActivityList({
    entries,
}: {
    entries: readonly ActivityEntry[];
}) {
    const [openId, setOpenId] = useState<string | null>(null);
    const open = entries.find((e) => e.line.id === openId) ?? null;
    const narrow = useNarrow();

    return (
        <>
            <section aria-label="Activity" className={listTable.card}>
                <ol>
                    {entries.map(({ line }) => (
                        <li
                            key={line.id}
                            // The first column fits "Today, 12:30 pm"
                            // on one line: at 96px the 12-hour clock
                            // broke it after the comma.
                            className={cn(
                                "relative grid grid-cols-[112px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-[13px] min-[480px]:grid-cols-[112px_minmax(0,1fr)_auto]",
                                listTable.row,
                            )}
                        >
                            <ViewerDate
                                iso={line.at}
                                variant="recent"
                                className={cn(
                                    listTable.time,
                                    "text-muted-foreground",
                                )}
                            />
                            <button
                                type="button"
                                onClick={() => setOpenId(line.id)}
                                aria-haspopup="dialog"
                                className="min-w-0 text-pretty text-left underline-offset-2 after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring active:text-muted-foreground"
                            >
                                <strong className="font-semibold">
                                    {line.who}
                                </strong>{" "}
                                {line.what}
                                <span className="sr-only">
                                    . Show the details
                                </span>
                            </button>
                            <TextLink
                                href={line.where.href}
                                className="relative z-[1] col-start-2 justify-self-start text-[12.5px] min-[480px]:col-start-auto"
                            >
                                {line.where.label}
                            </TextLink>
                        </li>
                    ))}
                </ol>
            </section>
            <ActivitySheet
                entry={open}
                side={narrow ? "bottom" : "right"}
                onClose={() => setOpenId(null)}
            />
        </>
    );
}

function ActivitySheet({
    entry,
    side,
    onClose,
}: {
    entry: ActivityEntry | null;
    side: "right" | "bottom";
    onClose: () => void;
}) {
    const onOpenChange = (next: boolean) => (!next ? onClose() : null);
    if (!entry) {
        return (
            <QuickLook
                open={false}
                onOpenChange={onOpenChange}
                side={side}
                title=""
                description=""
            >
                {null}
            </QuickLook>
        );
    }
    const { line, detail } = entry;
    const sentence = `${line.who} ${line.what}`;
    return (
        <QuickLook
            open
            onOpenChange={onOpenChange}
            side={side}
            title={sentence}
            // The whole sentence, wrapped: it is what the sheet is about.
            titleClassName="text-clip whitespace-normal text-pretty font-display text-[16px] font-semibold tracking-[-0.015em]"
            description={`${sentence}, ${detail.when}.`}
            footer={
                <Button asChild className="min-w-[160px] flex-1">
                    <Link href={line.where.href}>Open {line.where.label}</Link>
                </Button>
            }
        >
            <QuickLookCard label="When">
                <p className="text-[13.5px] tabular-nums">{detail.when}</p>
            </QuickLookCard>
            <QuickLookCard label="Who">
                <p className="text-[13.5px] font-semibold">{detail.who.name}</p>
                {detail.who.email ? (
                    <p className="break-all text-[13px] text-muted-foreground">
                        {detail.who.email}
                    </p>
                ) : null}
                <p className="mt-1 text-[13px] text-muted-foreground">
                    {detail.who.role
                        ? `${detail.who.role} now`
                        : detail.who.gone
                          ? "No longer on the team"
                          : null}
                </p>
            </QuickLookCard>
            {detail.changes.length > 0 ? (
                <QuickLookCard label="What changed">
                    <dl className="grid gap-2.5">
                        {detail.changes.map((change, i) => (
                            <div
                                key={`${change.label}-${i}`}
                                className="grid gap-0.5"
                            >
                                <dt className="text-[12.5px] text-muted-foreground">
                                    {change.label}
                                </dt>
                                <dd className="text-pretty text-[13.5px]">
                                    <ChangeText
                                        before={change.before}
                                        after={change.after}
                                    />
                                </dd>
                            </div>
                        ))}
                    </dl>
                    {detail.withoutValues ? (
                        <p className="mt-3 text-[12.5px] text-muted-foreground">
                            Earlier changes were recorded without their values.
                        </p>
                    ) : null}
                </QuickLookCard>
            ) : null}
        </QuickLook>
    );
}

/** "INV → RC", the one value, or "Changed" when none was kept. */
function ChangeText({
    before,
    after,
}: {
    before: string | null;
    after: string | null;
}) {
    if (before === null && after === null) {
        return <span className="text-muted-foreground">Changed</span>;
    }
    if (before === null) return <>{after}</>;
    return (
        <>
            <span className="text-muted-foreground">{before}</span>
            <span aria-hidden> → </span>
            <span className="sr-only"> to </span>
            {after ?? "Not set"}
        </>
    );
}
