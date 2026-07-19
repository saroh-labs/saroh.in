"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
    markAllNotificationsRead,
    markNotificationRead,
} from "@/lib/notifications/actions";
import type { Notification } from "@/lib/notifications/service";

/** Format an ISO timestamp as a short, locale-friendly date-time. */
function formatWhen(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

/**
 * The owner/admin notification inbox (S3-006). Unread items are emphasized and
 * carry a mark-read control; each links to its lead. A single mark-all-read
 * action clears the badge. Mutations post through server actions and refresh the
 * server component so the list + unread badge stay in sync.
 */
export function NotificationsInbox({
    notifications,
}: {
    notifications: Notification[];
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [busyId, setBusyId] = useState<string | null>(null);

    const hasUnread = notifications.some((n) => !n.readAt);

    async function markOne(id: string) {
        setBusyId(id);
        const res = await markNotificationRead(id);
        setBusyId(null);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        startTransition(() => router.refresh());
    }

    async function markAll() {
        const res = await markAllNotificationsRead();
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("All notifications marked read");
        startTransition(() => router.refresh());
    }

    if (notifications.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-10 text-center">
                <p className="text-sm text-muted-foreground">
                    No notifications yet. New enquiries will show up here.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={markAll}
                    disabled={!hasUnread || pending}
                >
                    Mark all read
                </Button>
            </div>

            <ul className="divide-y rounded-lg border">
                {notifications.map((n) => {
                    const unread = !n.readAt;
                    const body = (
                        <div className="flex items-start gap-3">
                            <span
                                aria-hidden
                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                    unread ? "bg-primary" : "bg-transparent"
                                }`}
                            />
                            <div className="min-w-0 flex-1">
                                <p
                                    className={`truncate text-sm ${
                                        unread
                                            ? "font-semibold"
                                            : "text-muted-foreground"
                                    }`}
                                >
                                    {n.title}
                                </p>
                                {n.body && (
                                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                                        {n.body}
                                    </p>
                                )}
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {formatWhen(n.createdAt)}
                                </p>
                            </div>
                        </div>
                    );

                    return (
                        <li
                            key={n.id}
                            className="flex items-center justify-between gap-4 p-4"
                        >
                            {n.leadId ? (
                                <Link
                                    href={`/leads/${n.leadId}`}
                                    className="min-w-0 flex-1 hover:opacity-80"
                                >
                                    {body}
                                </Link>
                            ) : (
                                <div className="min-w-0 flex-1">{body}</div>
                            )}
                            {unread && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => markOne(n.id)}
                                    disabled={busyId === n.id || pending}
                                >
                                    Mark read
                                </Button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
