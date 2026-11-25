"use client";

import { NotificationsInbox } from "@/components/notifications/notifications-inbox";
import { PageLoading } from "@/components/shared/page/page-loading";
import {
    useNotifications,
    useNotificationsSave,
} from "@/lib/notifications/use-notifications";

/**
 * Notifications on React Query (DEC-259), read in the browser: the same
 * inbox, from one query (`/api/notifications`), under the page's own
 * header. Until it lands the rows are skeletons (`loading.tsx`'s shape);
 * a failed read is the page failing (`error.tsx`), never an empty inbox.
 */
export function NotificationsContainer({
    businessName,
    now,
}: {
    businessName: string;
    now: string;
}) {
    const read = useNotifications();
    const save = useNotificationsSave();
    if (read.isError && !read.data) throw read.error;
    if (!read.data) {
        return (
            <PageLoading
                bare
                width="full"
                shape="rows"
                label="Loading notifications"
            />
        );
    }
    return (
        <NotificationsInbox
            notifications={read.data}
            businessName={businessName}
            now={now}
            save={save}
        />
    );
}
