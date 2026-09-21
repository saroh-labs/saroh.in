"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { ListCard, ListRow } from "@/components/shared/list-card";
import { DISPLAY_LOCALE } from "@/lib/format/locale";
import {
    markAllNotificationsRead,
    markNotificationRead,
} from "@/lib/notifications/actions";
import type { Notification } from "@/lib/notifications/service";

/**
 * Format an ISO timestamp as a short date-time.
 *
 * The locale is pinned, not inherited: this component server-renders and then
 * hydrates, and `undefined` resolves to the runtime's own locale — Node's on the
 * server, the browser's on the client. When the two disagree React fails
 * hydration and discards the tree. See `lib/format/locale.ts`.
 */
function formatWhen(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(DISPLAY_LOCALE, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}

/**
 * Workspace → Notifications, as the workspace design draws it: a list with
 * "Notification" and "When" columns, an Unread tag, and opening a row marks it
 * read. A row about an enquiry opens the lead; one with nowhere to go is its
 * own mark-read control.
 */
export function NotificationsInbox({
    notifications,
    businessName,
}: {
    notifications: Notification[];
    businessName: string;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const unread = notifications.filter((n) => !n.readAt).length;

    const markOne = (id: string, quiet = false) => {
        startTransition(async () => {
            const res = await markNotificationRead(id);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            if (!quiet) showSuccess("Marked as read");
            router.refresh();
        });
    };

    const markAll = () => {
        startTransition(async () => {
            const res = await markAllNotificationsRead();
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess("All notifications marked as read");
            router.refresh();
        });
    };

    if (notifications.length === 0) {
        return (
            <EmptyState
                icon={<Bell />}
                title="Nothing to catch up on"
                description={`No notifications in ${businessName}. They arrive from the modules this business has on — turning one on gives it something to say here.`}
            />
        );
    }

    return (
        <div className="grid gap-3">
            {unread > 0 ? (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[12.5px] text-muted-foreground">
                        {unread === 1 ? "1 unread" : `${unread} unread`}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={markAll}
                        disabled={pending}
                        className="wk-press"
                    >
                        Mark all as read
                    </Button>
                </div>
            ) : null}

            <ListCard
                main="Notification"
                end="When"
                note="Notifications belong to you within this business, and to the modules it has on — switching business changes the list, and marking one read does not mark it read for anyone else."
            >
                {notifications.map((n, index) => {
                    const isUnread = !n.readAt;
                    const row = (
                        <ListRow
                            title={n.title}
                            sub={n.body}
                            muted={!isUnread}
                            tag={
                                isUnread ? (
                                    <Badge variant="warning">Unread</Badge>
                                ) : null
                            }
                            end={
                                <span className="text-[12px] tabular-nums text-muted-foreground">
                                    {formatWhen(n.createdAt)}
                                </span>
                            }
                        />
                    );
                    const rowClass =
                        "block w-full text-left transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
                    const label = `${n.title}${isUnread ? ", unread" : ", read"}${n.body ? ` — ${n.body}` : ""}`;
                    return (
                        <li
                            key={n.id}
                            style={{ "--wk-i": index } as React.CSSProperties}
                            className="wk-item border-b border-border last:border-b-0"
                        >
                            {n.leadId ? (
                                <Link
                                    href={`/leads/${n.leadId}`}
                                    aria-label={label}
                                    className={rowClass}
                                    onClick={() => {
                                        // Opening it is reading it.
                                        if (isUnread) markOne(n.id, true);
                                    }}
                                >
                                    {row}
                                </Link>
                            ) : isUnread ? (
                                <button
                                    type="button"
                                    aria-label={`${label}. Mark as read`}
                                    disabled={pending}
                                    className={rowClass}
                                    onClick={() => {
                                        markOne(n.id);
                                    }}
                                >
                                    {row}
                                </button>
                            ) : (
                                row
                            )}
                        </li>
                    );
                })}
            </ListCard>
        </div>
    );
}
