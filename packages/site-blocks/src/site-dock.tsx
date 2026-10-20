"use client";

import Link from "next/link";

import type { DockTab } from "./look-chrome";
import { LOOK_EASE } from "./look-header-parts";
import { LookIcon } from "./look-icons";
import { isCurrent } from "./site-header-menu";

/**
 * Live's dock (DEC-172, U5, VB01HomePhone): the bar at the foot of a phone
 * with the site's few places, its main action in the middle, the shop and
 * the account. Drawn by `StickyActions`, which shows it only while it is
 * the one fixed bar: never while the consent banner, a sheet or the menu
 * is open, nor on a page with a bar of its own (booking, a product,
 * checkout).
 *
 * - A tab is lit only on its own page (`aria-current="page"`), never on a
 *   page it doesn't open: on About, none is.
 * - The main action is filled in the accent only while the page's own main
 *   action is off screen; otherwise it is a plain tab, so the view keeps
 *   one filled button (`data-site-primary`).
 * - Every tab is 54px tall, past the 44px a thumb needs. Below 700px only.
 *
 * In the page's ink, with its paper for words: a dock is the site's own,
 * never Saroh's.
 */
/**
 * The dock's shape and ink, and its tab's: one place, so the account's
 * tabs under Live (`look-account.tsx`), which stand where the dock stands,
 * are drawn the same (review #45).
 */
export const DOCK_BAR =
    "bg-site-fg text-site-bg inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] h-[66px] items-center gap-0.5 rounded-[24px] p-1.5 shadow-[0_18px_40px_-16px_hsl(var(--site-fg)/0.55)]";
export const DOCK_TAB =
    "focus-visible:ring-site-bg aria-[current=page]:bg-site-bg/15 h-[54px] justify-center rounded-[18px] px-1 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 aria-[current=page]:font-bold";

export function SiteDock({
    tabs,
    current,
}: {
    tabs: DockTab[];
    /** The path the visitor is on; null while it isn't known. */
    current: string | null;
}) {
    return (
        <nav
            aria-label="Quick links"
            data-site-chrome-bar="dock"
            data-site-rise=""
            style={{
                gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
            }}
            className={`${DOCK_BAR} font-site-body fixed z-40 grid min-[700px]:hidden`}
        >
            {tabs.map((tab) => {
                const on = isCurrent(tab.href, current);
                return (
                    <Link
                        key={tab.key}
                        href={tab.href}
                        aria-current={on ? "page" : undefined}
                        data-dock-tab={tab.key}
                        className={`${DOCK_TAB} flex min-w-0 cursor-pointer flex-col items-center gap-[3px] ${LOOK_EASE} active:opacity-80 ${
                            tab.primary
                                ? "[html[data-site-primary=gone]_&]:bg-site-accent [html[data-site-primary=gone]_&]:text-site-accent-fg text-xs font-extrabold"
                                : ""
                        }`}
                    >
                        <LookIcon name={tab.icon} look="live" size={20} />
                        <span className="max-w-full truncate">{tab.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
