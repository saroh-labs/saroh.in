"use client";

import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

import { navFor } from "@/components/console-nav";
import type { AdminPermission } from "@/lib/control-plane";

/**
 * The console's rail, at the three widths the workspace uses (design system
 * §21): above 1100px the full 238px rail; from 760 to 1100 a 64px icon rail
 * whose labels are announced but not drawn; below 760 no rail at all, and
 * `ConsoleDrawer` carries the same nav.
 *
 * The console is dark by default, so the rail sits ON the ground and the work
 * area steps up — the reverse of the light workspace, where the rail sits on
 * Paper and the page is a raised white card.
 */

const ICON_RAIL = "(min-width: 760px) and (max-width: 1100px)";

function useIconRail(): boolean {
    const subscribe = useCallback((onChange: () => void) => {
        const mq = window.matchMedia(ICON_RAIL);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(ICON_RAIL).matches,
        // The server cannot know the width; the full rail is the honest
        // default and the first client render corrects it.
        () => false,
    );
}

export function ConsoleRail({
    permissions,
}: {
    permissions: AdminPermission[];
}) {
    const groups = navFor(permissions);
    const pathname = usePathname();
    const icons = useIconRail();

    return (
        <nav
            aria-label="Console"
            className={cn(
                // Stuck below the 56px header at the viewport's height, and
                // scrolling on its own: the page scrolls, the rail stays.
                "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col gap-5 self-start overflow-y-auto overscroll-contain border-r border-border px-3 py-5 min-[760px]:flex",
                icons ? "w-16 items-center px-2" : "w-[238px]",
            )}
        >
            {groups.map((group) => (
                <div key={group.label} className="flex flex-col gap-1">
                    {icons ? (
                        // Announced, not drawn: the heading still names the
                        // group for anyone listening, and the icons below it
                        // keep their grouping in the accessibility tree.
                        <span className="sr-only">{group.label}</span>
                    ) : (
                        <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            {group.label}
                        </p>
                    )}
                    {group.items.map((item) => {
                        const on =
                            item.href === "/"
                                ? pathname === "/"
                                : pathname.startsWith(item.href);
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={on ? "page" : undefined}
                                title={icons ? item.label : undefined}
                                className={cn(
                                    "flex items-center gap-2.5 rounded-lg text-[13.5px] transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                                    icons
                                        ? "size-11 justify-center"
                                        : "px-2.5 py-2",
                                    on
                                        ? "bg-card font-semibold text-foreground"
                                        : "font-medium text-muted-foreground hover:bg-card/60 hover:text-foreground",
                                )}
                            >
                                <Icon aria-hidden className="size-4 shrink-0" />
                                {icons ? (
                                    <span className="sr-only">
                                        {item.label}
                                    </span>
                                ) : (
                                    <span className="min-w-0 truncate">
                                        {item.label}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            ))}

            {!icons && (
                <p className="mt-auto px-2.5 text-[11.5px] leading-[1.5] text-muted-foreground">
                    This console is the instance, not a business. Nothing here
                    is reachable from a merchant&rsquo;s workspace.
                </p>
            )}
        </nav>
    );
}
