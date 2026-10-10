"use client";

import { ViewerDate } from "@/components/shared/viewer-date";
import { count } from "@/lib/format/plural";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { ListCard, ListRow } from "@/components/shared/list-card";
import { personHref } from "@/lib/contacts/person-href";
import {
    markAllNotificationsRead,
    markNotificationRead,
} from "@/lib/notifications/actions";
import type { Notification } from "@/lib/notifications/service";

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
                title="No notifications yet"
                description={`Updates from what ${businessName} has turned on show here.`}
            />
        );
    }

    return (
        <div className="grid gap-3">
            {unread > 0 ? (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[12.5px] text-muted-foreground">
                        {count(unread, "unread", "unread")}
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
                                    <ViewerDate
                                        iso={n.createdAt}
                                        variant="datetime"
                                    />
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
                            ) : n.reviewId ? (
                                // A review's notice is NOT read by opening it:
                                // it clears when the review is replied to or
                                // hidden, which is what "needs a reply" means.
                                <Link
                                    href={`/commerce/products?tab=reviews&review=${encodeURIComponent(n.reviewId)}`}
                                    aria-label={label}
                                    className={rowClass}
                                >
                                    {row}
                                </Link>
                            ) : n.contactId ? (
                                // A customer's message (UX-014): it opens
                                // their thread, and opening it is reading it.
                                <Link
                                    href={personHref(n.contactId, "msg")}
                                    aria-label={label}
                                    className={rowClass}
                                    onClick={() => {
                                        if (isUnread) markOne(n.id, true);
                                    }}
                                >
                                    {row}
                                </Link>
                            ) : n.type === "plan.limit" ||
                              n.type === "plan.changed" ||
                              n.type === "plan.ending" ? (
                                // A plan limit's notice (U13), the plan
                                // changing (UX-041), or a plan that ends
                                // (#805): opening it is reading it, and it
                                // opens the plans.
                                <Link
                                    href="/settings/billing#change-plan"
                                    aria-label={label}
                                    className={rowClass}
                                    onClick={() => {
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
