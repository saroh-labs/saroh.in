"use client";

import { badgeVariants } from "@saroh/ui/badge";
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
import { PageHeader } from "@saroh/ui/page-header";
import { Check, ChevronDown, Globe, PenLine, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { mayAddWebsite } from "@/lib/business-limits";
import type { SiteStateTone } from "@/lib/sites/site-state";

export interface WebsiteHeaderSite {
    id: string;
    name: string;
    state: { label: string; tone: SiteStateTone };
}

type TabId = "pages" | "posts" | "forms" | "settings" | "review";

/**
 * The Website screen's head: its name, which site is open, what can be done
 * here, and the site's tabs — after the workspace design's `website` route.
 *
 * One rail row, not a tree. The rail used to hang every site and three rows
 * under each beneath Website; the design keeps the rail to what the business
 * HAS, and puts which site you are working on here, on the screen that is
 * about it. Every destination the tree offered is one click from this header:
 * the tabs, and the picker's own "New site".
 *
 * A client component only because the tab and the action follow the address:
 * the layout above it renders once for all tabs and cannot see which is open.
 */
export function WebsiteHeader({
    site,
    sites,
    address,
    canEdit,
    mayCreate,
    pageCount,
    postCount,
    formEntries,
}: {
    site: WebsiteHeaderSite;
    sites: WebsiteHeaderSite[];
    /** Where the public reaches it: "rye.saroh.app". */
    address: string;
    /** `can.edit` for this site: author tabs, or the reading ones. */
    canEdit: boolean;
    mayCreate: boolean;
    pageCount: number;
    postCount: number | null;
    /**
     * Entries through this site's forms, when this person may read them
     * (`form:read`); `undefined` hides the Forms tab. People's details are
     * in there, so it follows its own permission, not the site's.
     */
    formEntries?: number | null;
}) {
    const pathname = usePathname();
    const base = `/sites/${site.id}`;
    // The picker is for a business with more than one website, or one that
    // may still add one (ADR-006). Without it, the name it carried is said
    // beside the address instead, so the screen still says which site it is.
    const showPicker =
        sites.length > 1 || (mayCreate && mayAddWebsite(sites.length));

    const formsTab =
        formEntries === undefined
            ? []
            : [
                  {
                      id: "forms" as const,
                      label: "Forms",
                      href: `${base}/forms`,
                      count: formEntries ?? undefined,
                  },
              ];
    const tabs: { id: TabId; label: string; href: string; count?: number }[] =
        canEdit
            ? [
                  {
                      id: "pages",
                      label: "Pages",
                      href: `${base}/pages`,
                      count: pageCount,
                  },
                  {
                      id: "posts",
                      label: "Posts",
                      href: `${base}/posts`,
                      count: postCount ?? undefined,
                  },
                  ...formsTab,
                  {
                      id: "settings",
                      label: "Settings",
                      href: `${base}/settings`,
                  },
              ]
            : [
                  // Settings is left out of the reading tabs for the reason
                  // it was left out of the rail: it opens, and then says they
                  // cannot change anything.
                  { id: "review", label: "Review", href: `${base}/review` },
                  {
                      id: "posts",
                      label: "Posts",
                      href: `${base}/posts`,
                      count: postCount ?? undefined,
                  },
                  ...formsTab,
              ];
    const active =
        tabs.find((t) => pathname.startsWith(t.href))?.id ?? tabs[0].id;

    // Switching site keeps the tab you were on, where the other site has it.
    const switchTo = (id: string) =>
        active === "posts" || active === "forms" || active === "settings"
            ? `/sites/${id}/${active}`
            : `/sites/${id}/pages`;

    return (
        <div className="flex flex-col gap-5">
            <PageHeader
                title="Website"
                className="mb-0"
                description={
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {showPicker ? null : (
                            <span className="font-medium text-foreground">
                                {site.name.trim() || "Untitled site"}
                            </span>
                        )}
                        <span className="font-mono text-[12px]">{address}</span>
                        <StateBadge state={site.state} />
                    </span>
                }
                actions={
                    <>
                        {showPicker ? (
                            <SitePicker
                                site={site}
                                sites={sites}
                                mayCreate={mayCreate}
                                hrefFor={switchTo}
                            />
                        ) : null}
                        <TabActions
                            tab={active}
                            base={base}
                            canEdit={canEdit}
                        />
                    </>
                }
            />
            <nav
                aria-label="Website"
                className="flex gap-1 overflow-x-auto border-b border-border"
            >
                {tabs.map((t) => {
                    const on = t.id === active;
                    return (
                        <Link
                            key={t.id}
                            href={t.href}
                            aria-current={on ? "page" : undefined}
                            className={cn(
                                "flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-[14px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                                on
                                    ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                    : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {t.label}
                            {t.count === undefined ? null : (
                                <span
                                    className={cn(
                                        "rounded-full px-[7px] py-0.5 text-[11px] font-semibold tabular-nums",
                                        on
                                            ? "bg-muted text-foreground"
                                            : "bg-foreground/[0.04] text-muted-foreground",
                                    )}
                                >
                                    {t.count}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}

/**
 * The site's ranked state as a pill. A span drawn with the badge's own styles,
 * not `<Badge>` (a div), so it can sit in the header's description paragraph
 * directly under the title.
 */
export function StateBadge({
    state,
}: {
    state: { label: string; tone: SiteStateTone };
}) {
    return (
        <span
            className={badgeVariants({
                variant:
                    state.tone === "live"
                        ? "success"
                        : state.tone === "attention"
                          ? "warning"
                          : "neutral",
            })}
        >
            {state.label}
        </span>
    );
}

/** The one thing each tab is for, in the header's action slot. */
function TabActions({
    tab,
    base,
    canEdit,
}: {
    tab: TabId;
    base: string;
    canEdit: boolean;
}) {
    if (!canEdit) return null;
    if (tab === "posts") {
        return (
            <>
                <Button variant="outline" asChild>
                    <Link href={`${base}/posts/categories`}>Categories</Link>
                </Button>
                <Button asChild>
                    <Link href={`${base}/posts/new`}>
                        <Plus className="mr-1.5 size-4" />
                        New post
                    </Link>
                </Button>
            </>
        );
    }
    // Pages are added, ordered and hidden in the editor, where the page they
    // make is on screen — so the Pages tab's action is to go there.
    return (
        <Button asChild>
            <Link href={base}>
                <PenLine className="mr-1.5 size-4" />
                Open editor
            </Link>
        </Button>
    );
}

/**
 * Which site this screen is about. After the design's scope picker, with its
 * note: picking a site changes this screen, not the rest of the workspace.
 */
function SitePicker({
    site,
    sites,
    mayCreate,
    hrefFor,
}: {
    site: WebsiteHeaderSite;
    sites: WebsiteHeaderSite[];
    mayCreate: boolean;
    hrefFor: (id: string) => string;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className="h-[38px] max-w-[260px] gap-[7px] px-[13px] text-[13px] font-medium text-neutral-600 dark:text-foreground"
                    aria-label={`Website: ${site.name}. Change it.`}
                >
                    <Globe aria-hidden className="size-4 shrink-0" />
                    <span className="truncate">{site.name}</span>
                    <ChevronDown aria-hidden className="size-4 shrink-0" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[250px]">
                <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Websites in this business
                </DropdownMenuLabel>
                {sites.map((s) => {
                    const on = s.id === site.id;
                    return (
                        <DropdownMenuItem
                            key={s.id}
                            asChild
                            className={cn(on && "bg-foreground/[0.03]")}
                        >
                            <Link
                                href={hrefFor(s.id)}
                                aria-current={on ? "page" : undefined}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12.5px] font-medium">
                                        {s.name.trim() || "Untitled site"}
                                    </span>
                                    <span className="block text-[11px] text-muted-foreground">
                                        {s.state.label}
                                    </span>
                                </span>
                                {on ? <Check aria-hidden /> : null}
                            </Link>
                        </DropdownMenuItem>
                    );
                })}
                {mayCreate && mayAddWebsite(sites.length) ? (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link href="/sites/new">
                                <Plus aria-hidden />
                                <span className="text-[12.5px] font-medium">
                                    New site
                                </span>
                            </Link>
                        </DropdownMenuItem>
                    </>
                ) : null}
                <DropdownMenuSeparator />
                <p className="px-[9px] pb-1 pt-0.5 text-[11px] leading-[1.45] text-muted-foreground">
                    This picks which website you are editing — it is not a scope
                    the whole rail follows.
                </p>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
