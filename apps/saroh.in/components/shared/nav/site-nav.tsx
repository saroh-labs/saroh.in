"use client";

import { ButtonLink } from "@saroh/marketing/button";
import { cn } from "@saroh/marketing/cn";
import { STICKY_HIDES } from "@saroh/marketing/kit/sticky-bar";
import type { NavEntry } from "@saroh/marketing/marketing-nav";
import { MarketingNav, NAV_TOP } from "@saroh/marketing/marketing-nav";
import { moveWithArrows } from "@saroh/marketing/menu-panel";
import { ring } from "@saroh/marketing/ring";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { NAV_WORDS } from "@/content/nav";
import type { Visitor } from "@/lib/browser/session";
import { useVisitor } from "@/lib/browser/session";
import {
    ACCOUNT_URL,
    DASHBOARD_URL,
    LAUNCH_MODE,
    SIGN_IN_URL,
} from "@/lib/links";

import { CtaLink } from "../buttons/cta-link";
import { MobileMenu } from "./mobile-menu";
import type { NavMenus, NavSection } from "./nav-section";
import { ABOUT_LINKS, sectionOf, splitResources } from "./nav-section";

/** A menu's panel, under its button (the account menu). */
const PANEL =
    "absolute top-[calc(100%+10px)] grid gap-0.5 rounded-mk-card border border-border bg-card p-2.5 shadow-mk-menu";

/**
 * saroh.in's nav, on the redesign's shared `MarketingNav` (DEC-221): from
 * 1240px, the wordmark, then Solutions (every trade, by family, and "See all
 * trades"), Features (every shown feature and "All features" to
 * /features), Website templates, Pricing (once the launch switch is open;
 * before that it would only bounce to the waitlist), Resources (Developers
 * among them, once live; owner, 16 Nov 2026) and Tools, then Sign in (also once open) and the start button. Below
 * 1240px: the start button and Menu, whose sheet keeps every level,
 * Resources and Tools included.
 *
 * Resources and Tools stay their own desk menus after Developers (owner,
 * 17 Nov 2026), as before the redesign: the guides and free tools are how
 * people find Saroh, so they aren't folded into How it works.
 *
 * `resources` and `tools` are worked out by the server (published and
 * built, `content/resources.ts`), so the browser never judges a date.
 *
 * Signed in (`useVisitor`, asked once the page is idle), Sign in and the
 * start button become the visitor's initial, which opens their name, email,
 * Account and Sign out, and "Open dashboard". The page's HTML is always the
 * signed-out nav; the swap happens in the browser.
 */
export function SiteNav({
    features,
    solutions,
    solutionMenu,
    allTrades,
    allTools,
    resources = [],
    tools = [],
}: NavMenus) {
    const pathname = usePathname();
    const section = sectionOf(pathname, features, solutions, resources, tools);
    const { visitor, signOut } = useVisitor();
    const split = splitResources(resources);
    const entries: NavEntry[] = [
        {
            id: "solutions",
            label: NAV_WORDS.solutions,
            menu: {
                items:
                    solutionMenu ??
                    solutions.filter((i) => i.href !== allTrades?.href),
                columns: 2,
                seeAll: allTrades,
            },
        },
        {
            id: "features",
            label: NAV_WORDS.howItWorks,
            menu: {
                items: features,
                columns: 3,
                seeAll: { name: NAV_WORDS.howItWorksAll, href: "/features" },
            },
        },
        ...(split.templates
            ? [
                  {
                      id: "templates",
                      label: split.templates.name,
                      href: split.templates.href,
                  },
              ]
            : []),
        ...(LAUNCH_MODE === "open"
            ? [{ id: "pricing", label: NAV_WORDS.pricing, href: "/pricing" }]
            : []),
        // Resources and Tools keep their own desk menus (owner, 17 Nov 2026):
        // the guides and the free tools are how people find Saroh.
        ...(split.rest.length > 0
            ? [
                  {
                      id: "resources",
                      label: NAV_WORDS.resources,
                      menu: {
                          items: split.rest,
                          columns: 3,
                          links: ABOUT_LINKS,
                      },
                  },
              ]
            : []),
        ...(tools.length > 0
            ? [
                  {
                      id: "tools",
                      label: NAV_WORDS.tools,
                      menu: {
                          items: tools,
                          columns: 2,
                          ...(allTools ? { seeAll: allTools } : {}),
                      },
                  },
              ]
            : []),
    ];

    return (
        <MarketingNav
            entries={entries}
            current={section}
            pathname={pathname}
            end={(control) =>
                visitor ? (
                    <>
                        <AccountMenu
                            visitor={visitor}
                            open={control.open === "account"}
                            onToggle={() => control.toggle("account")}
                            onSignOut={() => {
                                control.close();
                                void signOut();
                            }}
                        />
                        <ButtonLink href={DASHBOARD_URL} size="kit">
                            Open dashboard
                        </ButtonLink>
                    </>
                ) : (
                    <>
                        {/* Sign in waits for early access, as Pricing does:
                            until then accounts.saroh.in is closed to anyone
                            without the key. */}
                        {LAUNCH_MODE === "open" ? (
                            <a
                                href={SIGN_IN_URL}
                                className={cn(
                                    NAV_TOP,
                                    "font-semibold text-foreground",
                                )}
                            >
                                {NAV_WORDS.signIn}
                            </a>
                        ) : null}
                        <CtaLink src="nav" size="kit" />
                    </>
                )
            }
            phone={() => (
                <MobileMenu
                    section={section}
                    pathname={pathname}
                    resources={resources}
                    features={features}
                    solutions={solutions}
                    solutionMenu={solutionMenu}
                    allTrades={allTrades}
                    allTools={allTools}
                    tools={tools}
                    visitor={visitor}
                    onSignOut={signOut}
                    startClassName={STICKY_HIDES}
                />
            )}
        />
    );
}

/**
 * The signed-in visitor's initial and its menu: who they are, then Account
 * and Sign out. Their name and email are masked in a session recording.
 */
function AccountMenu({
    visitor,
    open,
    onToggle,
    onSignOut,
}: {
    visitor: Visitor;
    open: boolean;
    onToggle: () => void;
    onSignOut: () => void;
}) {
    const menu = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (open)
            menu.current
                ?.querySelector<HTMLElement>('[role="menuitem"]')
                ?.focus();
    }, [open]);
    const item = `flex h-11 w-full cursor-pointer items-center rounded-[10px] border-none bg-transparent px-3.5 text-left text-[15px] font-semibold text-foreground no-underline transition-colors duration-fast ease-out hover:bg-background hover:text-foreground focus-visible:bg-background ${ring({ offset: "inset" })}`;

    return (
        <div data-ph-mask="" className="relative">
            <button
                type="button"
                aria-label="Your account"
                aria-haspopup="true"
                aria-expanded={open}
                aria-controls={open ? "nav-menu-account" : undefined}
                onClick={onToggle}
                className={`grid size-9 cursor-pointer place-items-center rounded-full border border-border-strong bg-card text-[15px] font-semibold uppercase text-foreground transition-colors duration-fast ease-out hover:bg-mk-hover ${ring({ offset: 2 })}`}
            >
                <span aria-hidden>{visitor.name.trim().charAt(0)}</span>
            </button>
            {open ? (
                <div
                    ref={menu}
                    id="nav-menu-account"
                    role="menu"
                    aria-label="Your account"
                    onKeyDown={(e) => moveWithArrows(e)}
                    className={cn(PANEL, "right-0 w-[280px]")}
                >
                    <div className="mb-1 grid gap-[3px] border-b border-border px-3.5 pb-3 pt-2">
                        <span className="truncate text-[15px] font-semibold">
                            {visitor.name}
                        </span>
                        <span className="truncate text-mk-note text-muted-foreground">
                            {visitor.email}
                        </span>
                    </div>
                    <a role="menuitem" href={ACCOUNT_URL} className={item}>
                        Account
                    </a>
                    <button
                        role="menuitem"
                        type="button"
                        onClick={onSignOut}
                        className={item}
                    >
                        Sign out
                    </button>
                </div>
            ) : null}
        </div>
    );
}

export type { NavSection };
