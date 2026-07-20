"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
    NAV_GROUPS,
    NOTIFICATIONS_HREF,
    isNavItemActive,
} from "@/components/shared/nav-items";

/**
 * Desktop primary navigation: a calm, goal-grouped rail replacing the flat
 * horizontal top nav (see `docs/design-system/03_APPLICATION_SHELL.md`). It is
 * `hidden lg:flex` — below `lg` the same nav lives in `MobileNav`'s drawer.
 * Client-only for `usePathname` active state; the `unread` count is fetched
 * server-side by `AppShell` and passed in (this component never fetches).
 */
export function AppSidebar({ unread = 0 }: { unread?: number }) {
    const pathname = usePathname();

    return (
        <aside className="hidden w-60 shrink-0 flex-col border-r lg:flex">
            <div className="flex h-14 items-center border-b px-6">
                <Link href="/" aria-label="Saroh">
                    <Wordmark />
                </Link>
            </div>
            <nav
                aria-label="Primary"
                className="flex flex-1 flex-col gap-6 overflow-y-auto p-4"
            >
                {NAV_GROUPS.map((group, index) => (
                    <div
                        key={group.label ?? `group-${index}`}
                        className="flex flex-col gap-1"
                    >
                        {group.label && (
                            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {group.label}
                            </p>
                        )}
                        {group.items.map((item) => {
                            const active = isNavItemActive(pathname, item.href);
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                                        active
                                            ? "bg-accent font-medium text-foreground"
                                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span className="flex-1">{item.label}</span>
                                    {item.href === NOTIFICATIONS_HREF &&
                                        unread > 0 && (
                                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                                                {unread}
                                            </span>
                                        )}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>
        </aside>
    );
}
