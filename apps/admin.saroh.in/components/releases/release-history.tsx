import type { FlagChange } from "@/lib/control-plane";
import { formatDateTime } from "@/lib/format";

/** "On for Rye & Co. (was off)", "Off for everyone (was never switched on)". */
export function describeEntry(entry: FlagChange): string {
    const who = entry.organizationId
        ? (entry.organizationName ?? "a business since removed")
        : "everyone";
    const was =
        entry.previousValue === null
            ? entry.organizationId
                ? "had no setting of its own"
                : "was never switched on"
            : `was ${entry.previousValue ? "on" : "off"}`;
    return `${entry.newValue ? "On" : "Off"} for ${who} (${was})`;
}

/**
 * The last changes to this release (R9): who, when, what and why, from the
 * release's own record, so the reason for its state is where it is changed.
 */
export function ReleaseHistory({ history }: { history: FlagChange[] | null }) {
    if (history === null) {
        return (
            <p className="text-sm text-muted-foreground">
                The history couldn't be loaded. Reload the page to try again.
            </p>
        );
    }
    if (history.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No changes yet. Every change will show here with who made it and
                why.
            </p>
        );
    }
    return (
        <ol className="divide-y rounded-md border">
            {history.map((entry) => (
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
