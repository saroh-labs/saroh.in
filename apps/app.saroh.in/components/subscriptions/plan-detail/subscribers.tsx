import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState, PartialNotice } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { Users } from "lucide-react";
import Link from "next/link";

import type { SubscriberRow } from "@/lib/subscriptions/plan-detail";

import { Pill } from "../pill";

/**
 * Plan Detail's Subscribers (D4): everyone on the plan, each opening their
 * subscription. `rows` is null when they couldn't be read — said so, never
 * an empty plan.
 */
export function PlanSubscribers({
    rows,
    truncated,
    emptyText,
    onRetry,
}: {
    rows: SubscriberRow[] | null;
    truncated: boolean;
    emptyText: string;
    onRetry: () => void;
}) {
    if (!rows) {
        return (
            <FailedState
                title="Subscribers could not be loaded"
                description="This tab couldn't read who's on the plan. Nothing has changed — their subscriptions still renew."
                action={
                    <Button variant="outline" onClick={onRetry}>
                        Try again
                    </Button>
                }
            />
        );
    }
    if (!rows.length) {
        return (
            <EmptyState
                icon={<Users />}
                title="Nobody's on this plan yet"
                description={emptyText}
            />
        );
    }
    return (
        <>
            {truncated ? (
                <PartialNotice className="mb-3">
                    Only the newest subscriptions are listed. Older ones that
                    have ended aren&apos;t shown.
                </PartialNotice>
            ) : null}
            <ul className="overflow-hidden rounded-[12px] border border-border">
                {rows.map((r, i) => (
                    <li key={r.id}>
                        <Link
                            href={`/billing/subscriptions/${encodeURIComponent(r.id)}`}
                            className={cn(
                                "flex flex-wrap items-center gap-3 px-4 py-3 text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                i > 0 && "border-t border-border/70",
                            )}
                        >
                            <span className="min-w-0 flex-[1_1_180px] text-[14px] font-semibold">
                                {r.name}
                                <span className="block text-[12px] font-normal text-muted-foreground">
                                    {r.since}
                                </span>
                            </span>
                            <span className="flex-[0_0_120px]">
                                <Pill tone={r.status.tone}>
                                    {r.status.label}
                                </Pill>
                            </span>
                            <span className="flex-[0_0_150px] text-[13px] tabular-nums">
                                {r.price}
                                {r.olderPrice ? (
                                    <span className="block text-[11.5px] text-muted-foreground">
                                        Older price
                                    </span>
                                ) : null}
                            </span>
                            <span className="flex-[0_0_140px] text-[12.5px] text-muted-foreground">
                                {r.when}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </>
    );
}
