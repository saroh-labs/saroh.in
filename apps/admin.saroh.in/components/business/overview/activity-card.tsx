import { formatDate, formatRelative, plural } from "@/lib/format";
import type { OverviewActivityRow, OverviewPanel } from "@/lib/overview-words";
import { activityLabel } from "@/lib/overview-words";

import { CardLink, OverviewCard } from "./overview-card";

/**
 * Recent activity and notes (U3, R2): what happened and when, without who
 * or why, and how many notes there are and when the last was written. The
 * reasons and the notes themselves stay behind a support session, on the
 * History and Notes tabs.
 */
export function ActivityCard({
    organizationId,
    activity,
    notes,
}: {
    organizationId: string;
    activity: OverviewPanel<OverviewActivityRow[]>;
    notes: OverviewPanel<{ count: number; lastAt: string | null }>;
}) {
    return (
        <OverviewCard
            id="activity"
            title="Recent activity and notes"
            data={activity}
        >
            {(rows) => (
                <div className="grid gap-3 text-sm">
                    {rows.length === 0 ? (
                        <p className="text-muted-foreground">
                            Nothing has happened here yet.
                        </p>
                    ) : (
                        <ul className="grid gap-1.5">
                            {rows.map((row) => (
                                <li
                                    key={`${row.source}-${row.id}`}
                                    className="flex flex-wrap justify-between gap-x-3"
                                >
                                    <span className="min-w-0">
                                        {activityLabel(row.action)}
                                        {row.source === "operator" && (
                                            <span className="text-muted-foreground">
                                                {" · by Saroh"}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {formatRelative(row.at)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="text-muted-foreground">
                        {notes.status === "failed"
                            ? "Notes couldn't be counted."
                            : notes.data.count === 0
                              ? "No notes yet."
                              : `${plural(notes.data.count, "note")}, the last on ${formatDate(notes.data.lastAt)}`}
                    </p>
                    <div className="flex flex-wrap gap-4">
                        <CardLink organizationId={organizationId} tab="history">
                            Open History
                        </CardLink>
                        <CardLink organizationId={organizationId} tab="notes">
                            Open Notes
                        </CardLink>
                    </div>
                </div>
            )}
        </OverviewCard>
    );
}
