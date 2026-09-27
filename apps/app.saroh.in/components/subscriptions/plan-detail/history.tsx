import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";

import type { HistoryRow } from "@/lib/subscriptions/plan-detail";

/**
 * Plan Detail's History (D4): every recorded change, newest first, who made
 * it and when. `rows` is null when the history couldn't be read, which costs
 * this tab and nothing else.
 */
export function PlanHistory({
    rows,
    hasMore,
    loadingMore,
    moreFailed,
    onMore,
    onRetry,
}: {
    rows: HistoryRow[] | null;
    hasMore: boolean;
    loadingMore: boolean;
    moreFailed: boolean;
    onMore: () => void;
    onRetry: () => void;
}) {
    if (!rows) {
        return (
            <FailedState
                title="History could not be loaded"
                description="This tab couldn't read the plan's changes. Nothing has changed — the plan is as it was."
                action={
                    <Button variant="outline" onClick={onRetry}>
                        Try again
                    </Button>
                }
            />
        );
    }
    return (
        <>
            <ol className="overflow-hidden rounded-[12px] border border-border">
                {rows.map((h, i) => (
                    <li
                        key={h.id}
                        className={cn(
                            "flex flex-wrap gap-3.5 px-4 py-[11px] text-[13px]",
                            i > 0 && "border-t border-border/70",
                        )}
                    >
                        <span className="flex-[0_0_80px] tabular-nums text-muted-foreground">
                            {h.date}
                        </span>
                        <span
                            className={cn(
                                "min-w-0 flex-[1_1_240px]",
                                !h.date && "text-muted-foreground",
                            )}
                        >
                            {h.what}
                        </span>
                        {h.who ? (
                            <span className="text-muted-foreground">
                                {h.who}
                            </span>
                        ) : null}
                    </li>
                ))}
            </ol>
            {hasMore ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                        variant="outline"
                        className="h-[38px] rounded-[9px] px-4 text-[14px] font-semibold coarse:h-11"
                        disabled={loadingMore}
                        onClick={onMore}
                    >
                        {loadingMore ? "Loading…" : "Show earlier changes"}
                    </Button>
                    {moreFailed ? (
                        <p
                            role="alert"
                            className="text-[12.5px] text-destructive"
                        >
                            Earlier changes couldn&apos;t be loaded. Try again.
                        </p>
                    ) : null}
                </div>
            ) : null}
        </>
    );
}
