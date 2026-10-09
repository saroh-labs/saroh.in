import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { PausedView } from "@/lib/billing/paused";
import { PLAN_AND_BILLING_HREF, pausedBanner } from "@/lib/billing/paused";

/**
 * Above every page while a move to a lower plan has paused something, or
 * will (#800, #801): what, when, and the way to keep everything. Said in
 * words, not by colour: "Paused by your plan" or "will pause on …". The
 * API decides (`GET …/billing/paused`); nothing when nothing is over, the
 * read failed, or nothing is enforced.
 */
export function PausedBanner({ view }: { view: PausedView | null }) {
    const b = pausedBanner(view);
    if (!b) return null;
    return (
        <div
            role="status"
            className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-border/70 bg-warning-subtle px-4 py-2.5 sm:px-6"
        >
            <p className="min-w-0 flex-[1_1_320px] text-pretty text-[13px] leading-normal text-warning-subtle-foreground">
                <span className="font-semibold">
                    {b.title}
                    {b.pausesFrom ? (
                        <>
                            {" "}
                            on <ViewerDate iso={b.pausesFrom} />
                        </>
                    ) : null}
                    .
                </span>{" "}
                {b.body}
            </p>
            <Button asChild size="sm" className="shrink-0">
                <Link href={PLAN_AND_BILLING_HREF}>See Plan and billing</Link>
            </Button>
        </div>
    );
}

/**
 * One line saying why something is paused, where it is listed or edited:
 * the words and the way back, never only a tag or a hover (four scenes).
 */
export function PausedNote({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <p
            role="note"
            className={cn(
                "rounded-[10px] bg-warning-subtle px-3 py-2.5 text-[12.5px] leading-[1.45] text-warning-subtle-foreground",
                className,
            )}
        >
            {children}{" "}
            <Link
                href={PLAN_AND_BILLING_HREF}
                className="font-medium underline underline-offset-2"
            >
                See Plan and billing
            </Link>
        </p>
    );
}
