"use client";

import { useEffect } from "react";

import { browserTracking } from "@/lib/error-tracking-browser";

/**
 * The signed-in shell's part in PostHog (DEC-125). Draws nothing, and does
 * nothing at all without a PostHog key.
 *
 * - Errors reported from the workspace carry the person's and the
 *   business's internal ids, never a name or an email.
 * - **Session replay.** `sharesUsage` is the server's answer, read before
 *   this renders: recording is switched on for this environment AND this
 *   person has not opted out. The recorder then starts only if every other
 *   rule holds too (`replayDecision`: the workspace app, this shell, a
 *   signed-in user, no Do Not Track or Global Privacy Control), records a
 *   sample of sessions, and masks all text and inputs. It stops when the
 *   shell goes away, and at once when `sharesUsage` turns false.
 *
 * Mounted by `AppShell` only: the onboarding and paused screens, sign-in
 * (another app) and every other app never record.
 */
export function WorkspaceTracking({
    userId,
    organizationId,
    sharesUsage,
}: {
    userId: string;
    organizationId: string | undefined;
    sharesUsage: boolean;
}) {
    useEffect(() => {
        const tracking = browserTracking;
        if (!tracking) return;
        tracking.setIdentity({ userId, organizationId });
        void tracking.startReplay({
            userId,
            organizationId,
            sharesUsage,
            inWorkspaceShell: true,
        });
        return () => {
            tracking.stopReplay();
        };
    }, [userId, organizationId, sharesUsage]);

    return null;
}
