"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    useEffect,
    useId,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

import type { SitePrimaryKind } from "./site-primary-action";
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

/**
 * The header's one main button: "Book", "Order" or "Contact us", or
 * nothing (`sitePrimaryAction`).
 */
export interface SiteHeaderAction {
    label: string;
    href: string;
    /**
     * Which action it is, when the rule chose it: the menu then leaves out
     * that module's page wherever the merchant put it.
     */
    kind?: SitePrimaryKind;
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
 * How the chrome's controls move: short, and on one curve that starts fast
 * and settles, so a press answers at once. Colour, opacity and transform
 * only. Literal strings, so Tailwind finds them.
 */
const MOVES =
    "transition-[color,background-color,border-color,opacity,transform] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)]";

/**
 * The menu as a row of pills, from 820px up. The page you are on is the
 * filled pill, and says so to a screen reader with `aria-current`.
 *
 * A menu too long for the row scrolls sideways inside it rather than
 * pushing the bag, the account and the main button off the edge: every
 * entry stays a Tab away, and focus brings it into view. The row's own
 * padding keeps a focus ring from being clipped.
 */
export function SiteNavRow({ items: all }: { items: SiteNavItem[] }) {
    const current = useCurrentPath();
    const items = useShownInPageItems(all);
    if (items.length === 0) return null;
    return (
        <nav
            aria-label="Site"
            className="-my-1 ml-1.5 hidden min-w-0 flex-[0_4_auto] items-center gap-0.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] min-[820px]:flex min-[820px]:min-w-[10rem] [&::-webkit-scrollbar]:hidden"
        >
            {items.map((item) => {
                const on = isCurrent(item.href, current);
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={on ? "page" : undefined}
                        className={
                            `focus-visible:ring-site-accent coarse:min-h-11 inline-flex h-[34px] shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full px-3 text-[13.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 ${MOVES} ` +
                            (on
                                ? "bg-site-fg text-site-bg active:opacity-80"
                                : // Over a full-bleed hero's photo (U2), the page's
                                  // paper, as the header's name.
                                  "text-site-body hover:bg-site-border/40 hover:text-site-fg active:bg-site-border/70 [body:has([data-site-first-hero])_&]:text-site-bg [body:has([data-site-first-hero])_&]:hover:bg-site-bg/15 [body:has([data-site-first-hero])_&]:focus-visible:ring-site-bg")
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
 * The header's main button at the desk. Drawn here, in the browser's half,
 * for one reason: on the page it opens it says so (`aria-current`), since
 * the menu no longer holds an entry for that page to say it.
 */
export function SiteActionLink({ action }: { action: SiteHeaderAction }) {
    const current = useCurrentPath();
    return (
        <Link
            href={action.href}
            aria-current={isCurrent(action.href, current) ? "page" : undefined}
            className={`bg-site-accent text-site-accent-fg focus-visible:ring-site-accent focus-visible:ring-offset-site-bg coarse:min-h-11 [body:has([data-site-first-hero])_&]:focus-visible:ring-site-bg [body:has([data-site-first-hero])_&]:focus-visible:ring-offset-site-fg hidden h-10 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-[var(--site-radius)] px-4 text-sm font-bold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] active:opacity-80 min-[820px]:inline-flex ${MOVES}`}
        >
            {action.label}
        </Link>
    );
}

/** What Tab moves between inside the open menu. */
const FOCUSABLE = "a[href], button:not([disabled])";

/**
 * Below 820px: a menu button, and under the header a panel of the pages
 * with the main button full-width at its foot.
 *
 * The panel closes when an entry is chosen, on Escape (focus goes back to
 * the button), on a press anywhere outside it, and on any navigation, back
 * and forward included: it remembers the path it was opened on and is only
 * open while that is still the path.
 *
 * While it is open, Tab moves between the button and the panel's entries
 * and nowhere else, so a keyboard never wanders onto the page underneath;
 * the page is dimmed by the site's own ink. A menu taller than the screen
 * scrolls inside the panel, so every entry can be reached. The bag and the
 * account stay where they were in the row above.
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
    const button = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLElement>(null);
    const close = () => setOpenedOn(undefined);

    useEffect(() => {
        if (!open) return;
        const within = (target: EventTarget | null) =>
            target instanceof Node &&
            (button.current?.contains(target) === true ||
                panel.current?.contains(target) === true);
        const onPress = (e: Event) => {
            if (!within(e.target)) setOpenedOn(undefined);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOpenedOn(undefined);
                button.current?.focus();
                return;
            }
            if (e.key !== "Tab") return;
            const stops = [
                button.current,
                ...Array.from(
                    panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ??
                        [],
                ),
            ].filter((el): el is HTMLElement => el !== null);
            if (stops.length === 0) return;
            const at = stops.indexOf(document.activeElement as HTMLElement);
            const next = e.shiftKey
                ? at <= 0
                    ? stops.length - 1
                    : at - 1
                : at < 0 || at === stops.length - 1
                  ? 0
                  : at + 1;
            e.preventDefault();
            stops[next]?.focus();
        };
        document.addEventListener("pointerdown", onPress);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPress);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    // Every entry gone and no main button: no menu to open.
    if (items.length === 0 && action === null) return null;

    return (
        <>
            <button
                ref={button}
                type="button"
                aria-label="Menu"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpenedOn(open ? undefined : pathname)}
                className={`border-site-border bg-site-surface text-site-fg focus-visible:ring-site-accent hover:bg-site-border/40 active:bg-site-border/70 aria-expanded:bg-site-border/40 [body:has([data-site-first-hero])_&]:focus-visible:ring-site-bg flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[var(--site-radius)] border focus-visible:outline-none focus-visible:ring-2 active:scale-[0.96] min-[820px]:hidden ${MOVES}`}
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                >
                    <path
                        // Three lines; a cross while the panel is open.
                        d={
                            open
                                ? "M6 6 L18 18 M18 6 L6 18"
                                : "M4 7 H20 M4 12 H20 M4 17 H20"
                        }
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                </svg>
            </button>
            {open ? (
                <>
                    {/* The page under the menu, dimmed in the site's own
                        ink. A press on it closes the menu (the listener
                        above); it holds nothing to read or focus. */}
                    <div
                        aria-hidden="true"
                        data-site-menu-scrim=""
                        className="bg-site-fg/30 absolute inset-x-0 top-full h-[100dvh] min-[820px]:hidden"
                    />
                    <nav
                        ref={panel}
                        id={listId}
                        aria-label="Site"
                        data-site-menu-panel=""
                        className="border-site-border bg-site-bg absolute inset-x-0 top-full grid max-h-[calc(100dvh-5rem)] gap-0.5 overflow-y-auto overscroll-contain border-b border-t px-3 pb-3.5 pt-2 min-[820px]:hidden"
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
                                        `text-site-fg focus-visible:ring-site-accent active:bg-site-border/70 flex min-h-12 cursor-pointer items-center rounded-[var(--site-radius)] px-3 py-2 text-left text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${MOVES} ` +
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
                                aria-current={
                                    isCurrent(action.href, current)
                                        ? "page"
                                        : undefined
                                }
                                className={`bg-site-accent text-site-accent-fg focus-visible:ring-site-accent focus-visible:ring-offset-site-bg mt-2 flex h-12 w-full cursor-pointer items-center justify-center rounded-[var(--site-radius)] text-[15px] font-bold hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.99] active:opacity-80 ${MOVES}`}
                            >
                                {action.label}
                            </Link>
                        ) : null}
                    </nav>
                </>
            ) : null}
        </>
    );
}

/**
 * The site's menu again at the foot of the page, as a list. Every page is
 * here, the one the header's main button opens included: the footer is
 * where someone looks for a page by name, not a second ask.
 *
 * In the browser's half for the same reason the header's row is: an entry
 * that jumps to a section showing nothing leaves (`useShownInPageItems`).
 * With no entry left it draws nothing, its heading included.
 */
export function SiteFooterMenu({
    items: all,
    heading,
    headingClassName,
    linkClassName,
}: {
    items: SiteNavItem[];
    heading: string;
    headingClassName: string;
    linkClassName: string;
}) {
    const current = useCurrentPath();
    const items = useShownInPageItems(all);
    const headingId = useId();
    if (items.length === 0) return null;
    return (
        <nav aria-labelledby={headingId} data-site-footer-menu="">
            <h2 id={headingId} className={headingClassName}>
                {heading}
            </h2>
            <ul className="m-0 grid list-none gap-0.5 p-0">
                {items.map((item) => (
                    <li key={item.href}>
                        <Link
                            href={item.href}
                            aria-current={
                                isCurrent(item.href, current)
                                    ? "page"
                                    : undefined
                            }
                            className={linkClassName}
                        >
                            {item.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
