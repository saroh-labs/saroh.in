"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { ListTable, ListTableHead, listTable } from "@saroh/ui/list-table";
import {
    AttentionToggle,
    ListFilter,
    ListToolbar,
    MoreFilters,
    NARROWED,
} from "@saroh/ui/list-toolbar";
import { OptionSelect } from "@saroh/ui/option-select";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { showSuccess } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { AddPagePanel } from "@/components/sites/pages/add-page-panel";
import { addPageOffers } from "@/lib/sites/page-menu";
import type {
    ChangeUnit,
    ModulePageKind,
    SiteOverview,
    SitePage,
    SiteRedirect,
} from "@/lib/sites/service";

import { PageRowMenu } from "./page-row-menu";
import { PageSheet } from "./page-sheet";
import { hiddenWords, issueWords, madeFrom, pageLink } from "./page-words";
import type {
    MenuFilter,
    PagesQuery,
    PagesSort,
    StatusFilter,
    WhoFilter,
} from "./pages-filter";
import {
    cleared,
    filterPages,
    narrowed,
    pageStatus,
    pagesCount,
    readPagesQuery,
    writePagesQuery,
} from "./pages-filter";

const ALL_EDITORS = "all";

/** Desk columns: Page, In menu, Who can see it, To fix, Last edited, menu. */
const COLS =
    "md:grid md:grid-cols-[minmax(0,2.4fr)_72px_112px_minmax(0,1.2fr)_minmax(0,1.3fr)_36px] md:items-center md:gap-3";

/**
 * Website › Pages (plan 2026-11-18-001 U5, WXPPages): every page, read
 * first, with its link, whether it is in the menu, who can see it, what
 * it still needs (the Overview's page health, so the two counts agree) and
 * who last changed it. One toolbar row (the house list anatomy): Find a
 * page, In the menu, Who can see it, Status (the Publish sheet's change
 * units), Edited by behind Filters, the Needs fixing toggle, the sort and
 * the count, all in the address (`?view=fix` and the rest).
 *
 * A page's settings open in a side sheet from its row, its menu or the
 * address (`?page=<id>`: Overview's fix links land here), and close back
 * to the list. A reader (DEC-200) reads every row and every sheet, and
 * changes nothing.
 */
export function PagesArea({
    siteId,
    siteName,
    pages,
    host,
    live,
    siteImageUrl,
    canUpdate,
    addableKinds,
    health,
    edits,
    lastPublishedAt = null,
    redirects,
    changes = null,
    footer,
}: {
    siteId: string;
    siteName: string;
    pages: readonly SitePage[];
    host: string | null;
    live: boolean;
    siteImageUrl: string | null;
    canUpdate: boolean;
    addableKinds?: ModulePageKind[];
    /** Null when the overview couldn't be read: no column then claims "All good". */
    health: SiteOverview["needsDoing"] | null;
    edits: SiteOverview["pageEdits"] | null;
    /** When the site last went live; null when never or unknown. */
    lastPublishedAt?: string | null;
    redirects: readonly SiteRedirect[] | null;
    /**
     * What publishing would change (U7's units, the status chip's count);
     * null when it couldn't be read: no Status filter then.
     */
    changes?: readonly ChangeUnit[] | null;
    /** A line under the list (the AI way in). */
    footer?: ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const query = readPagesQuery(params);
    const [adding, setAdding] = useState(false);

    const healthOf = new Map((health ?? []).map((h) => [h.pageId, h]));
    const edited = new Map((edits ?? []).map((e) => [e.pageId, e]));
    // A link changed since the last publish: an automatic old link to it waits.
    const moved = new Set(
        (redirects ?? [])
            .filter((r) => r.source === "AUTO" && !r.live)
            .map((r) => r.toPath),
    );
    const sorted = [...pages].sort(
        (a, b) => Number(b.isHome) - Number(a.isHome),
    );
    const inMenu = (p: SitePage) => p.isHome || p.inMenu !== false;
    const needs = (p: SitePage) => (healthOf.get(p.id)?.issues.length ?? 0) > 0;
    const facts = sorted.map((page) => {
        const edit = edited.get(page.id);
        return {
            page,
            inMenu: inMenu(page),
            hidden: page.hidden,
            needsFix: health ? needs(page) : null,
            status: changes ? pageStatus(page, changes, live) : null,
            editedBy: edit?.by ?? null,
            editedAt: edit?.at ?? page.updatedAt ?? null,
            title: page.title,
            path: page.path,
        };
    });
    const shown = filterPages(facts, query).map((f) => f.page);
    const editors = Array.from(
        new Set(facts.flatMap((f) => (f.editedBy ? [f.editedBy] : []))),
    ).sort();
    const setQuery = (patch: Partial<PagesQuery>) => {
        const q = writePagesQuery(params, { ...query, ...patch }).toString();
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    };

    // Edited since the site last went live, or its link changed since.
    const waits = (p: SitePage) => {
        const at = edited.get(p.id)?.at;
        return (
            moved.has(p.path) ||
            (at !== undefined && (!lastPublishedAt || at > lastPublishedAt))
        );
    };

    const openId = params.get("page");
    const open = pages.find((p) => p.id === openId) ?? null;
    const goTo = (pageId: string | null) => {
        const next = new URLSearchParams(params.toString());
        if (pageId) next.set("page", pageId);
        else next.delete("page");
        const q = next.toString();
        router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    };
    const url = (p: SitePage) =>
        host ? `https://${pageLink(host, p.path)}` : null;

    const statusCount = (status: StatusFilter) =>
        facts.filter((f) => f.status === status).length;

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="max-w-prose text-sm text-muted-foreground">
                    Every page
                    {host ? (
                        <>
                            {" on "}
                            <span data-ph-mask="">{host}</span>
                        </>
                    ) : null}
                    . Open one to change its link, its text on Google or who can
                    see it.
                </p>
                {canUpdate ? (
                    <Popover open={adding} onOpenChange={setAdding}>
                        <PopoverTrigger asChild>
                            <Button type="button" className="gap-1.5">
                                <Plus aria-hidden className="size-4" />
                                New page
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            className="w-72 max-w-[calc(100vw-2rem)] p-0"
                        >
                            <AddPagePanel
                                siteId={siteId}
                                offers={addPageOffers(addableKinds)}
                                onCancel={() => setAdding(false)}
                                onAdded={(page) => {
                                    setAdding(false);
                                    showSuccess(`Added ${page.title}.`);
                                    goTo(page.id);
                                    router.refresh();
                                }}
                            />
                        </PopoverContent>
                    </Popover>
                ) : null}
            </div>

            <ListToolbar
                search={
                    <ListSearch
                        placeholder="Find a page"
                        defaultValue={query.q}
                        onSearch={(q) => {
                            if (q !== query.q) setQuery({ q });
                        }}
                    />
                }
                filters={
                    <>
                        <ListFilter<MenuFilter>
                            label="In the menu"
                            value={query.menu}
                            onValueChange={(menu) => setQuery({ menu })}
                            options={[
                                { value: "all", label: "All pages" },
                                {
                                    value: "in",
                                    label: "In the menu",
                                    count: facts.filter((f) => f.inMenu).length,
                                },
                                {
                                    value: "out",
                                    label: "Not in the menu",
                                    count: facts.filter((f) => !f.inMenu)
                                        .length,
                                },
                            ]}
                        />
                        <ListFilter<WhoFilter>
                            label="Who can see it"
                            value={query.who}
                            onValueChange={(who) => setQuery({ who })}
                            options={[
                                { value: "all", label: "Public and hidden" },
                                {
                                    value: "public",
                                    label: "Everyone",
                                    count: facts.filter((f) => !f.hidden)
                                        .length,
                                },
                                {
                                    value: "hidden",
                                    label: "Hidden",
                                    count: facts.filter((f) => f.hidden).length,
                                },
                                // TODO(batch 7): "Customers who sign in".
                            ]}
                        />
                        {changes ? (
                            <ListFilter<StatusFilter>
                                label="Status"
                                value={query.status}
                                onValueChange={(status) => setQuery({ status })}
                                options={[
                                    { value: "all", label: "All statuses" },
                                    {
                                        value: "live",
                                        label: "Live",
                                        count: statusCount("live"),
                                    },
                                    {
                                        value: "waiting",
                                        label: "Changes waiting",
                                        count: statusCount("waiting"),
                                    },
                                    {
                                        value: "new",
                                        label: "Not live yet",
                                        count: statusCount("new"),
                                    },
                                ]}
                            />
                        ) : null}
                    </>
                }
                more={
                    editors.length > 0 ? (
                        <MoreFilters
                            title="Filter pages"
                            count={query.by ? 1 : 0}
                        >
                            {/* Teammates' names: masked in a recording. */}
                            <span data-ph-mask="" className="grid">
                                <OptionSelect<string>
                                    aria-label="Edited by"
                                    value={query.by || ALL_EDITORS}
                                    onValueChange={(v) =>
                                        setQuery({
                                            by: v === ALL_EDITORS ? "" : v,
                                        })
                                    }
                                    className={cn(
                                        "w-full",
                                        query.by && NARROWED,
                                    )}
                                    options={[
                                        {
                                            value: ALL_EDITORS,
                                            label: "All editors",
                                        },
                                        ...editors.map((name) => ({
                                            value: name,
                                            label: `Edited by ${name}`,
                                        })),
                                    ]}
                                />
                            </span>
                        </MoreFilters>
                    ) : null
                }
                attention={
                    health ? (
                        <AttentionToggle
                            label="Needs fixing"
                            count={pages.filter(needs).length}
                            on={query.fix}
                            onToggle={() => setQuery({ fix: !query.fix })}
                        />
                    ) : null
                }
                onClear={
                    narrowed(query) ? () => setQuery(cleared(query)) : undefined
                }
                end={
                    <ListFilter<PagesSort>
                        // A sort narrows nothing.
                        narrowed={false}
                        label="Sort"
                        value={query.sort}
                        onValueChange={(sort) => setQuery({ sort })}
                        options={[
                            { value: "menu", label: "Menu order" },
                            { value: "edited", label: "Last edited" },
                            { value: "name", label: "Name A to Z" },
                        ]}
                    />
                }
                count={pagesCount(shown.length, pages.length)}
            />

            {shown.length === 0 ? (
                query.fix && !narrowed({ ...query, fix: false }) ? (
                    <EmptyState
                        size="inline"
                        title={`All ${pages.length} pages look good`}
                        description="Each has text for Google, a share photo and working links."
                    />
                ) : (
                    <EmptyState
                        size="inline"
                        title="No page matches"
                        description={
                            query.q.trim()
                                ? "Try another word, or clear the search."
                                : "Try another filter, or clear the filters."
                        }
                    />
                )
            ) : (
                <ListTable>
                    <ListTableHead className={cn("hidden", COLS)}>
                        <span>Page</span>
                        <span>In menu</span>
                        <span>Who can see it</span>
                        <span>To fix</span>
                        <span>Last edited</span>
                        <span />
                    </ListTableHead>
                    <ul aria-label="Pages">
                        {shown.map((page) => {
                            const fix = healthOf.get(page.id);
                            const hasFix = (fix?.issues.length ?? 0) > 0;
                            const fixWords =
                                health === null
                                    ? null
                                    : fix && hasFix
                                      ? issueWords(fix)
                                      : "All good";
                            const edit = edited.get(page.id);
                            const from = madeFrom(page);
                            const who = page.hidden ? "Hidden" : "Public";
                            const menu = inMenu(page) ? "Yes" : "No";
                            return (
                                <li
                                    key={page.id}
                                    data-page-row={page.path}
                                    className={cn(
                                        listTable.row,
                                        "flex items-start gap-3",
                                        COLS,
                                    )}
                                >
                                    <div className="min-w-0 flex-1">
                                        <span className="flex min-w-0 items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="link"
                                                size="inline"
                                                onClick={() => goTo(page.id)}
                                                className="min-w-0 justify-start font-semibold text-foreground coarse:min-h-11"
                                            >
                                                <span
                                                    data-ph-mask=""
                                                    className="truncate"
                                                >
                                                    {page.title}
                                                </span>
                                            </Button>
                                            {from ? (
                                                <Badge variant="neutral">
                                                    {from}
                                                </Badge>
                                            ) : null}
                                        </span>
                                        <p
                                            data-ph-mask=""
                                            className="truncate font-mono text-xs text-muted-foreground"
                                        >
                                            {page.path}
                                        </p>
                                        {moved.has(page.path) ? (
                                            <p className="text-xs text-muted-foreground">
                                                {`Link changed${edit?.by ? ` by ${edit.by}` : ""} · goes live when you publish`}
                                            </p>
                                        ) : null}
                                        {/* A phone reads the columns here. */}
                                        <p className="text-xs text-muted-foreground md:hidden">
                                            {[
                                                hasFix ? fixWords : null,
                                                inMenu(page)
                                                    ? "In menu"
                                                    : "Not in menu",
                                                who,
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                        </p>
                                    </div>
                                    <span className="hidden text-sm md:block">
                                        {menu}
                                    </span>
                                    <span className="hidden text-sm md:block">
                                        {who}
                                    </span>
                                    <span
                                        className={cn(
                                            "hidden text-sm md:block",
                                            hasFix
                                                ? "font-medium text-foreground"
                                                : "text-muted-foreground",
                                        )}
                                    >
                                        {fixWords ?? ""}
                                    </span>
                                    <span className="hidden min-w-0 truncate text-sm text-muted-foreground md:block">
                                        {edit?.by ? (
                                            <span data-ph-mask="">
                                                {`${edit.by} · `}
                                            </span>
                                        ) : null}
                                        {edit?.at || page.updatedAt ? (
                                            <ViewerDate
                                                iso={
                                                    edit?.at ??
                                                    page.updatedAt ??
                                                    ""
                                                }
                                            />
                                        ) : null}
                                    </span>
                                    <PageRowMenu
                                        siteId={siteId}
                                        page={page}
                                        url={url(page)}
                                        host={host}
                                        business={siteName}
                                        shareable={live && !page.hidden}
                                        canUpdate={canUpdate}
                                        onSettings={() => goTo(page.id)}
                                        onChanged={() => router.refresh()}
                                        onDuplicated={(copy) => {
                                            goTo(copy.id);
                                            router.refresh();
                                        }}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </ListTable>
            )}
            <p className="text-sm text-muted-foreground">
                Shop and Blog pages are made for you from your products and
                posts: their contents update themselves.
            </p>
            {footer}

            <PageSheet
                siteId={siteId}
                page={open}
                host={host}
                siteName={siteName}
                siteImageUrl={siteImageUrl}
                live={live}
                canUpdate={canUpdate}
                unseen={open ? hiddenWords(healthOf.get(open.id)) : null}
                waiting={open ? waits(open) : false}
                editorHref={open ? `/sites/${siteId}?page=${open.id}` : null}
                onClose={() => goTo(null)}
                onSaved={() => router.refresh()}
                onDeleted={() => {
                    goTo(null);
                    router.refresh();
                }}
            />
        </div>
    );
}
