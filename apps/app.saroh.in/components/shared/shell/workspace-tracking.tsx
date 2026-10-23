"use client";

import { useParams, usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { browserTracking } from "@/lib/error-tracking-browser";
import {
    subscribeUsageNotice,
    usageNoticeOnScreen,
} from "@/lib/usage-sharing/notice-on-screen";
import { routeShape } from "@/lib/usage-sharing/route-shape";

/**
 * The signed-in workspace's part in PostHog (DEC-125). Draws nothing, and
 * does nothing at all without a PostHog key.
 *
 * - Errors reported from the workspace carry the person's and the
 *   business's internal ids, never a name or an email.
 * - **Session replay.** `sharesUsage` is the server's answer, read before
 *   this renders: recording is switched on for this environment AND this
 *   person has not opted out. `noticeSeen` is whether they dismissed the
 *   one-time notice on an earlier visit; if not, the recorder waits until
 *   the notice is on screen in this tab (`UsageNotice`), so nobody is
 *   recorded before they have been told. It then starts only if every other
 *   rule holds too (`replayDecision`: the workspace app, a signed-in user,
 *   no Do Not Track or Global Privacy Control). It stops when this goes
 *   away, and at once when `sharesUsage` turns false.
 * - **Page visits** (DEC-160), under the same rules and the same choice:
 *   which screen is open and for how long. What is sent is the route's
 *   shape (`/commerce/orders/[orderId]`, `routeShape`), never the address:
 *   no record's id, no token, no business name, and not the tab's title.
 *
 * Mounted by `UsageRecording` only, which the signed-in shell and the
 * goal picker after setup draw: the first setup step (no business yet),
 * the paused screen, the site editor, sign-in (another app) and every other
 * app never record.
 */
export function WorkspaceTracking({
    userId,
    organizationId,
    sharesUsage,
    noticeSeen,
}: {
    userId: string;
    organizationId: string | undefined;
    sharesUsage: boolean;
    noticeSeen: boolean;
}) {
    const onScreen = useSyncExternalStore(
        subscribeUsageNotice,
        usageNoticeOnScreen,
        () => false,
    );
    const noticeShown = noticeSeen || onScreen;
    const route = routeShape(usePathname(), useParams());

    useEffect(() => {
        const tracking = browserTracking;
        if (!tracking) return;
        tracking.setIdentity({ userId, organizationId });
        void tracking.startReplay({
            userId,
            organizationId,
            sharesUsage,
            noticeShown,
            inWorkspaceShell: true,
        });
        return () => {
            tracking.stopReplay();
        };
    }, [userId, organizationId, sharesUsage, noticeShown]);

    // After the effect above: the tracker sends a page only once it may,
    // and keeps the last one named until then.
    useEffect(() => {
        browserTracking?.pageview(route);
    }, [route]);

    return null;
}
