"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { Check, ChevronDown, LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { StateBadge } from "@/components/sites/header/website-header";
import { mayAddWebsite } from "@/lib/business-limits";
import type { SiteStateTone } from "@/lib/sites/site-state";

import { switchHref } from "./group-map";

export interface SwitcherSite {
    id: string;
    name: string;
    /** "gulmohar.saroh.app", or null before it has an address. */
    host: string | null;
    status: { label: string; tone: SiteStateTone };
    paused?: boolean;
}

/** A site's mark: its initial on a tile, the same in every list. */
export function SiteTile({
    name,
    className,
}: {
    name: string;
    className?: string;
}) {
    return (
        <span
            aria-hidden
            className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted font-serif text-sm font-semibold text-foreground",
                className,
            )}
        >
            {(name.trim().charAt(0) || "S").toUpperCase()}
        </span>
    );
}

/**
 * Which site this is, and the way to another (WXHSwitcher): each site with
 * its address and status, New site while the business may add one
 * (ADR-006), and All sites. Another site opens on the same screen. With
 * one site it is the site's name alone (DEC-230).
 */
export function SiteSwitcher({
    site,
    sites,
    mayCreate,
}: {
    site: SwitcherSite;
    sites: readonly SwitcherSite[];
    mayCreate: boolean;
}) {
    const pathname = usePathname();
    const search = useSearchParams().toString();
    // One site (DEC-230: one per business until adding sites ships): its
    // name, and no list to open.
    if (sites.length <= 1) {
        return (
            <span
                data-ph-mask=""
                className="flex min-w-0 items-center gap-2 font-semibold"
            >
                <SiteTile name={site.name} className="size-6 text-xs" />
                <span className="truncate">{site.name}</span>
            </span>
        );
    }
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    data-ph-mask=""
                    variant="outline"
                    className="min-w-0 max-w-full gap-2 font-semibold"
                    aria-label={`Website: ${site.name}. Change it.`}
                >
                    <SiteTile name={site.name} className="size-6 text-xs" />
                    <span className="truncate">{site.name}</span>
                    <ChevronDown aria-hidden className="size-4 shrink-0" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                className="w-[min(380px,calc(100vw-32px))]"
            >
                <DropdownMenuLabel className="label">
                    Your sites
                </DropdownMenuLabel>
                {sites.map((s) => {
                    const on = s.id === site.id;
                    return (
                        <DropdownMenuItem
                            key={s.id}
                            asChild
                            className={cn("gap-2.5", on && "bg-muted")}
                        >
                            <Link
                                href={
                                    on
                                        ? pathname
                                        : switchHref(
                                              pathname,
                                              search,
                                              site.id,
                                              s.id,
                                          )
                                }
                                aria-current={on ? "page" : undefined}
                            >
                                <SiteTile name={s.name} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium">
                                        {s.name}
                                    </span>
                                    {s.host ? (
                                        <span className="block truncate font-mono text-xs text-muted-foreground">
                                            {s.host}
                                        </span>
                                    ) : null}
                                    {s.paused ? (
                                        <span className="block text-xs text-muted-foreground">
                                            Paused, not taking orders
                                        </span>
                                    ) : null}
                                </span>
                                <StateBadge state={s.status} />
                                {on ? <Check aria-hidden /> : null}
                            </Link>
                        </DropdownMenuItem>
                    );
                })}
                <DropdownMenuSeparator />
                {mayCreate && mayAddWebsite(sites.length) ? (
                    <DropdownMenuItem asChild>
                        <Link href="/sites/new">
                            <Plus aria-hidden />
                            New site
                        </Link>
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                    <Link href="/sites">
                        <LayoutGrid aria-hidden />
                        All sites
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
