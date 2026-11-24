"use client";

import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import { SectionList } from "@saroh/ui/section-list";
import {
    ArrowUpRight,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    LayoutGrid,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { GROUP_ICONS } from "./group-icons";
import type { SiteGroup, SiteGroupId } from "./group-map";
import { currentSection, overviewHref } from "./group-map";

/**
 * A row's look, and the column's rule on its right: Settings' side list's
 * (`@saroh/ui/section-list` as `settings-tabs.tsx` draws it). Not that
 * component itself: its rows cannot open a group in place.
 */
const ROW =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11";
const OFF =
    "font-medium text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent-active";
const ON = "bg-muted font-semibold text-foreground";

/**
 * The desk's list beside every site screen (WXHOverview, WXPPages):
 * Overview, then the four groups. The open screen's group starts open;
 * another opens in place, so its rows are one press away without leaving.
 * Hidden below 760px, where the site home lists the groups instead.
 */
export function SiteSectionList({
    siteId,
    groups,
}: {
    siteId: string;
    groups: readonly SiteGroup[];
}) {
    const pathname = usePathname();
    const search = useSearchParams();
    const here = currentSection(groups, siteId, pathname, search);
    const [opened, setOpened] = useState<SiteGroupId | null>(null);
    const open = (id: SiteGroupId) => id === here.group || id === opened;

    return (
        <nav
            aria-label="Website"
            className="hidden min-w-0 flex-col gap-0.5 border-r border-border px-2.5 py-3.5 min-[760px]:flex"
        >
            <IntentLink
                href={overviewHref(siteId)}
                aria-current={here.section === "overview" ? "page" : undefined}
                className={cn(ROW, here.section === "overview" ? ON : OFF)}
            >
                <LayoutGrid aria-hidden className="size-4 shrink-0" />
                Overview
            </IntentLink>
            {groups.map((group) => {
                const Icon = GROUP_ICONS[group.id];
                const isOpen = open(group.id);
                const listId = `site-group-${group.id}`;
                return (
                    <div key={group.id} className="flex flex-col gap-0.5">
                        <Button
                            type="button"
                            variant="ghost"
                            aria-expanded={isOpen}
                            aria-controls={listId}
                            onClick={() =>
                                setOpened(opened === group.id ? null : group.id)
                            }
                            className={cn(ROW, OFF, "h-auto justify-start")}
                        >
                            <Icon aria-hidden className="size-4 shrink-0" />
                            <span className="min-w-0 flex-1">
                                {group.label}
                            </span>
                            {isOpen ? (
                                <ChevronDown aria-hidden className="size-4" />
                            ) : (
                                <ChevronRight aria-hidden className="size-4" />
                            )}
                        </Button>
                        {isOpen ? (
                            <ul id={listId} className="flex flex-col gap-0.5">
                                {group.sections.map((s) => {
                                    const on = s.id === here.section;
                                    return (
                                        <li key={s.id}>
                                            <IntentLink
                                                href={s.href}
                                                aria-current={
                                                    on ? "page" : undefined
                                                }
                                                className={cn(
                                                    ROW,
                                                    "pl-9",
                                                    on ? ON : OFF,
                                                )}
                                            >
                                                <span className="min-w-0 flex-1">
                                                    {s.label}
                                                </span>
                                                {s.leaves ? (
                                                    <ArrowUpRight
                                                        aria-hidden
                                                        className="size-3.5 shrink-0"
                                                    />
                                                ) : null}
                                            </IntentLink>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : null}
                    </div>
                );
            })}
        </nav>
    );
}

/**
 * A phone's way around inside a group (WXHOverviewPhone): back to the site
 * home, and the group's screens as one row. Nothing on the site home itself,
 * which is the list.
 */
export function SitePhoneNav({
    siteId,
    groups,
}: {
    siteId: string;
    groups: readonly SiteGroup[];
}) {
    const pathname = usePathname();
    const search = useSearchParams();
    const here = currentSection(groups, siteId, pathname, search);
    if (here.section === "overview") return null;
    const group = groups.find((g) => g.id === here.group);
    return (
        <div className="flex min-w-0 flex-col gap-2 min-[760px]:hidden">
            <IntentLink
                href={overviewHref(siteId)}
                className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-md px-1 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <ChevronLeft aria-hidden className="size-4" />
                Site home
            </IntentLink>
            {group && group.sections.length > 1 ? (
                <SectionList
                    label={group.label}
                    value={here.section}
                    items={group.sections.map((s) => ({
                        value: s.id,
                        label: s.label,
                        href: s.href,
                    }))}
                />
            ) : null}
        </div>
    );
}
