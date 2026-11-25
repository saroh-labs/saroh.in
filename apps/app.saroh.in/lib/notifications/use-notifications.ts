"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useOrgId } from "@/lib/query/org";
import { shellLiveRead } from "@/lib/shell/queries";

import { notificationsKeys, notificationsRead } from "./queries";

/** `/notifications`: the inbox (DEC-259). */
export function useNotifications() {
    return useQuery(notificationsRead.options(useOrgId(), {}));
}

/**
 * After a mark-read landed: the inbox, if it is still on screen, and the
 * shell's live read (the bell's count and the tab title) are read again;
 * an inbox left behind (a row opened its page) is only marked stale. Never
 * throws: a read that fails is the screen's failed state.
 */
export function notificationsSaved(
    qc: QueryClient,
    orgId: string,
): Promise<void> {
    return Promise.all([
        qc.invalidateQueries({ queryKey: notificationsKeys(orgId) }),
        qc.invalidateQueries({ queryKey: shellLiveRead.key(orgId, {}) }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How the inbox saves: `orgId` goes last to each write (the action runs it
 * through `writeAsOrg`, refusing a moved tab and revalidating nothing),
 * and `saved()` once it landed. A refused write calls nothing.
 */
export interface NotificationsSave {
    orgId: string;
    saved: () => Promise<void>;
}

export function useNotificationsSave(): NotificationsSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({ orgId, saved: () => notificationsSaved(qc, orgId) }),
        [qc, orgId],
    );
}
