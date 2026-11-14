"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";
import { useEffect, useRef } from "react";

import { TextLink } from "../links/text-link";
import { ring } from "../ring";
import { nextIndex } from "../roving";
import { ColumnHeading } from "./column-heading";
import { MenuItemText } from "./menu-item-text";
import type { MenuLink, NavItem } from "./nav-types";
import { menuColumns } from "./nav-types";

/** A desk menu's column, at its widest; the columns wrap on a narrower window. */
const COLUMN_WIDTH = 232;

/**
 * A desk menu's panel, open across the nav: columns ruled apart, under family
 * or group headings where the items have them, and a strip below with the
 * "see all" and the quieter links. The header owns its trigger and when it
 * is open, and mounts this only while it is.
 */
export function MenuPanel({
    id,
    label,
    items,
    columns,
    seeAll,
    links = [],
    pathname,
}: {
    id: string;
    label: string;
    items: NavItem[];
    /** How many columns when the items have no groups. */
    columns: number;
    /** The strip under the columns: its one strong link, on the left. */
    seeAll?: MenuLink;
    /** The strip's quieter links, on the right. */
    links?: MenuLink[];
    pathname: string;
}) {
    const menu = useRef<HTMLDivElement>(null);

    // Opening a menu puts focus on its first item, as the design's script
    // does, so the arrow keys work straight away.
    useEffect(() => {
        menu.current?.querySelector<HTMLElement>("a")?.focus();
    }, []);

    const shown = menuColumns(items, columns);

    return (
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
                                key={column.heading ?? column.items[0]?.href}
                                role={column.heading ? "group" : undefined}
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
                                        <MenuItemText
                                            item={item}
                                            nameClass="text-[15px]"
                                        />
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
    );
}

/** Arrow keys move through a menu's items, wrapping at either end. */
export function moveWithArrows(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
        e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = nextIndex(e.key, at, items.length);
    if (next === null) return;
    e.preventDefault();
    items[next]?.focus();
}
