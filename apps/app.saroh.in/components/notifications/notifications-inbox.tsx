"use client";

import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { useBusinessZone } from "@/components/shared/business-zone";
import { ListCard, ListRow } from "@/components/shared/list-card";
import { listTable } from "@/components/shared/list-toolbar";
import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import {
    markAllNotificationsRead,
    markNotificationRead,
    undoMarkAllNotificationsRead,
} from "@/lib/notifications/actions";
import { notificationHref } from "@/lib/notifications/href";
import type { Notification } from "@/lib/notifications/service";
import type { NoticeGroup } from "@/lib/notifications/when";
import { exactWhen, noticeGroup, relativeWhen } from "@/lib/notifications/when";

const GROUPS: { key: NoticeGroup; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "earlier", label: "Earlier" },
];

/** A row that opens what it is about: the one table's wash and press. */
const ROW = `block w-full text-left ${listTable.wash} ${listTable.pressable}`;

const NONE: ReadonlySet<string> = new Set();

/**
 * Workspace → Notifications (10 Oct 2026). Every row is a link to the
 * thing it is about (`notificationHref`): the order, the booking, the
 * invoice, the lead, the review, the customer's thread, the website, or
 * the page for one about a place. Opening a row is reading it, for every
 * kind of row, so the bell's count means one thing: not opened yet.
 *
 * - Unread is a quiet dot in Ink and a title in full weight. Never a
 *   warning colour: a new order isn't something wrong.
 * - Rows are grouped Today and Earlier, by the business's day, and say how
 *   long ago ("5 min ago") while that is the useful answer.
 * - Reading a row says nothing else: the dot goes. "Mark all as read"
 *   offers Undo, which gives back exactly what that press marked.
 */
export function NotificationsInbox({
    notifications,
    businessName,
    now: renderedAt,
}: {
    notifications: Notification[];
    businessName: string;
    /** When the server drew this, so both sides count from one instant. */
    now: string;
}) {
    const router = useRouter();
    const zone = useBusinessZone();
    const [pending, startTransition] = useTransition();
    // Opened here and on their way to being saved: read at once.
    const [opened, setOpened] = useState<ReadonlySet<string>>(NONE);
    const [now, setNow] = useState(() => new Date(renderedAt));
    useEffect(() => {
        const tick = () => setNow(new Date());
        tick();
        const timer = window.setInterval(tick, 60_000);
        return () => window.clearInterval(timer);
    }, [renderedAt]);

    const isUnread = (n: Notification) => !n.readAt && !opened.has(n.id);
    const unread = notifications.filter(isUnread).length;

    /** Opening it is reading it. One signal: the dot goes. */
    const open = (n: Notification) => {
        if (!isUnread(n)) return;
        setOpened((had) => new Set(Array.from(had).concat(n.id)));
        // Not awaited: the link is already on its way. A save that didn't
        // get there leaves it unread for next time, which is the truth.
        void runAction(() => markNotificationRead(n.id), { quiet: true });
    };

    const markAll = () => {
        startTransition(async () => {
            const res = await runAction(() => markAllNotificationsRead());
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            router.refresh();
            const readAt = res.data.readAt;
            if (!readAt) {
                showSuccess("All notifications marked as read.");
                return;
            }
            showUndo("All notifications marked as read.", async () => {
                const back = await runAction(
                    () => undoMarkAllNotificationsRead(readAt),
                    { quiet: true },
                );
                if (!back) return { ok: false, error: UNREACHED };
                router.refresh();
                return back.ok ? true : { ok: false, error: back.error };
            });
        });
    };

    if (notifications.length === 0) {
        return (
            <EmptyState
                data-ph-mask=""
                icon={<Bell />}
                title="No notifications yet"
                description={`Updates from what ${businessName} has turned on show here.`}
            />
        );
    }

    const groups = GROUPS.map((group) => ({
        ...group,
        rows: notifications.filter(
            (n) => noticeGroup(n.createdAt, now, zone) === group.key,
        ),
    })).filter((group) => group.rows.length > 0);

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
                        busy={pending}
                        busyLabel="Saving…"
                        className="wk-press"
                    >
                        Mark all as read
                    </Button>
                </div>
            ) : null}

            {groups.map((group, g) => (
                <ListCard
                    key={group.key}
                    main={group.label}
                    end="When"
                    note={
                        g === groups.length - 1
                            ? "Notifications belong to you within this business, and to the modules it has on. Switching business changes the list, and reading one does not mark it read for anyone else."
                            : undefined
                    }
                >
                    {group.rows.map((n, index) => {
                        const fresh = isUnread(n);
                        const when = relativeWhen(n.createdAt, now, zone);
                        return (
                            <li
                                key={n.id}
                                style={
                                    { "--wk-i": index } as React.CSSProperties
                                }
                                className="wk-item border-b border-border last:border-b-0"
                            >
                                <Link
                                    href={notificationHref(n)}
                                    aria-label={`${n.title}${fresh ? ", unread" : ""}${n.body ? `. ${n.body}` : ""}. ${when}`}
                                    data-unread={fresh ? "" : undefined}
                                    className={ROW}
                                    onClick={() => open(n)}
                                >
                                    <ListRow
                                        title={
                                            <span className="inline-flex min-w-0 items-center gap-2">
                                                {fresh ? (
                                                    <span
                                                        aria-hidden
                                                        data-unread-dot
                                                        className="size-2 shrink-0 rounded-full bg-foreground"
                                                    />
                                                ) : null}
                                                <span className="min-w-0">
                                                    {n.title}
                                                </span>
                                            </span>
                                        }
                                        sub={n.body}
                                        muted={!fresh}
                                        end={
                                            <time
                                                dateTime={n.createdAt}
                                                title={exactWhen(
                                                    n.createdAt,
                                                    zone,
                                                )}
                                                className="whitespace-nowrap text-[12px] tabular-nums text-muted-foreground"
                                            >
                                                {when}
                                            </time>
                                        }
                                    />
                                </Link>
                            </li>
                        );
                    })}
                </ListCard>
            ))}
        </div>
    );
}
