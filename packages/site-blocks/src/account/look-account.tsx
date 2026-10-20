"use client";

import type { LookId } from "@saroh/block-contract";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { LOOK_EASE, LOOK_RING } from "../look-header-parts";
import { ACCOUNT_TAB_HREF, currentTab } from "./hrefs";
import { accountLookRules } from "./look-account-rules";
import { lookAccountTitle, lookTabLabel } from "./look-account-words";
import type { AccountTab } from "./model";
import { ICON } from "./tab-bar";

/**
 * The customer's account in a look (DEC-172, plan U12; boards VA/VB/VD
 * 18–24): inside the site's own header and footer, as every other page of
 * the site, rather than Classic's compact header and its bar fixed to a
 * phone's foot.
 *
 * - **Tabs** are a nav of links, each tab its own page (`aria-current`),
 *   never a tablist. Only this business's tabs: the API's list follows
 *   what the business offers (`site-accounts/account-tabs.ts`), not what
 *   the customer has. "Details" is the tab, "Your details" its page.
 * - **On a phone** (below 700px) Quiet keeps them at the top, a row that
 *   fits 390px or scrolls inside itself with a fade at the edge that has
 *   more; nothing on the page moves sideways, and the phone's one fixed
 *   bar stays Book's (`sticky-actions.tsx`). Folio puts them in a bar at
 *   the foot (VA19–24 phone) and Live in its dock's place (VB19–24 phone):
 *   `StickyActions` then draws neither Book's bar nor the site's dock on
 *   an account page, so the phone still has one fixed bar.
 * - **On a desk** Folio keeps the row, under "Your account at …" with
 *   Sign out (VA20); Quiet and Live move the tabs to a column on the left
 *   from 1000px (VD20, VB20).
 * - The page's one heading (h1) is the tab's title, or Home's greeting.
 *
 * Everything inside wears the look through `accountLookRules`.
 */

/** The page's title per look, on the site's own scale. */
const TITLE: Record<LookId, string> = {
    folio: "font-site-heading text-site-fg text-[calc(2.75rem*var(--site-heading-scale,1))] font-light leading-[1.04] tracking-[-0.02em] min-[700px]:text-[calc(4rem*var(--site-heading-scale,1))]",
    quiet: "font-site-heading text-site-fg text-[calc(3rem*var(--site-heading-scale,1))] font-light leading-[1.02] tracking-[-0.015em] min-[700px]:text-[calc(4.5rem*var(--site-heading-scale,1))]",
    live: "font-site-heading text-site-fg text-[calc(2.25rem*var(--site-heading-scale,1))] font-extrabold leading-[1.04] tracking-[-0.03em] min-[700px]:text-[calc(3rem*var(--site-heading-scale,1))]",
};

/** Whether the tabs become a column on a desk (from 1000px). */
const SIDE: Record<LookId, boolean> = {
    folio: false,
    quiet: true,
    live: true,
};

/** A tab, in the row and (Quiet, Live) in the column. */
const TAB: Record<LookId, string> = {
    folio: "text-site-body hover:text-site-fg aria-[current=page]:text-site-fg aria-[current=page]:shadow-[inset_0_-1px_0_hsl(var(--site-fg))] text-[14.5px]",
    quiet: "text-site-body hover:text-site-fg aria-[current=page]:text-site-fg aria-[current=page]:underline aria-[current=page]:decoration-1 aria-[current=page]:underline-offset-8 text-[15px] min-[1000px]:aria-[current=page]:no-underline min-[1000px]:aria-[current=page]:font-semibold",
    live: "rounded-full px-4 text-[14.5px] font-semibold text-site-fg hover:bg-site-accent-soft aria-[current=page]:bg-site-fg aria-[current=page]:text-site-bg min-[1000px]:justify-start min-[1000px]:gap-3 min-[1000px]:rounded-site-s min-[1000px]:px-3 min-[1000px]:aria-[current=page]:bg-site-surface min-[1000px]:aria-[current=page]:text-site-fg",
};

/** The row's own band per look. */
const ROW: Record<LookId, string> = {
    folio: "gap-7 border-b border-site-border",
    quiet: "gap-6 border-b border-site-border min-[1000px]:border-b-0",
    live: "gap-1",
};

function TabIcon({ tab }: { tab: AccountTab["key"] }) {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="hidden shrink-0 min-[1000px]:block"
        >
            <path
                d={ICON[tab]}
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/**
 * Messages' count, less a visit: the count isn't read again on moving
 * between tabs, so a visit to Messages clears the dot until it changes
 * (as `tab-bar.tsx`).
 */
function useUnread(current: AccountTab["key"] | null, unreadMessages: number) {
    const [opened, setOpened] = useState<number | null>(null);
    if (current === "messages" && opened !== unreadMessages) {
        setOpened(unreadMessages);
    }
    return opened === unreadMessages ? 0 : unreadMessages;
}

/** Whether the look's phone keeps the tabs in a bar at the foot. */
export function lookHasAccountBar(look: LookId): boolean {
    return look === "folio" || look === "live";
}

/** The bar at a phone's foot per look: Folio's ruled bar, Live's dock. */
const BAR: Record<"folio" | "live", { nav: string; tab: string }> = {
    // VA19–24 phone: the page's ground under a rule, the label under its
    // icon, the tab you are on in ink.
    folio: {
        nav: "bg-site-bg border-site-border inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)]",
        tab: "text-site-muted aria-[current=page]:text-site-fg min-h-[58px] pt-[9px] text-[12px] font-semibold",
    },
    // VB19–24 phone: the account's tabs where the dock stands, in the
    // dock's own ink and shape (`site-dock.tsx`).
    live: {
        nav: "bg-site-fg text-site-bg inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] h-[66px] items-center gap-0.5 rounded-[24px] p-1.5 shadow-[0_18px_40px_-16px_hsl(var(--site-fg)/0.55)]",
        tab: "aria-[current=page]:bg-site-bg/15 h-[54px] justify-center rounded-[18px] px-1 text-[11px] font-semibold aria-[current=page]:font-bold focus-visible:ring-site-bg focus-visible:outline-none focus-visible:ring-2",
    },
};

/**
 * The account's tabs in a bar at a phone's foot (Folio, Live), below
 * 700px only. It is the phone's one fixed bar on an account page
 * (`StickyActions` gives way to it, `data-site-chrome-bar="account"`), and
 * steps aside while a sheet, the menu or the consent banner holds the
 * screen (`data-site-bar="none"` on the page's root).
 */
export function AccountLookBar({
    look,
    tabs,
    unreadMessages = 0,
}: {
    look: "folio" | "live";
    tabs: AccountTab[];
    unreadMessages?: number;
}) {
    const current = currentTab(usePathname(), tabs);
    const unread = useUnread(current, unreadMessages);
    const bar = BAR[look];
    return (
        <nav
            aria-label="Your account"
            data-site-chrome-bar="account"
            data-account-bar={look}
            data-site-rise=""
            style={{
                gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
            }}
            className={cn(
                "font-site-body fixed z-40 grid min-[700px]:hidden [html[data-site-bar=none]_&]:hidden",
                bar.nav,
            )}
        >
            {tabs.map((tab) => {
                const on = tab.key === current;
                const dot = tab.key === "messages" && !on && unread > 0;
                return (
                    <Link
                        key={tab.key}
                        href={ACCOUNT_TAB_HREF[tab.key]}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                            "relative flex min-w-0 cursor-pointer flex-col items-center gap-[3px] active:opacity-80",
                            bar.tab,
                            look === "folio" && LOOK_RING,
                            LOOK_EASE,
                        )}
                    >
                        <svg
                            width={look === "live" ? 20 : 22}
                            height={look === "live" ? 20 : 22}
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                            className="shrink-0"
                        >
                            <path
                                d={ICON[tab.key]}
                                stroke="currentColor"
                                strokeWidth="1.9"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        <span className="max-w-full truncate">
                            {lookTabLabel(tab)}
                        </span>
                        {dot ? (
                            <>
                                <span
                                    aria-hidden="true"
                                    className="bg-site-accent absolute right-[calc(50%-18px)] top-2 size-2 rounded-full"
                                />
                                <span className="sr-only">
                                    {`(${unread} new)`}
                                </span>
                            </>
                        ) : null}
                    </Link>
                );
            })}
        </nav>
    );
}

/**
 * The account's tabs under a look. A row that is wider than the screen
 * scrolls inside itself, with a fade on the side that has more, and the
 * page you are on is brought into view.
 */
export function AccountLookTabs({
    look,
    tabs,
    unreadMessages = 0,
    footer,
}: {
    look: LookId;
    tabs: AccountTab[];
    unreadMessages?: number;
    /** Under the column on a desk (Quiet, Live): Sign out. */
    footer?: ReactNode;
}) {
    const current = currentTab(usePathname(), tabs);
    const row = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ start: false, end: false });
    const unread = useUnread(current, unreadMessages);

    useEffect(() => {
        const el = row.current;
        if (!el) return;
        const measure = () => {
            const max = el.scrollWidth - el.clientWidth;
            setEdges({
                start: el.scrollLeft > 1,
                end: max > 1 && el.scrollLeft < max - 1,
            });
        };
        // jsdom and older browsers have no scrollIntoView.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        el.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView?.({
            block: "nearest",
            inline: "nearest",
        });
        measure();
        el.addEventListener("scroll", measure, { passive: true });
        const resize =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(measure);
        resize?.observe(el);
        return () => {
            el.removeEventListener("scroll", measure);
            resize?.disconnect();
        };
    }, [current]);

    const side = SIDE[look];
    return (
        <nav
            aria-label="Your account"
            data-account-tabs={look}
            className={cn(
                "min-w-0",
                // Folio's and Live's phone keep them in the bar at the foot.
                lookHasAccountBar(look) && "max-[699px]:hidden",
                side && "min-[1000px]:sticky min-[1000px]:top-28",
            )}
        >
            {side ? (
                <p className="text-site-muted mb-4 hidden text-[12px] font-semibold uppercase tracking-[0.16em] min-[1000px]:block">
                    Your account
                </p>
            ) : null}
            <div className="relative">
                <div
                    ref={row}
                    className={cn(
                        "flex min-w-0 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                        ROW[look],
                        side &&
                            "min-[1000px]:flex-col min-[1000px]:items-stretch min-[1000px]:gap-1 min-[1000px]:overflow-visible",
                    )}
                >
                    {tabs.map((tab) => {
                        const on = tab.key === current;
                        const dot = tab.key === "messages" && !on && unread > 0;
                        return (
                            <Link
                                key={tab.key}
                                href={ACCOUNT_TAB_HREF[tab.key]}
                                aria-current={on ? "page" : undefined}
                                className={cn(
                                    "relative inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap",
                                    TAB[look],
                                    LOOK_RING,
                                    LOOK_EASE,
                                )}
                            >
                                {look === "live" ? (
                                    <TabIcon tab={tab.key} />
                                ) : null}
                                {lookTabLabel(tab)}
                                {dot ? (
                                    <>
                                        <span
                                            aria-hidden="true"
                                            className="bg-site-accent size-2 shrink-0 rounded-full"
                                        />
                                        <span className="sr-only">
                                            {`(${unread} new)`}
                                        </span>
                                    </>
                                ) : null}
                            </Link>
                        );
                    })}
                </div>
                {/* The side that has more fades into the ground. */}
                <span
                    aria-hidden="true"
                    data-account-tabs-fade="start"
                    className={cn(
                        "from-site-bg pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r to-transparent transition-opacity duration-[var(--site-motion-base,140ms)]",
                        edges.start ? "opacity-100" : "opacity-0",
                        side && "min-[1000px]:hidden",
                    )}
                />
                <span
                    aria-hidden="true"
                    data-account-tabs-fade="end"
                    className={cn(
                        "from-site-bg pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l to-transparent transition-opacity duration-[var(--site-motion-base,140ms)]",
                        edges.end ? "opacity-100" : "opacity-0",
                        side && "min-[1000px]:hidden",
                    )}
                />
            </div>
            {footer ? (
                <div className="mt-6 hidden min-[1000px]:block">{footer}</div>
            ) : null}
        </nav>
    );
}

/** The page's one heading under a look. */
export function AccountLookTitle({
    look,
    tabs,
    name,
    greeting,
    title,
}: {
    look: LookId;
    tabs: AccountTab[];
    name: string | null;
    /** "Good morning", on the business's clock when the page was drawn. */
    greeting: string;
    /** A title of the caller's, in place of the tab's (signed out). */
    title?: string;
}) {
    const pathname = usePathname();
    const words = title
        ? { text: title, name: null }
        : lookAccountTitle({ pathname, tabs, name, look, greeting });
    return (
        <h1 className={cn("m-0 [text-wrap:balance]", TITLE[look])}>
            {words.text}
            {words.name ? (
                <>
                    {look === "live" ? (
                        words.name
                    ) : (
                        <i className="italic">{words.name}</i>
                    )}
                    .
                </>
            ) : null}
        </h1>
    );
}

/** Sign out, beside the tabs on a desk. Your details keeps its own. */
export function AccountLookSignOut({
    signOut,
}: {
    signOut: () => Promise<{ ok: boolean }>;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    return (
        <button
            type="button"
            disabled={busy}
            onClick={async () => {
                if (busy) return;
                setBusy(true);
                // The session cookie is cleared either way; Your details
                // says when the business couldn't be reached.
                await signOut().catch(() => ({ ok: false }));
                router.push("/");
                router.refresh();
            }}
            className={cn(
                "text-site-fg inline-flex min-h-11 cursor-pointer items-center text-[14px] font-semibold underline decoration-1 underline-offset-[5px] hover:decoration-2 disabled:cursor-default disabled:opacity-60",
                LOOK_RING,
            )}
        >
            {busy ? "Signing out…" : "Sign out"}
        </button>
    );
}

/**
 * The account's frame under a look: its stylesheet, its tabs, the page's
 * heading and the page. `tabs` is empty while signed out (the sign-in
 * page) or when the account couldn't be read.
 */
export function AccountLookFrame({
    look,
    businessName,
    tabs,
    name = null,
    unreadMessages = 0,
    greeting,
    title,
    signOut,
    children,
}: {
    look: LookId;
    businessName: string;
    tabs: AccountTab[];
    name?: string | null;
    unreadMessages?: number;
    greeting: string;
    title?: string;
    signOut?: () => Promise<{ ok: boolean }>;
    children: ReactNode;
}) {
    const side = SIDE[look] && tabs.length > 0;
    const out = signOut ? <AccountLookSignOut signOut={signOut} /> : null;
    return (
        <div data-account-look={look} className="font-site-body text-site-body">
            <style>{accountLookRules(look)}</style>
            <div className="max-w-site-content mx-auto px-[var(--site-page-margin)] pb-[calc(var(--site-section-padding)*0.75)] pt-5 min-[700px]:pt-10">
                {look === "folio" && tabs.length > 0 ? (
                    // VA20: whose account this is, and Sign out, above the row.
                    <div className="mb-1 hidden items-center justify-between gap-4 min-[700px]:flex">
                        <p className="text-site-muted text-[12px] font-semibold uppercase tracking-[0.16em]">
                            Your account at {businessName}
                        </p>
                        {out}
                    </div>
                ) : null}
                <div
                    className={cn(
                        side &&
                            "min-[1000px]:grid min-[1000px]:grid-cols-[200px_minmax(0,1fr)] min-[1000px]:items-start min-[1000px]:gap-16",
                    )}
                >
                    {tabs.length > 0 ? (
                        <AccountLookTabs
                            look={look}
                            tabs={tabs}
                            unreadMessages={unreadMessages}
                            footer={look === "folio" ? null : out}
                        />
                    ) : null}
                    <main
                        data-site-page=""
                        data-account-body=""
                        className={cn(
                            "min-w-0",
                            tabs.length > 0 &&
                                (lookHasAccountBar(look)
                                    ? "min-[700px]:pt-12"
                                    : "pt-8 min-[700px]:pt-12"),
                            side && "min-[1000px]:pt-0",
                        )}
                    >
                        <AccountLookTitle
                            look={look}
                            tabs={tabs}
                            name={name}
                            greeting={greeting}
                            title={title}
                        />
                        <div className="mt-6 min-[700px]:mt-10">{children}</div>
                    </main>
                </div>
            </div>
            {tabs.length > 0 && (look === "folio" || look === "live") ? (
                <AccountLookBar
                    look={look}
                    tabs={tabs}
                    unreadMessages={unreadMessages}
                />
            ) : null}
        </div>
    );
}
