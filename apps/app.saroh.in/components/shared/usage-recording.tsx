import { UsageNotice } from "@/components/shared/usage-notice";
import { WorkspaceTracking } from "@/components/shared/workspace-tracking";
import { env } from "@/env";
import { usageSharingOrNull } from "@/lib/usage-sharing/service";
import type { UsageSharing } from "@/lib/usage-sharing/sharing";
import {
    replaySwitchedOn,
    sharesUsageNow,
    usageNoticeDue,
} from "@/lib/usage-sharing/sharing";

/** Whether session recording is switched on for this environment at all. */
export function recordingSwitchedOn(): boolean {
    return replaySwitchedOn({
        key: env.NEXT_PUBLIC_POSTHOG_KEY,
        replay: env.NEXT_PUBLIC_POSTHOG_REPLAY,
    });
}

/**
 * PostHog in the signed-in workspace (DEC-125): internal ids beside its
 * error reports, the one-time notice that it is recorded, and the recorder
 * itself. Drawn where the notice belongs, above the page; without a key, or
 * with recording off, it draws nothing and reads nothing.
 *
 * The person's choice and whether they have seen the notice are read on the
 * server, before the page that could start the recorder is sent. A read
 * that failed is a no: nobody is recorded, or told they are, on a guess.
 *
 * `usage` is for a caller that already read it beside its other reads (the
 * shell); left out, it is read here.
 */
export async function UsageRecording({
    userId,
    organizationId,
    usage,
}: {
    userId: string;
    organizationId: string | undefined;
    usage?: UsageSharing | null;
}) {
    const recordingOn = recordingSwitchedOn();
    const read =
        usage !== undefined
            ? usage
            : recordingOn
              ? await usageSharingOrNull()
              : null;
    return (
        <>
            {recordingOn && usageNoticeDue(read) ? <UsageNotice /> : null}
            <WorkspaceTracking
                userId={userId}
                organizationId={organizationId}
                sharesUsage={recordingOn && sharesUsageNow(read)}
                noticeSeen={Boolean(read?.noticeSeenAt)}
            />
        </>
    );
}
