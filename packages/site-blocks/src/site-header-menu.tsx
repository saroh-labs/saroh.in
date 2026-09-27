"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";

/**
 * The two parts of the site header that need the browser (G17): which menu
 * entry is the page you are on, and the phone menu opening and closing.
 * Everything else in the header is drawn on the server, in `site-chrome.tsx`.
 */

export interface SiteNavItem {
    label: string;
    href: string;
}

/** The header's one main button: "Book" or "Order", or nothing. */
export interface SiteHeaderAction {
    label: string;
    href: string;
}

const noSubscribe = () => () => undefined;

/**
 * The path the visitor is on, or `null` while it is not known yet.
 *
 * READ FROM THE ADDRESS BAR, NOT FROM THE ROUTER. `saroh.app`'s middleware
 * rewrites every merchant host to `/<domain>/<path>`, so the router's own
 * pathname may carry the host in front, and a server render has no idea what
 * the browser shows. The server answers `null` (nothing marked current), the
 * browser answers `location.pathname`. `usePathname` is called only so a
 * client navigation re-renders this and the snapshot is read again.
 */
function useCurrentPath(): string | null {
    usePathname();
    return useSyncExternalStore(
        noSubscribe,
        () => window.location.pathname,
        () => null,
    );
}

/** "/about/" and "/about" are the same page; "" is home. */
function samePath(a: string, b: string): boolean {
    const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
    return norm(a || "/") === norm(b || "/");
}

/** Whether `href` (already prefixed) is the page at `current`. */
function isCurrent(href: string, current: string | null): boolean {
    if (current === null || !href.startsWith("/")) return false;
    const path = href.split(/[?#]/)[0] ?? href;
    return samePath(path, current);
}

/**
 * The menu as a row of pills, from 820px up. The page you are on is the
 * filled pill, and says so to a screen reader with `aria-current`.
 */
export function SiteNavRow({ items }: { items: SiteNavItem[] }) {
    const current = useCurrentPath();
    return (
        <nav
            aria-label="Site"
            className="ml-2.5 hidden min-w-0 items-center gap-0.5 min-[820px]:flex"
        >
            {items.map((item) => {
                const on = isCurrent(item.href, current);
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={on ? "page" : undefined}
                        className={
                            "focus-visible:ring-site-accent coarse:min-h-11 inline-flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 " +
                            (on
                                ? "bg-site-fg text-site-bg"
                                : "text-site-body hover:text-site-fg")
                        }
                    >
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}

/**
 * Below 820px: a menu button, and under the header a list of the pages with
 * the main button full-width at its foot.
 *
 * The list closes when an entry is chosen, on Escape, and on any navigation,
 * back and forward included: it remembers the path it was opened on and is
 * only open while that is still the path.
 */
export function SiteMenu({
    items,
    action,
}: {
    items: SiteNavItem[];
    action: SiteHeaderAction | null;
}) {
    const current = useCurrentPath();
    const pathname = usePathname();
    const [openedOn, setOpenedOn] = useState<string | null | undefined>(
        undefined,
    );
    const open = openedOn !== undefined && openedOn === pathname;
    const listId = useId();
    const close = () => setOpenedOn(undefined);

    return (
        <>
            <button
                type="button"
                aria-label="Menu"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpenedOn(open ? undefined : pathname)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") close();
                }}
                className="border-site-border bg-site-surface text-site-fg focus-visible:ring-site-accent coarse:size-11 flex size-10 shrink-0 items-center justify-center rounded-[var(--site-radius)] border focus-visible:outline-none focus-visible:ring-2 min-[820px]:hidden"
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                >
                    <path
                        d="M4 7 H20 M4 12 H20 M4 17 H20"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                </svg>
            </button>
            {open ? (
                <nav
                    id={listId}
                    aria-label="Site"
                    onKeyDown={(e) => {
                        if (e.key === "Escape") close();
                    }}
                    className="border-site-border bg-site-bg absolute inset-x-0 top-full grid gap-0.5 border-b border-t px-3 pb-3.5 pt-2 min-[820px]:hidden"
                >
                    {items.map((item) => {
                        const on = isCurrent(item.href, current);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={close}
                                aria-current={on ? "page" : undefined}
                                className={
                                    "text-site-fg focus-visible:ring-site-accent flex h-[46px] items-center rounded-[var(--site-radius)] px-3 text-left text-base focus-visible:outline-none focus-visible:ring-2 " +
                                    (on
                                        ? "bg-site-border/40 font-bold"
                                        : "font-medium")
                                }
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                    {action ? (
                        <Link
                            href={action.href}
                            onClick={close}
                            className="bg-site-accent text-site-accent-fg focus-visible:ring-site-accent focus-visible:ring-offset-site-bg mt-2 flex h-12 w-full items-center justify-center rounded-[var(--site-radius)] text-[15px] font-bold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        >
                            {action.label}
                        </Link>
                    ) : null}
                </nav>
            ) : null}
        </>
    );
}
