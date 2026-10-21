"use client";

import type { LookId } from "@saroh/block-contract";
import Link from "next/link";

import type { SiteHeaderAction, SiteNavItem } from "./site-header-menu";
import {
    isCurrent,
    useCurrentPath,
    useShownInPageItems,
} from "./site-header-menu";
import { chromeActionShows } from "./site-primary-action";

/**
 * The parts of a look's header that need the browser (DEC-172, U5): which
 * menu entry is the page you are on, and whether the main button shows on
 * this page. Everything else is drawn on the server (`look-header.tsx`).
 */

/** A ring every look's chrome shares: the page's ink, 2px, set off. */
export const LOOK_RING =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-fg focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

/** Colour changes over the look's base step (140ms), never longer. */
export const LOOK_EASE =
    "transition-[color,background-color,border-color,box-shadow,opacity] duration-[var(--site-motion-base,140ms)] [transition-timing-function:var(--site-ease,ease-out)]";

/*
 * ONE FILLED BUTTON PER VIEW. The header's Book is an outline by default,
 * and fills only while the page's own main action is off screen:
 * `sticky-actions.tsx` marks the page `data-site-primary="gone"` then.
 * The server's first paint is the outline, so a page never shows two
 * filled buttons while it loads.
 */
const FILLS_WHEN_GONE =
    "[html[data-site-primary=gone]_&]:border-site-accent [html[data-site-primary=gone]_&]:bg-site-accent [html[data-site-primary=gone]_&]:text-site-accent-fg";

/** The header's main button per look, as each fixed board draws it. */
const ACTION: Record<LookId, string> = {
    // VAHeader / VA01: square, an ink hairline, small; never on a phone
    // (the menu and the Book bar carry it there).
    folio: "rounded-site border border-site-fg bg-transparent px-[18px] text-sm font-semibold tracking-[0.02em] text-site-fg max-[699px]:hidden",
    // VDHeader / VD01: a pill with an ink edge; on a phone it stays, and
    // gives way while the Book bar shows (one fixed bar, one Book).
    quiet: "rounded-site border border-site-fg bg-transparent px-5 text-[14.5px] font-medium tracking-[0.02em] text-site-fg max-[699px]:px-[18px] max-[699px]:[html[data-site-bar=book]_&]:hidden",
    // VB01: a white pill with a control edge; the dock carries Book on a
    // phone.
    live: "rounded-full border-[1.5px] border-site-rule bg-site-surface px-4 text-[14.5px] font-bold text-site-fg max-[699px]:hidden",
};

/**
 * The header's main button under a look. Not drawn on the page it opens
 * (on `/book` the step's own action is the one filled button) nor on the
 * shop's pages, where the header holds the bag only
 * (`chromeActionShows`).
 */
export function LookActionLink({
    action,
    look,
    basePath = "",
}: {
    action: SiteHeaderAction;
    look: LookId;
    basePath?: string;
}) {
    const path = useCurrentPath();
    if (!chromeActionShows(path, action, basePath)) return null;
    return (
        <Link
            href={action.href}
            data-site-header-action=""
            className={`inline-flex h-11 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap ${ACTION[look]} ${FILLS_WHEN_GONE} ${LOOK_RING} ${LOOK_EASE} active:opacity-80`}
        >
            {action.label}
        </Link>
    );
}

/** The menu's row per look, from 700px up. */
const NAV: Record<LookId, { nav: string; link: string }> = {
    folio: {
        nav: "justify-center gap-[30px]",
        link: "text-site-body hover:text-site-fg aria-[current=page]:text-site-fg aria-[current=page]:shadow-[inset_0_-1px_0_hsl(var(--site-fg))] text-[14.5px]",
    },
    quiet: {
        nav: "justify-start gap-[30px]",
        link: "text-site-body hover:text-site-fg aria-[current=page]:text-site-fg aria-[current=page]:underline aria-[current=page]:decoration-1 aria-[current=page]:underline-offset-8 text-[14.5px]",
    },
    live: {
        nav: "justify-center gap-1 rounded-full bg-site-surface p-1",
        link: "rounded-full px-[15px] text-[15px] font-semibold text-site-fg hover:bg-site-accent-soft aria-[current=page]:bg-site-fg aria-[current=page]:text-site-bg",
    },
};

/**
 * The menu as a row, from 700px up. The page you are on says so
 * (`aria-current`) and is marked the look's way: an ink rule under it
 * (Folio), an underline (Quiet) or a filled pill (Live). A row too long
 * for the header scrolls inside itself, so the bag, the account and the
 * main button keep their place; focus brings an entry into view.
 */
export function LookNavRow({
    items: all,
    look,
}: {
    items: SiteNavItem[];
    look: LookId;
}) {
    const current = useCurrentPath();
    const items = useShownInPageItems(all);
    if (items.length === 0) return null;
    const style = NAV[look];
    return (
        <div
            className={`hidden min-w-0 min-[700px]:flex ${look === "quiet" ? "min-[700px]:justify-start" : "min-[700px]:justify-center"}`}
        >
            <nav
                aria-label="Site"
                className={`flex min-w-0 items-center overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${style.nav}`}
            >
                {items.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={
                            isCurrent(item.href, current) ? "page" : undefined
                        }
                        className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center whitespace-nowrap ${style.link} ${LOOK_RING} ${LOOK_EASE}`}
                    >
                        {item.label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
