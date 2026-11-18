import { EmptyState } from "@saroh/ui/empty-state";
import { ListTable } from "@saroh/ui/list-table";

import { formatRecent } from "@/lib/format/datetime";
import type { SiteOverview } from "@/lib/sites/service";

import { activityWords, initialsOf } from "./overview-words";

/**
 * What happened to the site lately (WXHOverview): publishes, posts that
 * went live, page settings and saved changes, newest first. A saved
 * change has no name until batch 2 records who made it (A4).
 */
export function ActivityList({
    activity,
    timeZone,
    now,
}: {
    activity: SiteOverview["activity"];
    timeZone: string;
    now: Date;
}) {
    return (
        <section
            aria-labelledby="ov-activity"
            className="flex min-w-0 flex-col gap-3"
        >
            <h2 id="ov-activity" className="text-base font-semibold">
                Activity
            </h2>
            {activity.length === 0 ? (
                <EmptyState
                    size="inline"
                    title="No activity yet"
                    description="Changes and publishes show here."
                />
            ) : (
                <ListTable>
                    <ul className="divide-y divide-border">
                        {activity.map((a) => {
                            const words = activityWords(a);
                            return (
                                <li
                                    key={`${a.kind}-${a.at}-${a.subject ?? ""}`}
                                    className="flex min-h-[60px] items-center gap-3 px-4 py-2.5"
                                >
                                    <span
                                        aria-hidden
                                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                                    >
                                        {initialsOf(a.by)}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold">
                                            {words.title}
                                        </span>
                                        <span className="block text-sm text-muted-foreground">
                                            {words.line}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-sm text-muted-foreground">
                                        {formatRecent(a.at, timeZone, now)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </ListTable>
            )}
        </section>
    );
}
