"use client";

import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NOTIFICATIONS_NAV } from "@/components/shared/nav-items";

/**
 * Notifications, in the top bar beside search and help (2026-09-25).
 *
 * It left the rail's Workspace group, which is now the business's Settings:
 * what has happened for you is not part of setting the business up. The
 * unread count rides on the bell in the rail's badge style, capped at 99+ so
 * it never widens the bar; the accessible name carries the real number.
 *
 * `AppShell` decides whether the actor may read notifications and passes the
 * count it already fetches for the tab bar.
 */
export function NotificationsLink({ unread }: { unread: number }) {
    const current = usePathname() === NOTIFICATIONS_NAV.href;
    const Icon = NOTIFICATIONS_NAV.icon;
    return (
        <Link
            href={NOTIFICATIONS_NAV.href}
            aria-label={
                unread > 0
                    ? `${NOTIFICATIONS_NAV.label}, ${unread} unread`
                    : NOTIFICATIONS_NAV.label
            }
            aria-current={current ? "page" : undefined}
            title={NOTIFICATIONS_NAV.label}
            className={cn(
                "relative inline-flex size-8 items-center justify-center rounded-lg text-neutral-700 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background coarse:size-11 dark:text-foreground",
                current && "bg-muted",
            )}
        >
            <Icon className="size-4" />
            {unread > 0 ? (
                <span
                    aria-hidden
                    className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-brand-subtle px-1 py-px text-[10px] font-semibold tabular-nums leading-none text-brand-subtle-foreground ring-2 ring-background"
                >
                    {unread > 99 ? "99+" : unread}
                </span>
            ) : null}
        </Link>
    );
}
