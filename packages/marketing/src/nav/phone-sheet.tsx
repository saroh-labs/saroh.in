"use client";

import { Wordmark } from "@saroh/ui/wordmark";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../cn";
import { useFocusTrap } from "../layout/use-focus-trap";
import { TextLink } from "../links/text-link";
import { ring } from "../ring";
import { ColumnHeading } from "./column-heading";
import type { MenuLink, NavItem, NavSection } from "./nav-types";
import { menuColumns } from "./nav-types";

/** A row on the sheet's first level: 60px, a hairline below. */
const ROW = `flex h-[60px] w-full cursor-pointer items-center justify-between border-b border-border bg-transparent p-0 text-xl font-semibold text-foreground no-underline hover:text-foreground ${ring({ offset: "inset" })}`;

/** The current section: underlined in Saffron, as on the desk. */
const CURRENT =
    "underline decoration-brand-500 decoration-2 underline-offset-8";

interface Level {
    id: "features" | "solutions" | "resources" | "tools" | "templates";
    label: string;
    items: NavItem[];
    seeAll?: MenuLink;
    links?: MenuLink[];
}

/**
 * The phone nav's full-screen sheet: a row per menu, each a level of its own
 * with a Back, and `actions` held at the bottom. In its own file so a site can
 * fetch it on the first tap of Menu, not with every page.
 */
export function PhoneSheet({
    section,
    pathname,
    resources,
    tools,
    featureItems,
    solutionItems,
    solutionMenu,
    allTrades,
    allTools,
    templates = [],
    allTemplates,
    aboutLinks,
    pricing,
    actions,
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
    /** A Templates row after Tools, for a site that has a gallery menu. */
    templates?: NavItem[];
    allTemplates?: MenuLink;
    /** The Resources level's quieter links. */
    aboutLinks: MenuLink[];
    /** Whether the Pricing row shows. */
    pricing: boolean;
    /** The sheet's foot: signing in, the start button, who is signed in. */
    actions: ReactNode;
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
            links: aboutLinks,
        },
        { id: "tools", label: "Tools", items: tools, seeAll: allTools },
        {
            id: "templates",
            label: "Templates",
            items: templates,
            seeAll: allTemplates,
        },
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
                        {pricing ? (
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
                                (l) =>
                                    l.id === "resources" ||
                                    l.id === "tools" ||
                                    l.id === "templates",
                            )
                            .map(row)}
                    </div>
                    <div className="grid shrink-0 gap-2.5 px-mk-nav pb-5 pt-3">
                        {actions}
                    </div>
                </>
            )}
        </div>
    );
}
