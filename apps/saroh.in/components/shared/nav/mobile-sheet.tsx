"use client";

import { cn } from "@/lib/cn";
import { Wordmark } from "@saroh/ui/wordmark";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { Visitor } from "@/lib/browser/session";
import {
    ACCOUNT_URL,
    DASHBOARD_URL,
    LAUNCH_MODE,
    SIGN_IN_URL,
} from "@/lib/links";
import { ring } from "@/lib/ring";

import { ButtonLink, buttonClasses } from "../buttons/button";
import { CtaLink } from "../buttons/cta-link";
import { useFocusTrap } from "../layout/use-focus-trap";
import { TextLink } from "../links/text-link";
import { ColumnHeading } from "./column-heading";
import type { MenuLink, NavItem, NavSection } from "./nav-section";
import { ABOUT_LINKS, menuColumns } from "./nav-section";

/** A row on the sheet's first level: 60px, a hairline below. */
const ROW = `flex h-[60px] w-full cursor-pointer items-center justify-between border-b border-border bg-transparent p-0 text-xl font-semibold text-foreground no-underline hover:text-foreground ${ring({ offset: "inset" })}`;

/** The current section: underlined in Saffron, as on the desk. */
const CURRENT =
    "underline decoration-brand-500 decoration-2 underline-offset-8";

interface Level {
    id: "features" | "solutions" | "resources" | "tools";
    label: string;
    items: NavItem[];
    seeAll?: MenuLink;
    links?: MenuLink[];
}

/**
 * The phone nav's full-screen sheet (`MobileMenu`), in its own file so it is
 * fetched on the first tap of Menu, not with every page.
 */
export function MobileSheet({
    section,
    pathname,
    resources,
    tools,
    featureItems,
    solutionItems,
    solutionMenu,
    allTrades,
    allTools,
    visitor = null,
    onSignOut,
    onClose,
}: {
    section: NavSection;
    pathname: string;
    resources: NavItem[];
    tools: NavItem[];
    featureItems: NavItem[];
    solutionItems: NavItem[];
    /** Every live trade by family, in place of `solutionItems`. */
    solutionMenu?: NavItem[];
    allTrades?: MenuLink;
    allTools?: MenuLink;
    /** Signed in: who, in place of Sign in, and "Open dashboard". */
    visitor?: Visitor | null;
    onSignOut?: () => void;
    onClose: () => void;
}) {
    const root = useRef<HTMLDivElement>(null);
    const back = useRef<HTMLButtonElement>(null);
    useFocusTrap(root, true, onClose);
    const [openId, setOpenId] = useState<Level["id"] | null>(null);
    const cameFrom = useRef<Level["id"] | null>(null);

    // Focus follows the level: into it on Back, out of it on the row it came from.
    useEffect(() => {
        if (openId) {
            cameFrom.current = openId;
            back.current?.focus();
        } else if (cameFrom.current) {
            root.current
                ?.querySelector<HTMLElement>(
                    `[data-level="${cameFrom.current}"]`,
                )
                ?.focus();
        }
    }, [openId]);

    const levels: Level[] = [
        { id: "features", label: "Features", items: featureItems },
        {
            id: "solutions",
            label: "Solutions",
            items:
                solutionMenu ??
                solutionItems.filter((i) => i.href !== allTrades?.href),
            seeAll: allTrades,
        },
        {
            id: "resources",
            label: "Resources",
            items: resources,
            links: ABOUT_LINKS,
        },
        { id: "tools", label: "Tools", items: tools, seeAll: allTools },
    ];
    const opened = levels.find((l) => l.id === openId);
    const row = (level: Level) =>
        level.items.length > 0 ? (
            <button
                key={level.id}
                type="button"
                data-level={level.id}
                aria-current={section === level.id ? "true" : undefined}
                onClick={() => setOpenId(level.id)}
                className={ROW}
            >
                <span className={cn(section === level.id && CURRENT)}>
                    {level.label}
                </span>
                <ChevronRight
                    aria-hidden
                    className="size-5 text-muted-foreground"
                />
            </button>
        ) : null;

    return (
        <div
            ref={root}
            id="nav-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-50 flex flex-col bg-background"
        >
            <div className="flex shrink-0 items-center justify-between px-mk-nav py-3">
                <Link
                    href="/"
                    onClick={onClose}
                    aria-label="Saroh home"
                    className={`flex rounded-lg text-foreground no-underline ${ring({ offset: 3 })}`}
                >
                    <Wordmark aria-hidden style={{ fontSize: 22 }} />
                </Link>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close menu"
                    className={`grid size-11 cursor-pointer place-items-center rounded-[10px] border-none bg-transparent text-foreground hover:bg-mk-hover ${ring()}`}
                >
                    <X aria-hidden className="size-5" />
                </button>
            </div>

            {opened ? (
                <>
                    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-mk-nav pb-2">
                        <button
                            ref={back}
                            type="button"
                            onClick={() => setOpenId(null)}
                            className={`-ml-1 flex h-11 cursor-pointer items-center gap-1 rounded-lg border-none bg-transparent pl-0 pr-2 font-semibold text-brand-700 ${ring()}`}
                        >
                            <ChevronLeft aria-hidden className="size-5" />
                            Back
                        </button>
                        {opened.seeAll ? (
                            <TextLink
                                href={opened.seeAll.href}
                                arrow
                                onClick={onClose}
                                className="flex h-11 items-center gap-1 font-semibold"
                            >
                                {opened.seeAll.name}
                            </TextLink>
                        ) : null}
                    </div>
                    <div
                        key={opened.id}
                        id={`nav-sheet-${opened.id}`}
                        className="min-h-0 flex-1 overflow-y-auto px-mk-nav pb-8 pt-4"
                    >
                        <h2 className="m-0 pb-2 text-xl font-semibold">
                            {opened.label}
                        </h2>
                        {menuColumns(opened.items, 1).map((column) => (
                            <div
                                key={column.heading ?? "all"}
                                role={column.heading ? "group" : undefined}
                                aria-label={column.heading}
                                className="grid gap-0.5 pb-3"
                            >
                                <ColumnHeading className="m-0 pb-1 pt-3 text-mk-note text-muted-foreground">
                                    {column.heading}
                                </ColumnHeading>
                                {column.items.map((item) => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={onClose}
                                        aria-current={
                                            item.href === pathname
                                                ? "page"
                                                : undefined
                                        }
                                        className={`-mx-2.5 grid min-h-11 cursor-pointer content-center gap-0.5 rounded-lg px-2.5 py-2 text-foreground no-underline hover:bg-mk-hover hover:text-foreground aria-[current=page]:bg-card ${ring({ offset: "inset" })}`}
                                    >
                                        <span className="text-base font-semibold">
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
                        {opened.links ? (
                            <div className="flex flex-wrap gap-x-1 border-t border-border pt-2">
                                {opened.links.map((link) => (
                                    <TextLink
                                        key={link.href}
                                        href={link.href}
                                        tone="quiet"
                                        onClick={onClose}
                                        className="flex h-11 items-center px-2.5 text-mk-note first:-ml-2.5"
                                    >
                                        {link.name}
                                    </TextLink>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </>
            ) : (
                <>
                    <div className="min-h-0 flex-1 overflow-y-auto px-mk-nav">
                        {levels
                            .filter(
                                (l) =>
                                    l.id === "features" || l.id === "solutions",
                            )
                            .map(row)}
                        {LAUNCH_MODE === "open" ? (
                            <Link
                                href="/pricing"
                                onClick={onClose}
                                aria-current={
                                    pathname === "/pricing" ? "page" : undefined
                                }
                                className={ROW}
                            >
                                <span
                                    className={cn(
                                        section === "pricing" && CURRENT,
                                    )}
                                >
                                    Pricing
                                </span>
                            </Link>
                        ) : null}
                        {levels
                            .filter(
                                (l) => l.id === "resources" || l.id === "tools",
                            )
                            .map(row)}
                    </div>
                    <div className="grid shrink-0 gap-2.5 px-mk-nav pb-5 pt-3">
                        {visitor ? (
                            <>
                                {/* Masked in a session recording. */}
                                <div
                                    data-ph-mask=""
                                    className="grid gap-0.5 pb-1"
                                >
                                    <span className="truncate text-lg font-semibold">
                                        {visitor.name}
                                    </span>
                                    <span className="truncate text-mk-note text-muted-foreground">
                                        {visitor.email}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <ButtonLink
                                        href={ACCOUNT_URL}
                                        variant="secondary"
                                        className="w-full"
                                    >
                                        Account
                                    </ButtonLink>
                                    <button
                                        type="button"
                                        onClick={onSignOut}
                                        className={cn(
                                            buttonClasses({
                                                variant: "secondary",
                                            }),
                                            "w-full cursor-pointer bg-transparent",
                                        )}
                                    >
                                        Sign out
                                    </button>
                                </div>
                                <ButtonLink
                                    href={DASHBOARD_URL}
                                    className="w-full"
                                >
                                    Open dashboard
                                </ButtonLink>
                            </>
                        ) : (
                            <>
                                {LAUNCH_MODE === "open" ? (
                                    <ButtonLink
                                        href={SIGN_IN_URL}
                                        variant="secondary"
                                        className="w-full"
                                    >
                                        Sign in
                                    </ButtonLink>
                                ) : null}
                                <CtaLink
                                    src="nav-sheet"
                                    onNavigate={onClose}
                                    className="w-full"
                                />
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
