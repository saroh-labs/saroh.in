import { EmptyPanel } from "@/components/states/empty-panel";
import { FailedPanel } from "@/components/states/failed-panel";
import type { FlagChange } from "@/lib/control-plane";
import { formatDateTime } from "@/lib/format";

/** "On for Rye & Co. (was off)", "Off for everyone (was never turned on)". */
export function describeEntry(entry: FlagChange): string {
    const who = entry.organizationId
        ? (entry.organizationName ?? "a business since removed")
        : "everyone";
    const was =
        entry.previousValue === null
            ? entry.organizationId
                ? "followed the default"
                : "was never turned on"
            : `was ${entry.previousValue ? "on" : "off"}`;
    return `${entry.newValue ? "On" : "Off"} for ${who} (${was})`;
}

/**
 * The last changes to this release: who, when, what and why, from the
 * release's own record, so the reason for its state is where it is changed.
 * `limit` shows only the newest few (the Overview's recent changes).
 */
export function ReleaseHistory({
    history,
    limit,
}: {
    history: FlagChange[] | null;
    limit?: number;
}) {
    if (history === null) {
        return <FailedPanel things="this release's history" />;
    }
    if (history.length === 0) {
        return (
            <EmptyPanel
                title="No changes yet"
                description="Every change will show here with who made it and why."
            />
        );
    }
    return (
        <ol className="divide-y rounded-md border">
            {history.slice(0, limit).map((entry) => (
                <li key={entry.id} className="grid gap-0.5 px-3 py-2.5">
                    <p className="text-sm font-medium">
                        {describeEntry(entry)}
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                        <time dateTime={entry.createdAt}>
                            {formatDateTime(entry.createdAt)}
                        </time>{" "}
                        · {entry.actorName ?? "A former staff member"}
                    </p>
                    <p className="text-[13px]">
                        {entry.reason ? (
                            <>“{entry.reason}”</>
                        ) : (
                            <span className="text-muted-foreground">
                                No reason recorded (made before reasons were
                                required).
                            </span>
                        )}
                    </p>
                </li>
            ))}
        </ol>
    );
}
