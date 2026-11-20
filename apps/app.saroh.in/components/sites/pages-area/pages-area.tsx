"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { ListTable, ListTableHead, listTable } from "@saroh/ui/list-table";
import { ListToolbar } from "@saroh/ui/list-toolbar";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { TabStrip } from "@saroh/ui/tabs";
import { showSuccess } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { AddPagePanel } from "@/components/sites/pages/add-page-panel";
import { addPageOffers } from "@/lib/sites/page-menu";
import type {
    ModulePageKind,
    SiteOverview,
    SitePage,
    SiteRedirect,
} from "@/lib/sites/service";

import { PageRowMenu } from "./page-row-menu";
import { PageSheet } from "./page-sheet";
import type { PageIssue } from "./page-words";
import { ISSUE_WORDS, madeFrom, pageLink } from "./page-words";

type Filter = "all" | "menu" | "fix";

/** Desk columns: Page, In menu, Who can see it, To fix, Last edited, menu. */
const COLS =
    "md:grid md:grid-cols-[minmax(0,2.4fr)_72px_112px_minmax(0,1.2fr)_minmax(0,1.3fr)_36px] md:items-center md:gap-3";

/**
 * Website › Pages (plan 2026-11-18-001 U5, WXPPages): every page, read
 * first, with its link, whether it is in the menu, who can see it, what
 * it still needs (the Overview's page health, so the two counts agree) and
 * who last changed it. All, In menu and Needs fixing, and Find a page.
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
    redirects,
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
    redirects: readonly SiteRedirect[] | null;
    /** A line under the list (the AI way in). */
    footer?: ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [filter, setFilter] = useState<Filter>("all");
    const [term, setTerm] = useState("");
    const [adding, setAdding] = useState(false);

    const issues = new Map<string, PageIssue[]>(
        (health ?? []).map((h) => [h.pageId, h.issues]),
    );
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
    const needs = (p: SitePage) => (issues.get(p.id)?.length ?? 0) > 0;
    const needle = term.trim().toLowerCase();
    const shown = sorted.filter(
        (p) =>
            (filter === "all" || (filter === "menu" ? inMenu(p) : needs(p))) &&
            (needle === "" ||
                p.title.toLowerCase().includes(needle) ||
                p.path.toLowerCase().includes(needle)),
    );

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

    const tabs = [
        { value: "all" as const, label: "All", count: pages.length },
        {
            value: "menu" as const,
            label: "In menu",
            count: pages.filter(inMenu).length,
        },
        ...(health
            ? [
                  {
                      value: "fix" as const,
                      label: "Needs fixing",
                      count: pages.filter(needs).length,
                  },
              ]
            : []),
    ];

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
                tabs={
                    <TabStrip
                        label="Pages"
                        tabs={tabs}
                        value={filter}
                        onValueChange={setFilter}
                    />
                }
                search={
                    <ListSearch
                        placeholder="Find a page"
                        defaultValue={term}
                        onSearch={setTerm}
                    />
                }
                onClear={needle ? () => setTerm("") : undefined}
                clearLabel="Clear search"
            />

            {shown.length === 0 ? (
                filter === "fix" && needle === "" ? (
                    <EmptyState
                        size="inline"
                        title={`All ${pages.length} pages look good`}
                        description="Each has text for Google, a share photo and working links."
                    />
                ) : (
                    <EmptyState
                        size="inline"
                        title="No page matches"
                        description="Try another word, or clear the search."
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
                            const fix = issues.get(page.id) ?? [];
                            const fixWords =
                                health === null
                                    ? null
                                    : fix.length > 0
                                      ? fix
                                            .map((i) => ISSUE_WORDS[i])
                                            .join(", ")
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
                                                fix.length > 0
                                                    ? fixWords
                                                    : null,
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
                                            fix.length > 0
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
