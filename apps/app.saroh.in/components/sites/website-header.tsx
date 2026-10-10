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
import { useEdgeFade } from "@saroh/ui/scroll-x";
import {
    Check,
    ChevronDown,
    ExternalLink,
    Globe,
    PenLine,
    Plus,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";

import { QrButton } from "@/components/qr/qr-button";
import { mayAddWebsite } from "@/lib/business-limits";
import type { PostCategory } from "@/lib/content/service";
import type { SiteStateTone } from "@/lib/sites/site-state";

import { PostCategoriesSheet } from "./post-categories-sheet";

export interface WebsiteHeaderSite {
    id: string;
    name: string;
    state: { label: string; tone: SiteStateTone };
    /**
     * Past the plan's websites limit (#800): stopped taking orders and
     * bookings. The note under the header says why.
     */
    paused?: boolean;
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
    liveUrl = null,
    qrUrl = null,
    canEdit,
    mayCreate,
    pageCount,
    postCount,
    formEntries,
    postCategories,
}: {
    site: WebsiteHeaderSite;
    sites: WebsiteHeaderSite[];
    /** Where the public reaches it: "rye.saroh.app". */
    address: string;
    /**
     * `https://` + the address, set only while the site is published: the
     * address is then a link that opens the live site. Never published, it
     * stays text, since nobody can reach it yet; Open editor (or Review, for
     * a reader) is where the draft is seen.
     */
    liveUrl?: string | null;
    /**
     * `https://` + the address whenever the site has one, published or
     * not: what its QR code is for. Null (no address yet) leaves the QR
     * button out. The panel says when the site isn't published.
     */
    qrUrl?: string | null;
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
    /**
     * The site's post categories, for the Posts tab's "Categories" sheet:
     * `null` when they could not be read (the sheet says so), `undefined`
     * for someone who can't change them, who isn't offered the button.
     */
    postCategories?: PostCategory[] | null;
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
    // On a phone the tabs scroll sideways: the strip fades on the side with
    // more, and the open tab is scrolled into view (UX-079).
    const strip = useRef<HTMLElement>(null);
    const fade = useEdgeFade(strip, {
        current: '[aria-current="page"]',
        revealKey: pathname,
    });

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
                        <SiteAddressLink
                            address={address}
                            liveUrl={liveUrl}
                            previewHref={base}
                            siteName={site.name.trim() || "Untitled site"}
                        />
                        {qrUrl ? (
                            // Icon alone, so the line stays one line on a phone.
                            <QrButton
                                compact="always"
                                variant="ghost"
                                className="-my-1"
                                link={{
                                    mode: "saved",
                                    kind: "SITE",
                                    siteId: site.id,
                                    url: qrUrl,
                                    what: "your website",
                                    from: "Website screen",
                                }}
                            />
                        ) : null}
                        <StateBadge state={site.state} />
                        {site.paused ? (
                            <span
                                className={badgeVariants({
                                    variant: "warning",
                                })}
                            >
                                Paused
                            </span>
                        ) : null}
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
                            siteId={site.id}
                            base={base}
                            canEdit={canEdit}
                            postCategories={postCategories}
                        />
                    </>
                }
            />
            <nav
                ref={strip}
                aria-label="Website"
                data-scroll-x=""
                style={fade}
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

/** The header's link look: the address's size, its icon beside it. */
const ADDRESS_LINK =
    "-my-1 inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm py-1 text-[12px] text-foreground underline underline-offset-2 transition-colors duration-fast hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-foreground coarse:min-h-11";

/**
 * The site's address under the title, opening in a new tab.
 *
 * - Published: the address is the link, to the live site.
 * - Never published: the address opens nothing yet, so it stays text, and
 *   "Preview" beside it opens the draft in the workspace (the editor, or
 *   Review for someone who reads the site: `/sites/:id` sends them there).
 *   A shareable preview link is a thing the owner makes on purpose (Review
 *   tab), so none is made here.
 */
export function SiteAddressLink({
    address,
    liveUrl,
    previewHref,
    siteName,
}: {
    address: string;
    liveUrl: string | null;
    /** Where the draft is seen in the workspace. */
    previewHref: string;
    siteName: string;
}) {
    if (!liveUrl) {
        return (
            <>
                <span className="min-w-0 font-mono text-[12px] [overflow-wrap:anywhere]">
                    {address}
                </span>
                <a
                    href={previewHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Preview ${siteName}'s website, not published yet (opens in a new tab)`}
                    data-site-preview
                    className={cn(ADDRESS_LINK, "font-medium")}
                >
                    Preview
                    <ExternalLink aria-hidden className="size-3 shrink-0" />
                </a>
            </>
        );
    }
    return (
        <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${siteName}'s website (opens in a new tab)`}
            data-site-address
            className={cn(ADDRESS_LINK, "font-mono")}
        >
            <span className="min-w-0 [overflow-wrap:anywhere]">{address}</span>
            <ExternalLink aria-hidden className="size-3 shrink-0" />
        </a>
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
    siteId,
    base,
    canEdit,
    postCategories,
}: {
    tab: TabId;
    siteId: string;
    base: string;
    canEdit: boolean;
    postCategories: PostCategory[] | null | undefined;
}) {
    if (!canEdit) return null;
    if (tab === "posts") {
        return (
            <>
                {/* Managed here, in a sheet over the posts they group. */}
                {postCategories === undefined ? null : (
                    <PostCategoriesSheet
                        siteId={siteId}
                        categories={postCategories}
                    />
                )}
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
                                        {s.paused
                                            ? " · Paused, not taking orders"
                                            : ""}
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
