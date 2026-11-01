"use client";

import { cn } from "@/lib/cn";
import { Wordmark } from "@saroh/ui/wordmark";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { KeyboardEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import type { Visitor } from "@/lib/browser/session";
import { useVisitor } from "@/lib/browser/session";
import {
    ACCOUNT_URL,
    DASHBOARD_URL,
    LAUNCH_MODE,
    SIGN_IN_URL,
} from "@/lib/links";
import { ring } from "@/lib/ring";
import { nextIndex } from "@/lib/roving";

import { ButtonLink } from "../buttons/button";
import { CtaLink } from "../buttons/cta-link";
import { IntentLink } from "../links/intent-link";
import { TextLink } from "../links/text-link";
import { ColumnHeading } from "./column-heading";
import { MobileMenu } from "./mobile-menu";
import type { MenuLink, NavItem, NavMenus, NavSection } from "./nav-section";
import { ABOUT_LINKS, menuColumns, sectionOf } from "./nav-section";

type MenuId = "features" | "solutions" | "resources" | "tools" | "account";

/** A top-level control: 36px, 9px corners, Paper-dark on hover. */
const TOP = `flex h-9 cursor-pointer items-center rounded-mk-control px-3 text-foreground no-underline transition-colors duration-fast ease-out hover:bg-mk-hover hover:text-foreground ${ring({ offset: 1 })}`;

/** A menu's panel, under its button (the nav's menus and the account menu). */
const PANEL =
    "absolute top-[calc(100%+10px)] grid gap-0.5 rounded-mk-card border border-border bg-card p-2.5 shadow-mk-menu";

/** A desk menu's column, at its widest; the columns wrap on a narrower window. */
const COLUMN_WIDTH = 232;

/** The current section: underlined in Saffron, 8px below the word. */
const CURRENT =
    "underline decoration-brand-500 decoration-2 underline-offset-8";

/**
 * The site's nav (Nav design, plan U19). From 760px: the logo, Features
 * (a two-column menu with lines), Solutions, Pricing (once the site's launch
 * switch is open; before that it would only bounce to the waitlist),
 * Resources (plan U1; only when some Resources page is live), Tools (the
 * free tools, when one is live), then Sign in
 * (once the launch switch is open; until then accounts.saroh.in is closed)
 * and the start button. Below 760px: the logo, the start button and a Menu
 * button that opens `MobileMenu`.
 *
 * `resources` is the Resources menu: the server decides which pages are
 * published and built (`content/resources.ts`) and passes them in, so the
 * browser never judges a date.
 *
 * It stays at the top of the window as the page scrolls (owner, 1 Nov), and
 * `--mk-nav-h` is its height, for whatever else sticks below it.
 *
 * A desk menu opens across the nav (owner, 1 Nov): columns ruled apart, under
 * family or group headings where the items have them, and a strip below with
 * the "see all" and the quieter links.
 *
 * The section the page is in is underlined in Saffron, and the page itself
 * carries `aria-current="page"` in its menu. A menu closes on Escape (focus
 * returns to its button), on a click outside, and when focus leaves the nav;
 * arrow keys move within it.
 *
 * Signed in (owner, 1 Nov; `useVisitor`, asked once the page is idle), Sign
 * in and the start button become the visitor's initial, which opens their
 * name, email, Account and Sign out, and "Open dashboard". The page's HTML is
 * always the signed-out nav; the swap happens in the browser.
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
    const [open, setOpen] = useState<MenuId | null>(null);
    const nav = useRef<HTMLElement>(null);
    const featuresButton = useRef<HTMLButtonElement>(null);
    const solutionsButton = useRef<HTMLButtonElement>(null);
    const resourcesButton = useRef<HTMLButtonElement>(null);
    const toolsButton = useRef<HTMLButtonElement>(null);
    const accountButton = useRef<HTMLButtonElement>(null);
    const { visitor, signOut } = useVisitor();

    // A new page closes whatever menu was open (state adjusted while
    // rendering, not in an effect: https://react.dev/learn/you-might-not-need-an-effect).
    const [shownFor, setShownFor] = useState(pathname);
    if (shownFor !== pathname) {
        setShownFor(pathname);
        setOpen(null);
    }

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (nav.current && !nav.current.contains(e.target as Node)) {
                setOpen(null);
            }
        };
        const onKey = (e: globalThis.KeyboardEvent) => {
            if (e.key !== "Escape") return;
            const button = {
                features: featuresButton,
                solutions: solutionsButton,
                resources: resourcesButton,
                tools: toolsButton,
                account: accountButton,
            }[open];
            setOpen(null);
            button.current?.focus();
        };
        document.addEventListener("click", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("click", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <nav
            ref={nav}
            aria-label="Main"
            onBlur={(e) => {
                if (open && !nav.current?.contains(e.relatedTarget)) {
                    setOpen(null);
                }
            }}
            className="sticky top-0 z-30 flex items-center gap-6 border-b border-border bg-background px-mk-nav py-5 font-sans max-[399px]:gap-3"
        >
            <IntentLink
                href="/"
                aria-label="Saroh home"
                className={`flex shrink-0 rounded-lg text-foreground no-underline ${ring({ offset: 3 })}`}
            >
                <Wordmark aria-hidden style={{ fontSize: 22 }} />
            </IntentLink>

            {/* From 760px wide. */}
            <div className="hidden items-center gap-1 text-mk-nav min-[760px]:flex">
                <Menu
                    id="features"
                    label="Features"
                    items={features}
                    columns={3}
                    current={section === "features"}
                    pathname={pathname}
                    open={open === "features"}
                    onToggle={() =>
                        setOpen(open === "features" ? null : "features")
                    }
                    buttonRef={featuresButton}
                />
                <Menu
                    id="solutions"
                    label="Solutions"
                    items={
                        solutionMenu ??
                        solutions.filter((i) => i.href !== allTrades?.href)
                    }
                    columns={2}
                    seeAll={allTrades}
                    current={section === "solutions"}
                    pathname={pathname}
                    open={open === "solutions"}
                    onToggle={() =>
                        setOpen(open === "solutions" ? null : "solutions")
                    }
                    buttonRef={solutionsButton}
                />
                {LAUNCH_MODE === "open" ? (
                    <Link
                        href="/pricing"
                        aria-current={
                            section === "pricing" ? "page" : undefined
                        }
                        className={cn(TOP, section === "pricing" && CURRENT)}
                    >
                        Pricing
                    </Link>
                ) : null}
                {resources.length > 0 ? (
                    <Menu
                        id="resources"
                        label="Resources"
                        items={resources}
                        columns={3}
                        links={ABOUT_LINKS}
                        current={section === "resources"}
                        pathname={pathname}
                        open={open === "resources"}
                        onToggle={() =>
                            setOpen(open === "resources" ? null : "resources")
                        }
                        buttonRef={resourcesButton}
                    />
                ) : null}
                {tools.length > 0 ? (
                    <Menu
                        id="tools"
                        label="Tools"
                        items={tools}
                        columns={2}
                        seeAll={allTools}
                        current={section === "tools"}
                        pathname={pathname}
                        open={open === "tools"}
                        onToggle={() =>
                            setOpen(open === "tools" ? null : "tools")
                        }
                        buttonRef={toolsButton}
                    />
                ) : null}
            </div>
            {visitor ? (
                <>
                    <AccountMenu
                        visitor={visitor}
                        open={open === "account"}
                        onToggle={() =>
                            setOpen(open === "account" ? null : "account")
                        }
                        onSignOut={() => {
                            setOpen(null);
                            void signOut();
                        }}
                        buttonRef={accountButton}
                    />
                    <ButtonLink
                        href={DASHBOARD_URL}
                        size="sm"
                        className="hidden min-[760px]:inline-flex"
                    >
                        Open dashboard
                    </ButtonLink>
                </>
            ) : null}
            {/* Sign in waits for early access, as Pricing does: until then
                accounts.saroh.in is closed to anyone without the key. */}
            {!visitor && LAUNCH_MODE === "open" ? (
                <a
                    href={SIGN_IN_URL}
                    className={cn(
                        TOP,
                        "ml-auto hidden text-mk-nav min-[760px]:flex",
                    )}
                >
                    Sign in
                </a>
            ) : null}
            {visitor ? null : (
                <CtaLink
                    src="nav"
                    size="sm"
                    className={cn(
                        "hidden min-[760px]:inline-flex",
                        LAUNCH_MODE !== "open" && "ml-auto",
                    )}
                />
            )}

            {/* Below 760px wide. */}
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
                className="ml-auto min-[760px]:hidden"
            />
        </nav>
    );
}

function Menu({
    id,
    label,
    items,
    columns,
    seeAll,
    links = [],
    current,
    pathname,
    open,
    onToggle,
    buttonRef,
}: {
    id: MenuId;
    label: string;
    items: NavItem[];
    /** How many columns when the items have no groups. */
    columns: number;
    /** The strip under the columns: its one strong link, on the left. */
    seeAll?: MenuLink;
    /** The strip's quieter links, on the right. */
    links?: MenuLink[];
    current: boolean;
    pathname: string;
    open: boolean;
    onToggle: () => void;
    buttonRef: RefObject<HTMLButtonElement | null>;
}) {
    const menu = useRef<HTMLDivElement>(null);

    // Opening a menu puts focus on its first item, as the design's script
    // does, so the arrow keys work straight away.
    useEffect(() => {
        if (open) menu.current?.querySelector<HTMLElement>("a")?.focus();
    }, [open]);

    const shown = open ? menuColumns(items, columns) : [];

    return (
        <div>
            <button
                ref={buttonRef}
                type="button"
                aria-haspopup="true"
                aria-expanded={open}
                // Only while the menu is in the page: a closed one isn't.
                aria-controls={open ? `nav-menu-${id}` : undefined}
                onClick={onToggle}
                className={cn(
                    TOP,
                    "gap-1.5 border-none bg-transparent",
                    open && "bg-mk-hover",
                    current && CURRENT,
                )}
            >
                {label}
                <ChevronDown
                    aria-hidden
                    data-chevron
                    strokeWidth={2.25}
                    className={cn(
                        "size-3.5 transition-transform duration-fast ease-out motion-reduce:transition-none",
                        open && "rotate-180",
                    )}
                />
            </button>
            {open ? (
                // Across the nav, not under its button: the nav is what's `relative`.
                <div
                    ref={menu}
                    id={`nav-menu-${id}`}
                    role="menu"
                    aria-label={label}
                    onKeyDown={(e) => moveWithArrows(e)}
                    style={{ width: shown.length * COLUMN_WIDTH + 22 }}
                    className="absolute inset-x-0 top-[calc(100%-8px)] mx-auto max-w-[calc(100%-32px)] rounded-mk-card border border-border bg-background p-2.5 shadow-mk-menu"
                >
                    <div className="max-h-[calc(100dvh-160px)] overflow-y-auto overflow-x-hidden rounded-[10px] border border-border bg-card">
                        {/* The last column's and row's rules are clipped, under the box's own. */}
                        <div className="overflow-hidden">
                            <div className="-mb-px -mr-px flex flex-wrap">
                                {shown.map((column) => (
                                    <div
                                        key={
                                            column.heading ??
                                            column.items[0]?.href
                                        }
                                        role={
                                            column.heading ? "group" : undefined
                                        }
                                        aria-label={column.heading}
                                        className="flex min-w-0 grow basis-[200px] flex-col gap-0.5 border-b border-r border-border p-3"
                                    >
                                        <ColumnHeading className="m-0 px-2.5 pb-2 pt-1 text-mk-note text-muted-foreground">
                                            {column.heading}
                                        </ColumnHeading>
                                        {column.items.map((item) => (
                                            <Link
                                                key={item.href}
                                                role="menuitem"
                                                href={item.href}
                                                aria-current={
                                                    item.href === pathname
                                                        ? "page"
                                                        : undefined
                                                }
                                                className={`grid cursor-pointer gap-[3px] rounded-lg px-2.5 py-2 text-foreground no-underline transition-colors duration-fast ease-out hover:bg-background hover:text-foreground focus-visible:bg-background ${ring({ offset: "inset" })}`}
                                            >
                                                <span className="text-[15px] font-semibold">
                                                    {item.name}
                                                </span>
                                                {item.line ? (
                                                    <span className="text-mk-note leading-[1.4] text-muted-foreground">
                                                        {item.line}
                                                    </span>
                                                ) : null}
                                            </Link>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {seeAll || links.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-2.5 pb-0.5 pt-2.5 text-mk-note">
                            {seeAll ? (
                                <TextLink
                                    role="menuitem"
                                    href={seeAll.href}
                                    arrow
                                    className="inline-flex items-center gap-1 font-semibold"
                                >
                                    {seeAll.name}
                                </TextLink>
                            ) : null}
                            {links.length > 0 ? (
                                <span className="ml-auto flex flex-wrap gap-x-5">
                                    {links.map((link) => (
                                        <TextLink
                                            key={link.href}
                                            role="menuitem"
                                            href={link.href}
                                            tone="quiet"
                                        >
                                            {link.name}
                                        </TextLink>
                                    ))}
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
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
    buttonRef,
}: {
    visitor: Visitor;
    open: boolean;
    onToggle: () => void;
    onSignOut: () => void;
    buttonRef: RefObject<HTMLButtonElement | null>;
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
        <div
            data-ph-mask=""
            className="relative ml-auto hidden min-[760px]:block"
        >
            <button
                ref={buttonRef}
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

/** Arrow keys move through a menu's items, wrapping at either end. */
function moveWithArrows(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
        e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = nextIndex(e.key, at, items.length);
    if (next === null) return;
    e.preventDefault();
    items[next]?.focus();
}

export type { NavSection };
