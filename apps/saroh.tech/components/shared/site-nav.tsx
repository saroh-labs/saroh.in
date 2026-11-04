"use client";

import { cn } from "@saroh/marketing/cn";
import { IntentLink } from "@saroh/marketing/intent-link";
import { MenuPanel } from "@saroh/marketing/menu-panel";
import { ring } from "@saroh/marketing/ring";
import { Wordmark } from "@saroh/ui/wordmark";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { useEffect, useRef, useState } from "react";

import type { NavMenus } from "@/lib/nav";
import { sectionOf } from "@/lib/nav-section";

import { HeaderStart } from "./header-start";
import { PhoneMenu } from "./phone-menu";

type MenuId = "features" | "solutions" | "resources" | "tools" | "templates";

/** saroh.in's top-level control: 36px, 9px corners, Paper-dark on hover. */
const TOP = `flex h-9 cursor-pointer items-center rounded-mk-control px-3 text-foreground no-underline transition-colors duration-fast ease-out hover:bg-mk-hover hover:text-foreground ${ring({ offset: 1 })}`;

/** The current section: underlined in Saffron, 8px below the word. */
const CURRENT =
    "underline decoration-brand-500 decoration-2 underline-offset-8";

/**
 * saroh.tech's nav, in saroh.in's style. From 1100px: the logo, Features,
 * Solutions, Pricing, Resources, Tools and Templates, then Sign in and the
 * start button. Below that, the logo, the start button and `PhoneMenu`.
 *
 * A menu closes on Escape (focus returns to its button), on a click outside,
 * and when focus leaves the nav; `MenuPanel` moves within it by arrow keys.
 */
export function SiteNav({
    menus,
    signIn,
    start,
    startInSheet,
}: {
    menus: NavMenus;
    signIn: string;
    start: string;
    startInSheet: string;
}) {
    const pathname = usePathname();
    const section = sectionOf(pathname);
    const [open, setOpen] = useState<MenuId | null>(null);
    const nav = useRef<HTMLElement>(null);

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

    const menu = (id: MenuId) => ({
        id,
        pathname,
        current: section === id,
        open: open === id,
        onToggle: () => setOpen(open === id ? null : id),
    });

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

            <div className="hidden items-center gap-1 text-mk-nav min-[1100px]:flex">
                <Menu
                    {...menu("features")}
                    label="Features"
                    items={menus.features}
                    columns={3}
                />
                <Menu
                    {...menu("solutions")}
                    label="Solutions"
                    items={menus.solutions}
                    columns={2}
                />
                <Link
                    prefetch={false}
                    href="/pricing"
                    aria-current={section === "pricing" ? "page" : undefined}
                    className={cn(TOP, section === "pricing" && CURRENT)}
                >
                    Pricing
                </Link>
                <Menu
                    {...menu("resources")}
                    label="Resources"
                    items={menus.resources}
                    columns={2}
                />
                <Menu
                    {...menu("tools")}
                    label="Tools"
                    items={menus.tools}
                    columns={3}
                    seeAll={menus.allTools}
                />
                <Menu
                    {...menu("templates")}
                    label="Templates"
                    items={menus.templates}
                    columns={3}
                    seeAll={menus.allTemplates}
                />
            </div>

            <a
                href={signIn}
                data-cta="sign-in"
                className={cn(
                    TOP,
                    "ml-auto hidden text-mk-nav min-[1100px]:flex",
                )}
            >
                Sign in
            </a>
            <HeaderStart
                href={start}
                className="hidden min-[1100px]:inline-flex"
            />

            <PhoneMenu
                {...menus}
                section={section}
                pathname={pathname}
                signIn={signIn}
                start={start}
                startInSheet={startInSheet}
                className="ml-auto min-[1100px]:hidden"
            />
        </nav>
    );
}

function Menu({
    id,
    label,
    current,
    open,
    onToggle,
    ...panel
}: Omit<ComponentProps<typeof MenuPanel>, "label"> & {
    label: string;
    current: boolean;
    open: boolean;
    onToggle: () => void;
}) {
    return (
        <div>
            <button
                type="button"
                aria-haspopup="true"
                aria-expanded={open}
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
                    strokeWidth={2.25}
                    className={cn(
                        "size-3.5 transition-transform duration-fast ease-out motion-reduce:transition-none",
                        open && "rotate-180",
                    )}
                />
            </button>
            {open ? <MenuPanel id={id} label={label} {...panel} /> : null}
        </div>
    );
}
