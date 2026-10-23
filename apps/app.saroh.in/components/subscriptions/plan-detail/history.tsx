import { FailedRead } from "@/components/shared/states/failed-read";
import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";

import type { HistoryRow } from "@/lib/subscriptions/plan-detail";
import { couldntLoad } from "@saroh/ui/lib/state-copy";

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
                size="panel"
                title={couldntLoad("this plan's history")}
                onRetry={onRetry}
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
                        onClick={onMore}
                        busy={loadingMore}
                        busyLabel="Loading…"
                    >
                        Show earlier changes
                    </Button>
                    {moreFailed ? (
                        <FailedRead things="earlier changes" onRetry={onMore} />
                    ) : null}
                </div>
            ) : null}
        </>
    );
}
