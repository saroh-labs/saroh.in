"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { useState } from "react";

import { cn } from "../lib/utils";
import { ACCOUNT_TAB_HREF, currentTab } from "./hrefs";
import type { AccountTab, AccountTabKey } from "./model";

/**
 * The account's tabs (round-2 plan A, A5; Saroh Customer Site design; made
 * responsive by DEC-142): only this business's tabs (e.g. a clinic: Home ·
 * Bookings · Messages · Your details), the current one marked in the
 * accent, and a dot on Messages while the business has written something
 * not yet opened (A13). The API decides which tabs there are; this draws
 * them.
 *
 * One component at every width, in one place in the page (after the
 * header, before the content):
 *
 * - **On a phone** it is the bar fixed to the foot of the screen, an icon
 *   over each word.
 * - **From tablet width up** it is a row of tabs under the header that
 *   stays at the top as the page scrolls, an icon beside each word, the
 *   current one underlined in the accent. A wide window no longer has a
 *   phone's bar pinned to its foot.
 * - **On a desk (1024px up)** it is the side menu (DEC-229, plan U13): a
 *   column beside the page, the current one filled, and "Back to the
 *   site" under the tabs. Still the one `nav` landmark, never a second.
 */

// Kept here for the callers that read them from the tab bar.
export { ACCOUNT_TAB_HREF, currentTab };

/** The design's icons, 24px grid, stroked. */
export const ICON: Record<AccountTabKey, string> = {
    home: "M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z",
    bookings: "M5 6 H19 V20 H5 Z M5 10 H19 M9 3 V7 M15 3 V7",
    orders: "M6 7 H18 L17 20 H7 Z M9 7 A3 3 0 0 1 15 7",
    plan: "M4 12 A8 8 0 1 0 12 4 M12 4 V8 M12 4 H8",
    messages: "M4 5 H20 V16 H9 L5 20 V16 H4 Z",
    me: "M12 12 A4 4 0 1 0 12 4 A4 4 0 0 0 12 12 Z M4 20 C5 16 8.5 14 12 14 C15.5 14 19 16 20 20",
};

export function AccountTabBar({
    tabs,
    unreadMessages = 0,
}: {
    tabs: AccountTab[];
    /** Messages from the business not yet opened (A13): a dot on Messages. */
    unreadMessages?: number;
}) {
    const current = currentTab(usePathname(), tabs);
    // The layout (and this count) isn't read again on moving between tabs,
    // so a visit to Messages clears the dot here until the count changes.
    const [opened, setOpened] = useState<number | null>(null);
    if (current === "messages" && opened !== unreadMessages) {
        setOpened(unreadMessages);
    }
    const unread = opened === unreadMessages ? 0 : unreadMessages;
    return (
        <nav
            aria-label="Account"
            className={cn(
                "bg-site-surface border-site-border font-site-body fixed inset-x-0 bottom-0 z-40 border-t px-2 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5",
                // From tablet width up: a row under the header.
                "md:bg-site-bg md:sticky md:inset-x-auto md:bottom-auto md:top-0 md:border-b md:border-t-0 md:px-6 md:pb-0 md:pt-0",
                // On a desk: the side menu, a column beside the page.
                "lg:top-6 lg:self-start lg:border-b-0 lg:bg-transparent lg:px-0",
            )}
        >
            <div
                className="mx-auto grid max-w-[640px] grid-cols-[repeat(var(--account-tabs),minmax(0,1fr))] md:flex md:max-w-[960px] md:gap-1 lg:mx-0 lg:max-w-none lg:flex-col"
                style={{ "--account-tabs": tabs.length } as CSSProperties}
            >
                {tabs.map((tab) => {
                    const on = tab.key === current;
                    // Opening Messages clears it; on the page, no dot.
                    const dot = tab.key === "messages" && !on && unread > 0;
                    return (
                        <Link
                            key={tab.key}
                            href={ACCOUNT_TAB_HREF[tab.key]}
                            aria-current={on ? "page" : undefined}
                            className={cn(
                                "relative grid min-h-[52px] cursor-pointer content-start justify-items-center gap-0.5 rounded-[calc(var(--site-radius)+6px)] px-0.5 py-1.5 text-[12px] transition-[color,background-color,opacity] duration-150 [transition-timing-function:var(--site-ease,cubic-bezier(0.2,0.8,0.2,1))] motion-reduce:transition-none",
                                "hover:text-site-fg focus-visible:ring-site-fg focus-visible:outline-none focus-visible:ring-2 active:opacity-70",
                                // A row tab: the icon beside the word, and
                                // the accent under the current one.
                                "md:flex md:min-h-[48px] md:items-center md:gap-2 md:rounded-none md:px-3 md:py-0 md:text-[14px] md:hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_5%,transparent)] md:focus-visible:ring-inset",
                                // A side menu entry: rounded, filled when on.
                                "lg:min-h-11 lg:gap-3 lg:rounded-[calc(var(--site-radius)+6px)] lg:text-[15px]",
                                on
                                    ? "text-site-fg lg:bg-site-surface font-bold md:shadow-[inset_0_-2px_0_hsl(var(--site-accent))] lg:shadow-none"
                                    : "text-site-body font-medium",
                            )}
                        >
                            <svg
                                width="22"
                                height="22"
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden="true"
                                className={cn(
                                    "shrink-0 md:size-[18px]",
                                    on ? "text-site-accent-text" : undefined,
                                )}
                            >
                                <path
                                    d={ICON[tab.key]}
                                    stroke="currentColor"
                                    strokeWidth="1.9"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            {/* Held to its own column on a phone. One word
                                fits on a line; "Your details" takes two
                                where six tabs share the bar, rather than
                                being cut to "Your det…". */}
                            <span className="block w-full overflow-hidden text-center leading-[1.15] [overflow-wrap:anywhere] [text-wrap:balance] md:w-auto md:whitespace-nowrap">
                                {tab.label}
                            </span>
                            {dot ? (
                                <>
                                    <span
                                        aria-hidden="true"
                                        className="bg-site-accent absolute right-[calc(50%-16px)] top-1 size-2 rounded-full md:static md:order-last"
                                    />
                                    <span className="sr-only">
                                        {`(${unread} new)`}
                                    </span>
                                </>
                            ) : null}
                            <TabPending />
                        </Link>
                    );
                })}
                {/* The way back, under the side menu (the header's letter
                    says it below a desk). */}
                <Link
                    href="/"
                    className="text-site-body hover:text-site-fg focus-visible:ring-site-fg border-site-border mt-3 hidden min-h-11 items-center gap-3 border-t px-3 pt-3 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 lg:flex"
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                        className="shrink-0"
                    >
                        <path
                            d="M19 12H5M11 6l-6 6 6 6"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                    Back to the site
                </Link>
            </div>
        </nav>
    );
}

/**
 * `@saroh/ui`'s `LinkPending` in the site's own colours: while the pressed
 * tab's page is on its way the old one stays, and a still bar sits under the
 * tab so the press is seen. The tab is `relative`.
 */
function TabPending() {
    const { pending } = useLinkStatus();
    return pending ? (
        <span
            aria-hidden="true"
            data-link-pending=""
            className="bg-site-accent pointer-events-none absolute inset-x-1 bottom-0 h-0.5 rounded-full opacity-60"
        />
    ) : null;
}
