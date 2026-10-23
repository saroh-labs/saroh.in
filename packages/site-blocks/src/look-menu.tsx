"use client";

import type { LookId } from "@saroh/block-contract";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { hoursRows } from "./blocks/hours";
import type { OpeningHoursDay } from "./lib/opening-hours";
import { FALLBACK_TIME_ZONE, weekdayIn } from "./lib/opening-hours";
import { phoneText } from "./lib/phone";
import { useScrollLock } from "./lib/sheet-shell";
import type { SiteSession } from "./look-chrome";
import { LOOK_EASE, LOOK_RING } from "./look-header-parts";
import { LookIcon } from "./look-icons";
import type { SiteHeaderAction, SiteNavItem } from "./site-header-menu";
import {
    isCurrent,
    useCurrentPath,
    useShownInPageItems,
} from "./site-header-menu";
import { chromeActionShows } from "./site-primary-action";

/**
 * Where to find the business, as the phone menu says it (U5, VD01 "Menu
 * open"): the first place's address on one line and its week, which the
 * menu reads for today, and how to reach the business. Every value is the
 * footer's own (`SiteContact`), read live.
 */
export interface LookMenuFacts {
    address: string | null;
    hours: readonly OpeningHoursDay[] | null;
    timeZone?: string | null;
    /** E.164, for `tel:`. */
    phone: string | null;
    /** The business's own wa.me chat link; kept in every look (DEC-172). */
    whatsapp: string | null;
}

/** "Today: 6 am to 8:30 pm", "Closed today", or nothing to say. */
export function todayLine(
    hours: readonly OpeningHoursDay[] | null | undefined,
    timeZone: string | null | undefined,
    now: Date,
): string | null {
    const rows = hoursRows(hours, true);
    if (!rows) return null;
    const zone = timeZone?.trim() ? timeZone.trim() : FALLBACK_TIME_ZONE;
    const day = weekdayIn(now, zone);
    const row = rows.find((r) => r.day === day);
    if (!row) return null;
    return row.hours ? `Today: ${row.hours}` : "Closed today";
}

/** The menu's pages per look: the look's display face, a hairline under each. */
const PAGE_LINK: Record<LookId, string> = {
    folio: "font-site-heading text-[26px] font-light tracking-[-0.015em]",
    quiet: "font-site-heading text-[26px] font-normal",
    live: "font-site-heading text-[22px] font-extrabold tracking-[-0.02em]",
};

/** What the menu button looks like per look (VA01, VD01, VB01 phone). */
const MENU_BUTTON: Record<LookId, string> = {
    folio: "size-11 justify-center text-site-fg",
    quiet: "min-h-11 min-w-11 justify-center px-2 text-site-fg",
    live: "size-11 justify-center rounded-full bg-site-accent-soft text-site-fg",
};

/** What Tab moves between inside the open menu. */
const FOCUSABLE = "a[href], button:not([disabled])";

/**
 * The phone menu under a look (DEC-172, U5): a button in the header that
 * opens a full-height dialog with the site's pages, "Visit us" with
 * today's hours, Your account or Sign in, Call and the business's own
 * WhatsApp chat, and the site's main action as the one filled button.
 *
 * - It is a real dialog: `role="dialog"`, `aria-modal`, focus on its
 *   Close button when it opens, Tab kept inside it, Escape and Close give
 *   focus back to the menu button. The page behind is `inert` and held
 *   still, and the Book bar and the dock wait while it is open
 *   (`sticky-actions.tsx` sees the dialog).
 * - It closes on any navigation, back and forward included, and when an
 *   entry is chosen.
 * - Drawn over the whole screen in the page's own ground; it comes in
 *   over the look's slow step (`data-site-menu-panel`, 200ms), as a fade
 *   alone for reduced motion.
 * - Below 700px only: from there up the menu is a row in the header.
 *
 * Your account / Sign in is drawn only here in the browser, from
 * `session`; with no customer accounts it is not offered.
 */
export function LookMenu({
    look,
    name,
    homeHref,
    items: all,
    action,
    facts,
    session = null,
    basePath = "",
    side = "end",
}: {
    look: LookId;
    name: string;
    homeHref: string;
    items: SiteNavItem[];
    action: SiteHeaderAction | null;
    facts: LookMenuFacts | null;
    session?: SiteSession | null;
    basePath?: string;
    /** Where the button sits in the row: Quiet puts it first. */
    side?: "start" | "end";
}) {
    const pathname = usePathname();
    const current = useCurrentPath();
    const items = useShownInPageItems(all);
    const [openedOn, setOpenedOn] = useState<string | null | undefined>(
        undefined,
    );
    const open = openedOn !== undefined && openedOn === pathname;
    const titleId = useId();
    const button = useRef<HTMLButtonElement>(null);
    const dialog = useRef<HTMLDivElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    // Focus goes back to the menu button once the page is released (an
    // `inert` element takes no focus), so it is asked for here and given
    // when the dialog's effect lets go.
    const refocus = useRef(false);
    useScrollLock(open);

    const close = (andRefocus: boolean) => {
        refocus.current = andRefocus;
        setOpenedOn(undefined);
    };

    // The page behind can't be reached while the menu is open: every other
    // child of the body is `inert` (no focus, no press, not read out).
    useEffect(() => {
        if (!open) return;
        const opener = button.current;
        const own = dialog.current?.parentElement ?? null;
        const others = Array.from(document.body.children).filter(
            (el) => el !== own && !el.hasAttribute("inert"),
        );
        others.forEach((el) => el.setAttribute("inert", ""));
        closeButton.current?.focus();
        return () => {
            others.forEach((el) => el.removeAttribute("inert"));
            if (refocus.current) opener?.focus();
            refocus.current = false;
        };
    }, [open]);

    if (items.length === 0 && action === null && facts === null) return null;

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === "Escape") {
            event.stopPropagation();
            close(true);
            return;
        }
        if (event.key !== "Tab" || !dialog.current) return;
        const stops = Array.from(
            dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        );
        const first = stops.at(0);
        const last = stops.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    /** An entry chosen: close, and for a jump on this page, go there. */
    const choose = (href: string) => () => {
        refocus.current = false;
        setOpenedOn(undefined);
        if (href.startsWith("#")) {
            const id = href.slice(1);
            // After the page behind is released and can scroll again.
            requestAnimationFrame(() =>
                document.getElementById(id)?.scrollIntoView(),
            );
        }
    };

    const today =
        open && facts
            ? todayLine(facts.hours, facts.timeZone, new Date())
            : null;
    const showAction = action && chromeActionShows(current, action, basePath);
    const linkClass = `inline-flex min-h-11 cursor-pointer items-center gap-2 text-[15px] font-medium text-site-fg ${LOOK_RING} ${LOOK_EASE}`;
    const underline = "underline decoration-1 underline-offset-4";

    return (
        <>
            <button
                ref={button}
                type="button"
                aria-label="Menu"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpenedOn(pathname)}
                data-site-menu-button={side}
                className={`inline-flex shrink-0 cursor-pointer items-center min-[700px]:hidden ${MENU_BUTTON[look]} ${LOOK_RING} ${LOOK_EASE} active:opacity-70`}
            >
                <LookIcon name="menu" look={look} />
            </button>
            {open
                ? createPortal(
                      <div data-site-menu-layer="">
                          <div
                              ref={dialog}
                              role="dialog"
                              aria-modal="true"
                              aria-labelledby={titleId}
                              onKeyDown={onKeyDown}
                              data-site-menu-panel=""
                              data-site-look-menu={look}
                              className="bg-site-bg text-site-fg font-site-body fixed inset-0 z-[70] flex flex-col overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] min-[700px]:hidden"
                          >
                              <div className="flex shrink-0 items-center justify-between gap-2 py-2.5 pl-3 pr-3">
                                  <button
                                      ref={closeButton}
                                      type="button"
                                      aria-label="Close menu"
                                      onClick={() => close(true)}
                                      className={`text-site-fg inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full ${LOOK_RING} ${LOOK_EASE} active:opacity-70`}
                                  >
                                      <LookIcon name="close" look={look} />
                                  </button>
                                  <Link
                                      id={titleId}
                                      href={homeHref}
                                      onClick={choose(homeHref)}
                                      className={`font-site-heading inline-flex min-h-11 min-w-0 items-center truncate text-2xl ${LOOK_RING}`}
                                  >
                                      {name}
                                  </Link>
                                  <span
                                      aria-hidden="true"
                                      className="w-11 shrink-0"
                                  />
                              </div>
                              {items.length > 0 ? (
                                  <nav
                                      aria-label="Pages"
                                      className="border-site-border border-t px-6"
                                  >
                                      {items.map((item) => (
                                          <Link
                                              key={item.href}
                                              href={item.href}
                                              onClick={choose(item.href)}
                                              aria-current={
                                                  isCurrent(item.href, current)
                                                      ? "page"
                                                      : undefined
                                              }
                                              className={`border-site-border text-site-fg flex min-h-[52px] cursor-pointer items-center justify-between gap-3 border-b aria-[current=page]:underline aria-[current=page]:decoration-1 aria-[current=page]:underline-offset-4 ${PAGE_LINK[look]} ${LOOK_RING} ${LOOK_EASE}`}
                                          >
                                              <span className="min-w-0">
                                                  {item.label}
                                              </span>
                                              <LookIcon
                                                  name="arrow"
                                                  look={look}
                                                  size={18}
                                              />
                                          </Link>
                                      ))}
                                  </nav>
                              ) : null}
                              {facts?.address ? (
                                  <div
                                      data-site-menu-visit=""
                                      className="grid gap-1.5 px-6 pt-6"
                                  >
                                      <p className="text-site-muted m-0 text-xs font-semibold uppercase tracking-[0.16em]">
                                          Visit us
                                      </p>
                                      <p className="text-site-body m-0 text-sm leading-relaxed">
                                          {facts.address}
                                      </p>
                                      {today ? (
                                          <p className="text-site-muted m-0 text-[13px]">
                                              {today}
                                          </p>
                                      ) : null}
                                  </div>
                              ) : null}
                              <div className="flex flex-wrap gap-x-[18px] px-6 pt-3">
                                  {session ? (
                                      <Link
                                          href={`${basePath}/account`}
                                          onClick={choose("/account")}
                                          className={linkClass}
                                      >
                                          <LookIcon
                                              name="you"
                                              look={look}
                                              size={20}
                                          />
                                          <span className={underline}>
                                              {session.signedIn
                                                  ? "Your account"
                                                  : "Sign in"}
                                          </span>
                                      </Link>
                                  ) : null}
                                  {facts?.phone ? (
                                      <a
                                          href={`tel:${facts.phone.replace(/[^\d+]/g, "")}`}
                                          aria-label={`Call ${phoneText(facts.phone)}`}
                                          className={linkClass}
                                      >
                                          <LookIcon
                                              name="call"
                                              look={look}
                                              size={20}
                                          />
                                          <span className={underline}>
                                              Call
                                          </span>
                                      </a>
                                  ) : null}
                                  {facts?.whatsapp ? (
                                      <a
                                          href={facts.whatsapp}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={linkClass}
                                      >
                                          <LookIcon
                                              name="chat"
                                              look={look}
                                              size={20}
                                          />
                                          <span className={underline}>
                                              Message on WhatsApp
                                          </span>
                                      </a>
                                  ) : null}
                              </div>
                              {showAction ? (
                                  <div className="mt-auto px-6 pb-6 pt-5">
                                      <Link
                                          href={action.href}
                                          onClick={choose(action.href)}
                                          className={`bg-site-accent text-site-accent-fg border-site-accent rounded-site flex h-[52px] w-full cursor-pointer items-center justify-center border text-[15px] font-semibold tracking-[0.02em] ${LOOK_RING} ${LOOK_EASE} active:opacity-80`}
                                      >
                                          {action.label}
                                      </Link>
                                  </div>
                              ) : null}
                          </div>
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
}
