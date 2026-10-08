import type { TrackerKind } from "@saroh/block-contract";
import { Badge } from "@saroh/ui/badge";
import Link from "next/link";

import type { TrackerView } from "@/lib/sites/search-tracking";
import {
    NOT_RUNNING_LINE,
    POSTHOG_REGION_WORDS,
    TRACKER_WORDS,
    trackerHelpHref,
    trackerRunsLine,
} from "@/lib/sites/search-tracking";
import type { TrackersLock } from "@/lib/sites/trackers-lock";

/**
 * One tool in the trackers list (DEC-108, U7), connected or not: its name,
 * where to find its id, a Help link, and how it stands — said in words,
 * never by colour alone. The actions are the caller's, so the read-only
 * view draws the same row with none.
 *
 * - Connected and running: "On", and where it runs.
 * - Turned off: "Off", not on the site.
 * - Kept on a plan without trackers: "Not running", and the way up.
 * - Switched off by Saroh: "Not running", and nothing can turn it on.
 */
export type TrackerStanding = "open" | "locked" | "switched-off";

export function TrackerRow({
    kind,
    tracker,
    standing,
    lock,
    actions,
}: {
    kind: TrackerKind;
    tracker: TrackerView | null;
    standing: TrackerStanding;
    lock: TrackersLock | null;
    actions?: React.ReactNode;
}) {
    const words = TRACKER_WORDS[kind];
    return (
        <div
            data-tracker={kind}
            className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3"
        >
            <div className="min-w-0 flex-1 basis-64 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{words.name}</span>
                    <StandingBadge tracker={tracker} standing={standing} />
                </div>
                {tracker ? (
                    <p className="text-sm">
                        <span className="font-mono [overflow-wrap:anywhere]">
                            {tracker.trackerId}
                        </span>
                        {tracker.region ? (
                            <span className="text-muted-foreground">
                                {" "}
                                · {POSTHOG_REGION_WORDS[tracker.region]}
                            </span>
                        ) : null}
                    </p>
                ) : null}
                <StandingLine
                    kind={kind}
                    tracker={tracker}
                    standing={standing}
                    lock={lock}
                />
                <p className="text-sm text-muted-foreground">
                    {words.where}{" "}
                    <a
                        href={trackerHelpHref(kind)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground underline underline-offset-2 hover:text-muted-foreground active:text-foreground"
                    >
                        Help
                        <span className="sr-only">
                            {" "}
                            with finding your {words.name} ID
                        </span>
                    </a>
                </p>
            </div>
            {actions ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {actions}
                </div>
            ) : null}
        </div>
    );
}

function StandingBadge({
    tracker,
    standing,
}: {
    tracker: TrackerView | null;
    standing: TrackerStanding;
}) {
    if (!tracker) return <Badge variant="neutral">Not connected</Badge>;
    if (standing !== "open")
        return <Badge variant="warning">Not running</Badge>;
    return tracker.enabled ? (
        <Badge variant="success">On</Badge>
    ) : (
        <Badge variant="neutral">Off</Badge>
    );
}

function StandingLine({
    kind,
    tracker,
    standing,
    lock,
}: {
    kind: TrackerKind;
    tracker: TrackerView | null;
    standing: TrackerStanding;
    lock: TrackersLock | null;
}) {
    if (standing === "switched-off") {
        return tracker ? (
            <p className="text-sm text-muted-foreground">{NOT_RUNNING_LINE}</p>
        ) : null;
    }
    if (standing === "locked" && lock) {
        return tracker ? (
            <p className="text-sm" data-kept>
                {lock.kept}{" "}
                <Link
                    href={lock.href}
                    className="underline underline-offset-2 hover:text-muted-foreground active:text-foreground"
                >
                    {lock.cta}
                </Link>
            </p>
        ) : null;
    }
    if (!tracker) return null;
    return (
        <p className="text-sm text-muted-foreground">
            {tracker.enabled
                ? trackerRunsLine(kind)
                : "Off. It isn't on your site until you turn it on."}
        </p>
    );
}
