"use client";

import type { LookId } from "@saroh/block-contract";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useBookReturnFocus } from "./booking-flow/book-return";
import { BarNextFree } from "./live/next-free";
import type { DockTab } from "./look-chrome";
import { lookHasBookBar } from "./look-chrome";
import { LOOK_EASE, LOOK_RING } from "./look-header-parts";
import { SiteDock } from "./site-dock";
import type { SiteHeaderAction } from "./site-header-menu";
import { useCurrentPath } from "./site-header-menu";
import { chromeActionShows, chromePageKind } from "./site-primary-action";

/**
 * ONE FIXED BAR ON A PHONE, and ONE FILLED BUTTON PER VIEW, kept in one
 * place (DEC-172, plan U5, #1092). Mounted once by the site's chrome under
 * a look; Classic never mounts it.
 *
 * WHAT IT WATCHES
 *
 * - The page's own main action: anything marked `data-site-primary`, and
 *   the site's filled buttons (the accent's fill, the closing band's), less
 *   the chrome's own (header, footer, bar, dock, dialogs). While one is on
 *   screen the page's root says `data-site-primary="shown"`, else `"gone"`;
 *   the header's Book and the dock's Book fill only while it is gone.
 *   Until this has looked (the server's paint) neither says either, and the
 *   header's Book is an outline: never two filled buttons while a page loads.
 * - What else holds the foot of the screen: the consent banner
 *   (`data-site-consent`) counts as the bar while it is open, and any open
 *   sheet or the menu (`role="dialog"` with `aria-modal`) takes the screen.
 *   The Book bar and the dock wait until they are gone.
 *
 * WHAT IT DRAWS, below 700px only (`min-[700px]:hidden`; no width is ever
 * read in script)
 *
 * - Folio and Quiet: the Book bar, the site's main action full width at
 *   the thumb, once the page's own has scrolled away. Quiet's header Book
 *   gives way while it shows (`data-site-bar="book"`). When the action is
 *   booking and the site is live, the bar says the next free time beside
 *   the button (VD01), read in the browser (U8, #1042); until it is, or
 *   when it can't be, the line is empty at the same height and the button
 *   keeps its place.
 * - Live: its dock (`site-dock.tsx`).
 * - Room under the footer for whichever it is, so the last line clears it.
 *
 * Neither is drawn on `/book` (the step's own action is the bar there),
 * nor on Folio's or Live's account pages, whose tabs are the bar there
 * (`account/look-account.tsx`, U12): room is left for them while they
 * stand (`data-site-chrome-bar="account"`), and the root says
 * `data-site-bar="account"`, or `"none"` while the foot is taken.
 * nor on a product or checkout page (Add to bag and Place order hold the
 * foot); the dock stays on the shop's grid, where nothing else does.
 */

/** The page's filled buttons: what "the page's main action" means here. */
const PRIMARY =
    "[data-site-primary], a.bg-site-accent, button.bg-site-accent, a.bg-site-cta-fg";

/** The chrome's own buttons, which are never the page's. */
const CHROME =
    "[data-site-header], [data-site-footer], [data-site-chrome-bar], [role='dialog'], [data-site-consent]";

/** The page's main actions now, in the document's order. */
export function pagePrimaries(doc: Document): Element[] {
    return Array.from(doc.querySelectorAll(PRIMARY)).filter(
        (el) => el.closest(CHROME) === null,
    );
}

/** Whether something else holds the screen's foot, or all of it. */
export function footTaken(doc: Document): boolean {
    return (
        doc.querySelector("[data-site-consent]") !== null ||
        doc.querySelector('[role="dialog"][aria-modal="true"]') !== null
    );
}

/** Whether the site's main action is its booking page. */
function isBookAction(action: SiteHeaderAction, basePath: string): boolean {
    if (action.kind) return action.kind === "book";
    const own =
        basePath && action.href.startsWith(basePath)
            ? action.href.slice(basePath.length)
            : action.href;
    return own === "/book" || own.startsWith("/book?");
}

const BAR: Record<"folio" | "quiet", string> = {
    folio: "border-site-fg px-5 pb-[calc(14px+env(safe-area-inset-bottom))]",
    quiet: "border-site-border px-6 pb-[calc(16px+env(safe-area-inset-bottom))]",
};

export function StickyActions({
    look,
    action,
    dock = [],
    basePath = "",
    live = null,
}: {
    look: LookId;
    /** The site's main action, as the header has it; none draws no bar. */
    action: SiteHeaderAction | null;
    /**
     * The live site, for the Book bar's Next free (U8). None (a preview,
     * the editor): the bar is the button alone.
     */
    live?: { siteId: string; apiUrl?: string } | null;
    /** Live's tabs (`dockTabs`); ignored by the other looks. */
    dock?: DockTab[];
    basePath?: string;
}) {
    const pathname = usePathname();
    const path = useCurrentPath();
    // Closing a look's booking lands back on the link that opened it (U10).
    useBookReturnFocus(path);
    const [primaryShown, setPrimaryShown] = useState<boolean | null>(null);
    const [taken, setTaken] = useState(false);
    const [accountBar, setAccountBar] = useState(false);

    useEffect(() => {
        const root = document.documentElement;
        const shown = new Set<Element>();
        let watched = new Set<Element>();
        const say = (on: boolean) => {
            setPrimaryShown(on);
            root.setAttribute("data-site-primary", on ? "shown" : "gone");
        };
        const io =
            typeof IntersectionObserver === "undefined"
                ? null
                : new IntersectionObserver((entries) => {
                      for (const entry of entries) {
                          if (entry.isIntersecting) shown.add(entry.target);
                          else shown.delete(entry.target);
                      }
                      say(shown.size > 0);
                  });
        const scan = () => {
            setTaken(footTaken(document));
            setAccountBar(
                document.querySelector('[data-site-chrome-bar="account"]') !==
                    null,
            );
            const next = new Set(pagePrimaries(document));
            watched.forEach((el) => {
                if (!next.has(el)) {
                    io?.unobserve(el);
                    shown.delete(el);
                }
            });
            next.forEach((el) => {
                if (!watched.has(el)) io?.observe(el);
            });
            watched = next;
            // With nothing to watch (or no observer) no callback comes.
            if (next.size === 0 || io === null) say(shown.size > 0);
        };
        scan();
        let frame = 0;
        const mo =
            typeof MutationObserver === "undefined"
                ? null
                : new MutationObserver(() => {
                      if (frame) return;
                      frame = requestAnimationFrame(() => {
                          frame = 0;
                          scan();
                      });
                  });
        mo?.observe(document.body, { childList: true, subtree: true });
        return () => {
            io?.disconnect();
            mo?.disconnect();
            if (frame) cancelAnimationFrame(frame);
            root.removeAttribute("data-site-primary");
        };
    }, [pathname]);

    const kind = chromePageKind(path, basePath);
    const ownPath =
        path && basePath && path.startsWith(basePath)
            ? path.slice(basePath.length) || "/"
            : path;
    // Folio's and Live's account pages: the account's tabs are the bar.
    const inAccount =
        look !== "quiet" &&
        (ownPath === "/account" || (ownPath ?? "").startsWith("/account/"));
    const bookBar =
        !inAccount &&
        lookHasBookBar(look) &&
        action !== null &&
        kind === "page" &&
        chromeActionShows(path, action, basePath) &&
        primaryShown === false &&
        !taken;
    // Next free beside Book, only when the bar books (U8).
    const nextFree =
        live && action !== null && isBookAction(action, basePath) ? live : null;
    const dockRoom =
        !inAccount &&
        look === "live" &&
        dock.length > 1 &&
        (kind === "page" || ownPath === "/shop" || ownPath === "/shop/");
    const dockOn = dockRoom && !taken;
    const bar = bookBar
        ? "book"
        : dockOn
          ? "dock"
          : inAccount && accountBar && !taken
            ? "account"
            : "none";

    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute("data-site-bar", bar);
        return () => root.removeAttribute("data-site-bar");
    }, [bar]);

    // Room under the footer while a bar may stand over it.
    const room =
        dockRoom ||
        (inAccount && accountBar) ||
        (!inAccount &&
            lookHasBookBar(look) &&
            action !== null &&
            kind === "page" &&
            chromeActionShows(path, action, basePath));

    return (
        <>
            {room ? (
                <div
                    aria-hidden="true"
                    data-site-bar-room=""
                    className={`bg-site-footer-bg min-[700px]:hidden ${look === "live" ? "h-24" : inAccount ? "h-[72px]" : "h-[84px]"}`}
                />
            ) : null}
            {bookBar && look !== "live" ? (
                <div
                    data-site-chrome-bar="book"
                    data-site-rise=""
                    className={`bg-site-bg font-site-body fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t pt-3 min-[700px]:hidden ${BAR[look]}`}
                >
                    {nextFree ? (
                        <BarNextFree
                            siteId={nextFree.siteId}
                            apiUrl={nextFree.apiUrl}
                        />
                    ) : null}
                    <Link
                        href={action.href}
                        className={`bg-site-accent text-site-accent-fg border-site-accent rounded-site flex h-[52px] cursor-pointer items-center justify-center border text-[15px] font-semibold tracking-[0.02em] ${nextFree ? "flex-none px-6" : "flex-1"} ${LOOK_RING} ${LOOK_EASE} active:opacity-80`}
                    >
                        {action.label}
                    </Link>
                </div>
            ) : null}
            {dockOn ? <SiteDock tabs={dock} current={path} /> : null}
        </>
    );
}
