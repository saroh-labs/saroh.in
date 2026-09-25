"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { QuickLook, QuickLookCard } from "@/components/shared/quick-look";
import { ViewerDate } from "@/components/shared/viewer-date";
import type { ActivityLine } from "@/lib/settings/activity";
import type { ActivityDetail } from "@/lib/settings/activity-detail";

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
            <section
                aria-label="Activity"
                className="max-w-[760px] overflow-hidden rounded-xl border border-border bg-card"
            >
                <ol>
                    {entries.map(({ line }) => (
                        <li
                            key={line.id}
                            className="relative grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-t border-border/70 px-[18px] py-[11px] text-[13px] transition-colors duration-fast first:border-t-0 hover:bg-muted min-[480px]:grid-cols-[96px_minmax(0,1fr)_auto]"
                        >
                            <ViewerDate
                                iso={line.at}
                                variant="recent"
                                className="tabular-nums text-muted-foreground"
                            />
                            <button
                                type="button"
                                onClick={() => setOpenId(line.id)}
                                aria-haspopup="dialog"
                                className="min-w-0 text-pretty text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                            >
                                <strong className="font-semibold">
                                    {line.who}
                                </strong>{" "}
                                {line.what}
                                <span className="sr-only">
                                    . Show the details
                                </span>
                            </button>
                            <Link
                                href={line.where.href}
                                className="relative z-[1] col-start-2 justify-self-start rounded-sm text-[12.5px] font-semibold text-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[480px]:col-start-auto"
                            >
                                {line.where.label}
                            </Link>
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

const NARROW = "(max-width: 759px)";

/** Whether the screen is phone-width; false on the server. */
function useNarrow(): boolean {
    return useSyncExternalStore(
        (notify) => {
            const query = window.matchMedia(NARROW);
            query.addEventListener("change", notify);
            return () => query.removeEventListener("change", notify);
        },
        () => window.matchMedia(NARROW).matches,
        () => false,
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
                <Button
                    asChild
                    className="h-[38px] min-w-[160px] flex-1 rounded-[10px] text-[13.5px]"
                >
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
