"use client";

import { Wordmark } from "@saroh/ui/wordmark";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../cn";
import { IntentLink } from "../links/intent-link";
import { ring } from "../ring";
import { MenuPanel } from "./menu-panel";
import type { MenuLink, NavItem } from "./nav-types";

/** One entry on the desk nav: a page, or a menu that opens across the nav. */
export type NavEntry =
    | { id: string; label: string; href: string }
    | {
          id: string;
          label: string;
          menu: {
              items: NavItem[];
              /** Columns when the items have no groups. */
              columns: number;
              seeAll?: MenuLink;
              links?: MenuLink[];
          };
      };

/** What the site's own parts get, to open and close with the nav's menus. */
export interface NavControl {
    /** The open menu's id, or null. */
    open: string | null;
    toggle: (id: string) => void;
    close: () => void;
}

/** A top-level control: 44px to tap, 10px corners, Paper-dark on hover. */
export const NAV_TOP = `flex h-11 cursor-pointer items-center rounded-[10px] px-3.5 text-[15px] font-medium text-mk-copy no-underline transition-colors duration-fast ease-out hover:bg-mk-hover hover:text-foreground ${ring({ offset: 1 })}`;

/** The section the page is in: Ink, 600, the Saffron rule under it. */
export const NAV_CURRENT =
    "font-semibold text-foreground underline decoration-brand-500 decoration-2 underline-offset-8";

/**
 * The redesign's nav (KIT.md, the TS board), shared by every edition: the
 * wordmark, then `entries` (Solutions · How it works · Templates · Pricing
 * · Developers, as the site words and switches them), then `end` (Sign in
 * and Start free, from the site's `cta()`), from 760px; below it the
 * wordmark and `phone` (the site's start button and Menu sheet).
 *
 * The site decides what shows and where it links; this file decides how it
 * draws and behaves. One menu opens at a time, across the nav; it closes on
 * Escape (focus back to its button), a click outside, focus leaving the nav
 * and a new page. `end` and `phone` are render functions, so a site's own
 * menu (the account menu) opens and closes with the rest.
 *
 * Sticky at the top as the page scrolls; `--mk-nav-h` is its height.
 */
export function MarketingNav({
    entries,
    current,
    pathname,
    end,
    phone,
    homeLabel = "Saroh home",
}: {
    entries: readonly NavEntry[];
    /** The entry the page is in, by id. */
    current: string | null;
    pathname: string;
    end: (control: NavControl) => ReactNode;
    phone: (control: NavControl) => ReactNode;
    homeLabel?: string;
}) {
    const [open, setOpen] = useState<string | null>(null);
    const nav = useRef<HTMLElement>(null);

    // A new page closes whatever was open (adjusted while rendering).
    const [shownFor, setShownFor] = useState(pathname);
    if (shownFor !== pathname) {
        setShownFor(pathname);
        setOpen(null);
    }

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!nav.current?.contains(e.target as Node)) setOpen(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            nav.current
                ?.querySelector<HTMLElement>('button[aria-expanded="true"]')
                ?.focus();
            setOpen(null);
        };
        document.addEventListener("click", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("click", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const control: NavControl = {
        open,
        toggle: (id) => setOpen(open === id ? null : id),
        close: () => setOpen(null),
    };

    return (
        <nav
            ref={nav}
            aria-label="Main"
            onBlur={(e) => {
                if (open && !nav.current?.contains(e.relatedTarget)) {
                    setOpen(null);
                }
            }}
            className="sticky top-0 z-30 border-b border-border bg-background font-sans"
        >
            <div className="mx-auto flex h-16 max-w-mk-page items-center gap-6 px-mk-gutter max-[399px]:gap-3 min-[760px]:h-20">
                <IntentLink
                    href="/"
                    aria-label={homeLabel}
                    className={`flex shrink-0 rounded-lg text-foreground no-underline ${ring({ offset: 3 })}`}
                >
                    <Wordmark aria-hidden style={{ fontSize: 24 }} />
                </IntentLink>

                <div className="ml-4 hidden items-center gap-1 min-[760px]:flex">
                    {entries.map((entry) => {
                        const on = current === entry.id;
                        if ("href" in entry) {
                            return (
                                <Link
                                    key={entry.id}
                                    href={entry.href}
                                    aria-current={
                                        pathname === entry.href
                                            ? "page"
                                            : undefined
                                    }
                                    className={cn(NAV_TOP, on && NAV_CURRENT)}
                                >
                                    {entry.label}
                                </Link>
                            );
                        }
                        const expanded = open === entry.id;
                        return (
                            <div key={entry.id}>
                                <button
                                    type="button"
                                    aria-haspopup="true"
                                    aria-expanded={expanded}
                                    aria-controls={
                                        expanded
                                            ? `nav-menu-${entry.id}`
                                            : undefined
                                    }
                                    onClick={() => control.toggle(entry.id)}
                                    className={cn(
                                        NAV_TOP,
                                        "gap-1.5 border-none bg-transparent",
                                        expanded && "bg-mk-hover",
                                        on && NAV_CURRENT,
                                    )}
                                >
                                    {entry.label}
                                    <ChevronDown
                                        aria-hidden
                                        data-chevron
                                        strokeWidth={2.25}
                                        className={cn(
                                            "size-3.5 transition-transform duration-fast ease-out motion-reduce:transition-none",
                                            expanded && "rotate-180",
                                        )}
                                    />
                                </button>
                                {expanded ? (
                                    <MenuPanel
                                        id={entry.id}
                                        label={entry.label}
                                        pathname={pathname}
                                        {...entry.menu}
                                    />
                                ) : null}
                            </div>
                        );
                    })}
                </div>

                <div className="ml-auto hidden items-center gap-4 min-[760px]:flex">
                    {end(control)}
                </div>
                <div className="ml-auto flex items-center min-[760px]:hidden">
                    {phone(control)}
                </div>
            </div>
        </nav>
    );
}
