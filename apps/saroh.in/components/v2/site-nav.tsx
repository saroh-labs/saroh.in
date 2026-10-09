"use client";

import { cn } from "@/lib/cn";
import { Wordmark } from "@saroh/ui/wordmark";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { KeyboardEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

import { LAUNCH_MODE, SIGN_IN_URL } from "@/lib/links";

import { CtaLink } from "./cta-link";
import { MobileMenu } from "./mobile-menu";
import type { NavItem, NavSection } from "./nav-items";
import { FEATURE_ITEMS, SOLUTION_ITEMS, sectionOf } from "./nav-items";

type MenuId = "features" | "solutions" | "resources";

/** A top-level control: 36px, 9px corners, Paper-dark on hover. */
const TOP =
    "flex h-9 cursor-pointer items-center rounded-mk-control px-3 text-foreground no-underline transition-colors duration-fast ease-out hover:bg-mk-hover hover:text-foreground focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500";

/** The current section: underlined in Saffron, 8px below the word. */
const CURRENT =
    "underline decoration-brand-500 decoration-2 underline-offset-8";

/**
 * The site's nav (Nav design, plan U19). From 760px: the logo, Features
 * (a two-column menu with lines), Solutions, Pricing (once the site's launch
 * switch is open; before that it would only bounce to the waitlist),
 * Resources (plan U1; only when some Resources page is live), then Sign in
 * (once the launch switch is open; until then accounts.saroh.in is closed)
 * and the start button. Below 760px: the logo, the start button and a Menu
 * button that opens `MobileMenu`.
 *
 * `resources` is the Resources menu: the server decides which pages are
 * published and built (`content/resources.ts`) and passes them in, so the
 * browser never judges a date.
 *
 * The section the page is in is underlined in Saffron, and the page itself
 * carries `aria-current="page"` in its menu. A menu closes on Escape (focus
 * returns to its button), on a click outside, and when focus leaves the nav;
 * arrow keys move within it.
 */
export function SiteNav({ resources = [] }: { resources?: NavItem[] }) {
    const pathname = usePathname();
    const section = sectionOf(pathname, resources);
    const [open, setOpen] = useState<MenuId | null>(null);
    const nav = useRef<HTMLElement>(null);
    const featuresButton = useRef<HTMLButtonElement>(null);
    const solutionsButton = useRef<HTMLButtonElement>(null);
    const resourcesButton = useRef<HTMLButtonElement>(null);

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
            className="relative z-30 flex items-center gap-6 border-b border-border bg-background px-mk-nav py-5 font-sans max-[399px]:gap-3"
        >
            <Link
                href="/"
                aria-label="Saroh home"
                className="flex shrink-0 rounded-lg text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
            >
                <Wordmark aria-hidden style={{ fontSize: 22 }} />
            </Link>

            {/* From 760px wide. */}
            <div className="hidden items-center gap-1 text-mk-nav min-[760px]:flex">
                <Menu
                    id="features"
                    label="Features"
                    items={FEATURE_ITEMS}
                    columns={2}
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
                    items={SOLUTION_ITEMS}
                    columns={1}
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
                        columns={1}
                        current={section === "resources"}
                        pathname={pathname}
                        open={open === "resources"}
                        onToggle={() =>
                            setOpen(open === "resources" ? null : "resources")
                        }
                        buttonRef={resourcesButton}
                    />
                ) : null}
            </div>
            {/* Sign in waits for early access, as Pricing does: until then
                accounts.saroh.in is closed to anyone without the key. */}
            {LAUNCH_MODE === "open" ? (
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
            <CtaLink
                src="nav"
                size="sm"
                className={cn(
                    "hidden min-[760px]:inline-flex",
                    LAUNCH_MODE !== "open" && "ml-auto",
                )}
            />

            {/* Below 760px wide. */}
            <MobileMenu
                section={section}
                pathname={pathname}
                resources={resources}
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
    current,
    pathname,
    open,
    onToggle,
    buttonRef,
}: {
    id: MenuId;
    label: string;
    items: NavItem[];
    columns: 1 | 2;
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

    return (
        <div className="relative">
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
                <div
                    ref={menu}
                    id={`nav-menu-${id}`}
                    role="menu"
                    aria-label={label}
                    onKeyDown={(e) => moveWithArrows(e)}
                    className={cn(
                        "absolute left-0 top-[calc(100%+10px)] grid gap-0.5 rounded-mk-card border border-border bg-card p-2.5 shadow-mk-menu",
                        columns === 2
                            ? "w-[662px] grid-cols-2"
                            : "w-[362px] grid-cols-1",
                    )}
                >
                    {items.map((item) => (
                        <Link
                            key={item.href}
                            role="menuitem"
                            href={item.href}
                            aria-current={
                                item.href === pathname ? "page" : undefined
                            }
                            className="grid cursor-pointer gap-[3px] rounded-[10px] px-3.5 py-3 text-foreground no-underline transition-colors duration-fast ease-out hover:bg-background hover:text-foreground focus-visible:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                        >
                            <span className="text-[15px] font-semibold">
                                {item.name}
                            </span>
                            <span className="text-mk-note leading-[1.45] text-muted-foreground">
                                {item.line}
                            </span>
                        </Link>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** Arrow keys move through a menu's items, wrapping at either end. */
function moveWithArrows(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[
        e.key
    ];
    if (!step) return;
    e.preventDefault();
    const items = Array.from(e.currentTarget.querySelectorAll("a"));
    const at = items.indexOf(document.activeElement as HTMLAnchorElement);
    items[(at + step + items.length) % items.length]?.focus();
}

export type { NavSection };
