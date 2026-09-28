"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "../lib/utils";
import type { AccountTab, AccountTabKey } from "./model";

/**
 * The account's bottom tab bar (round-2 plan A, A5; Saroh Customer Site
 * design): only this business's tabs (e.g. a clinic: Home · Appointments ·
 * Messages · Me), fixed to the foot of the screen, the current one in the
 * accent's deep shade. The API decides which tabs there are; this draws them.
 */

export const ACCOUNT_TAB_HREF: Record<AccountTabKey, string> = {
    home: "/account",
    bookings: "/account/bookings",
    orders: "/account/orders",
    plan: "/account/plan",
    messages: "/account/messages",
    me: "/account/me",
};

/** The design's icons, 24px grid, stroked. */
const ICON: Record<AccountTabKey, string> = {
    home: "M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z",
    bookings: "M5 6 H19 V20 H5 Z M5 10 H19 M9 3 V7 M15 3 V7",
    orders: "M6 7 H18 L17 20 H7 Z M9 7 A3 3 0 0 1 15 7",
    plan: "M4 12 A8 8 0 1 0 12 4 M12 4 V8 M12 4 H8",
    messages: "M4 5 H20 V16 H9 L5 20 V16 H4 Z",
    me: "M12 12 A4 4 0 1 0 12 4 A4 4 0 0 0 12 12 Z M4 20 C5 16 8.5 14 12 14 C15.5 14 19 16 20 20",
};

/** Which tab a path is on: the longest tab address it starts with. */
export function currentTab(
    pathname: string | null,
    tabs: AccountTab[],
): AccountTabKey | null {
    if (!pathname) return null;
    let best: AccountTabKey | null = null;
    let length = -1;
    for (const tab of tabs) {
        const href = ACCOUNT_TAB_HREF[tab.key];
        const on =
            pathname === href ||
            (href !== "/account" && pathname.startsWith(`${href}/`));
        if (on && href.length > length) {
            best = tab.key;
            length = href.length;
        }
    }
    return best;
}

export function AccountTabBar({ tabs }: { tabs: AccountTab[] }) {
    const current = currentTab(usePathname(), tabs);
    return (
        <nav
            aria-label="Account"
            className="bg-site-surface border-site-border font-site-body fixed inset-x-0 bottom-0 z-40 border-t px-2 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5"
        >
            <div
                className="mx-auto grid max-w-[640px]"
                style={{
                    gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
                }}
            >
                {tabs.map((tab) => {
                    const on = tab.key === current;
                    return (
                        <Link
                            key={tab.key}
                            href={ACCOUNT_TAB_HREF[tab.key]}
                            aria-current={on ? "page" : undefined}
                            className={cn(
                                "relative grid min-h-[52px] cursor-pointer justify-items-center gap-0.5 rounded-[calc(var(--site-radius)+6px)] px-0.5 py-1.5 text-[11px] transition-colors",
                                "hover:text-site-fg focus-visible:ring-site-fg focus-visible:outline-none focus-visible:ring-2 active:opacity-70",
                                on
                                    ? "text-site-fg font-bold"
                                    : "text-site-muted font-medium",
                            )}
                        >
                            <svg
                                width="22"
                                height="22"
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden="true"
                                className={on ? "text-site-accent" : undefined}
                            >
                                <path
                                    d={ICON[tab.key]}
                                    stroke="currentColor"
                                    strokeWidth="1.9"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            <span>{tab.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
