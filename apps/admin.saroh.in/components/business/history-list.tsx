import { Badge } from "@saroh/ui/badge";
import { Notice } from "@saroh/ui/notice";

import { EmptyPanel } from "@/components/states/empty-panel";
import type { HistoryRow } from "@/lib/business-words";
import { HISTORY_SOURCE } from "@/lib/business-words";
import { formatDateTime } from "@/lib/format";

/**
 * A business's history (admin plan U6): what the business did itself and
 * what Saroh's team did to it, as one list, newest first, each line saying
 * which side it came from. Staff lines carry who and the reason they gave.
 * A side that couldn't be read is named above the list, never left to read
 * as nothing having happened.
 */
export function HistoryList({
    rows,
    missing = [],
}: {
    rows: HistoryRow[];
    /** The sides that couldn't be read: "the business's own activity". */
    missing?: string[];
}) {
    return (
        <div className="grid gap-3">
            {missing.length > 0 && (
                <Notice tone="warning">
                    {`Couldn't load ${missing.join(" or ")}, so this list may be missing lines. Reload to try again.`}
                </Notice>
            )}
            {rows.length === 0 ? (
                missing.length === 0 && (
                    <EmptyPanel
                        size="inline"
                        title="No history yet"
                        description="Nothing has been done in this business, or to it, so far."
                    />
                )
            ) : (
                <ol className="grid" aria-label="History, newest first">
                    {rows.map((row) => (
                        <li
                            key={row.id}
                            data-source={row.source}
                            className="flex flex-wrap gap-x-4 gap-y-1 border-b py-3 last:border-0"
                        >
                            <time
                                dateTime={row.at}
                                className="shrink-0 basis-32 font-mono text-[12px] text-muted-foreground"
                            >
                                {formatDateTime(row.at)}
                            </time>
                            <div className="grid min-w-0 flex-1 basis-64 gap-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium">
                                        {row.title}
                                    </span>
                                    <Badge
                                        size="sm"
                                        variant={
                                            row.source === "staff"
                                                ? "info"
                                                : "neutral"
                                        }
                                    >
                                        {HISTORY_SOURCE[row.source]}
                                    </Badge>
                                </div>
                                <p className="break-words text-[13px] text-muted-foreground">
                                    {row.detail}
                                </p>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
