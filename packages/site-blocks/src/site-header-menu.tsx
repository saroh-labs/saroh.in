"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";
import { trimTrailingSlashes } from "./url-path";

/**
 * The two parts of the site header that need the browser (G17): which menu
 * entry is the page you are on, and the phone menu opening and closing.
 * Everything else in the header is drawn on the server, in `site-chrome.tsx`.
 */

export interface SiteNavItem {
    label: string;
    href: string;
    /**
     * The module page this entry opens (G14), as the publisher resolved it:
     * `BOOK`, `SHOP`, … Absent for a free-form page. The header leaves the
     * entry out while its module is off (G15, `siteMenu`).
     */
    kind?: string;
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
    const norm = (p: string) => (p.length > 1 ? trimTrailingSlashes(p) : p);
    return norm(a || "/") === norm(b || "/");
}

/** Whether `href` (already prefixed) is the page at `current`. */
function isCurrent(href: string, current: string | null): boolean {
    if (current === null || !href.startsWith("/")) return false;
    // A section of a page is never "the page you are on": on the home page
    // every one of them would be filled at once.
    if (href.includes("#")) return false;
    const path = href.split(/[?#]/)[0] ?? href;
    return samePath(path, current);
}

/*
 * IN-PAGE ENTRIES WHOSE SECTION SHOWS NOTHING.
 *
 * A menu entry can jump to a section of the home page (`/#timetable`). A
 * section bound to the business's data can draw nothing — a Timetable with
 * no sessions this week, Services with none listed — and some of them only
 * know once they have read in the browser. The server already leaves out
 * what it knows (`section-empty.ts`); these hooks settle the rest by looking
 * at the page itself.
 *
 * WHY THE DOM, AND ONE OBSERVER. The blocks already return null when they
 * have nothing, which leaves their section's wrapper (`PageSections`, the
 * element carrying the anchor as its id) with no children. Reading that is
 * the one signal every block gives without each one reporting to a shared
 * context, so a block added later is covered too. One MutationObserver on
 * the body, shared by every subscriber (the row and the phone menu), tells
 * React to look again when the page changes: a section finishing its read,
 * or a client navigation bringing in another page. What is read is a short
 * string, so a mutation that changes nothing re-renders nothing.
 *
 * The server's answer is every entry, and so is the first render in the
 * browser (hydration), so the markup matches; an entry then leaves, the
 * only shift being that link disappearing. A hidden entry is not rendered
 * at all, so it is never in the focus order.
 */

const targetListeners = new Set<() => void>();
let targetObserver: MutationObserver | null = null;

function subscribeTargets(listener: () => void): () => void {
    targetListeners.add(listener);
    if (targetObserver === null && typeof MutationObserver !== "undefined") {
        targetObserver = new MutationObserver(() => {
            targetListeners.forEach((notify) => notify());
        });
        targetObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["id"],
        });
    }
    return () => {
        targetListeners.delete(listener);
        if (targetListeners.size === 0) {
            targetObserver?.disconnect();
            targetObserver = null;
        }
    };
}

/**
 * Whether a menu entry may be shown, as far as the page in front of the
 * visitor can tell. An entry that is not a jump within the page it is on is
 * always shown: from /about, `/#visit` is on another page, which this one
 * cannot see (the server already left out what it knew was empty there).
 * On the page itself, the entry goes when its target is missing or empty.
 */
export function inPageTargetShown(
    href: string,
    doc: Document,
    currentPath: string,
): boolean {
    const hash = href.indexOf("#");
    if (hash < 0 || !href.startsWith("/")) return true;
    if (!samePath(href.slice(0, hash), currentPath)) return true;
    let id: string;
    try {
        id = decodeURIComponent(href.slice(hash + 1));
    } catch {
        return true;
    }
    if (id === "") return true;
    const target = doc.getElementById(id);
    if (!target) return false;
    return target.childElementCount > 0 || target.textContent.trim() !== "";
}

/** The entries to draw: less each jump to a section that shows nothing. */
export function useShownInPageItems<T extends SiteNavItem>(items: T[]): T[] {
    // Re-read on a client navigation, as `useCurrentPath` does.
    usePathname();
    const shown = useSyncExternalStore(
        subscribeTargets,
        () =>
            items
                .map((item) =>
                    inPageTargetShown(
                        item.href,
                        document,
                        window.location.pathname,
                    )
                        ? "1"
                        : "0",
                )
                .join(""),
        () => null,
    );
    if (!shown?.includes("0")) return items;
    return items.filter((_, i) => shown[i] !== "0");
}

/**
 * The menu as a row of pills, from 820px up. The page you are on is the
 * filled pill, and says so to a screen reader with `aria-current`.
 */
export function SiteNavRow({ items: all }: { items: SiteNavItem[] }) {
    const current = useCurrentPath();
    const items = useShownInPageItems(all);
    if (items.length === 0) return null;
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
                            "focus-visible:ring-site-accent coarse:min-h-11 inline-flex h-[34px] shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full px-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 " +
                            (on
                                ? "bg-site-fg text-site-bg active:opacity-80"
                                : // Over a full-bleed hero's photo (U2), the page's
                                  // paper, as the header's name.
                                  "text-site-body hover:bg-site-border/40 hover:text-site-fg active:bg-site-border/70 [body:has([data-site-first-hero])_&]:text-site-bg [body:has([data-site-first-hero])_&]:hover:bg-site-bg/15")
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
    items: all,
    action,
}: {
    items: SiteNavItem[];
    action: SiteHeaderAction | null;
}) {
    const current = useCurrentPath();
    const pathname = usePathname();
    const items = useShownInPageItems(all);
    const [openedOn, setOpenedOn] = useState<string | null | undefined>(
        undefined,
    );
    const open = openedOn !== undefined && openedOn === pathname;
    const listId = useId();
    const close = () => setOpenedOn(undefined);
    // Every entry gone and no main button: no menu to open.
    if (items.length === 0 && action === null) return null;

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
                className="border-site-border bg-site-surface text-site-fg focus-visible:ring-site-accent coarse:size-11 hover:bg-site-border/40 active:bg-site-border/70 aria-expanded:bg-site-border/40 flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[var(--site-radius)] border transition-colors focus-visible:outline-none focus-visible:ring-2 min-[820px]:hidden"
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
                                    "text-site-fg focus-visible:ring-site-accent active:bg-site-border/70 flex h-[46px] cursor-pointer items-center rounded-[var(--site-radius)] px-3 text-left text-base transition-colors focus-visible:outline-none focus-visible:ring-2 " +
                                    (on
                                        ? "bg-site-border/40 font-bold"
                                        : "hover:bg-site-border/25 font-medium")
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
                            className="bg-site-accent text-site-accent-fg focus-visible:ring-site-accent focus-visible:ring-offset-site-bg mt-2 flex h-12 w-full cursor-pointer items-center justify-center rounded-[var(--site-radius)] text-[15px] font-bold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:opacity-80"
                        >
                            {action.label}
                        </Link>
                    ) : null}
                </nav>
            ) : null}
        </>
    );
}
