"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { Chip } from "@saroh/ui/chip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { ListTable, listTable, ListTableHead } from "@saroh/ui/list-table";
import { ListToolbar } from "@saroh/ui/list-toolbar";
import { Segmented } from "@saroh/ui/segmented";
import { MoreHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyPanel } from "@/components/states/empty-panel";
import { formatDate } from "@/lib/format";
import type {
    Filter,
    PageAction,
    PageKind,
    PageRow,
} from "@/lib/search-page-words";
import {
    badgeOf,
    cantPublishWords,
    countBy,
    eligible,
    FILTER_LABEL,
    heldCount,
    heldWords,
    inFilter,
    KINDS,
    matchesQuery,
    rowActions,
    statCards,
    stateNote,
} from "@/lib/search-page-words";

import { SearchPageDialog } from "./search-page-dialog";

const COLUMNS =
    "md:grid md:grid-cols-[2.25rem_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_10rem_11rem_2.5rem] md:items-center md:gap-3";

const FILTERS: Filter[] = [
    "all",
    "live",
    "waiting",
    "draft",
    "unpublished",
    "archived",
];

const BULK_LABEL = {
    publish: "Publish",
    unpublish: "Unpublish",
    archive: "Archive",
} as const;

interface Opened {
    action: PageAction;
    pages: PageRow[];
    skipped: number;
}

/**
 * Every search page (DEC-193): the stat cards and chips narrow it by
 * status, the search by name or search phrase. Someone who may publish
 * gets a tick per row, the bar for what's ticked, and each row's ⋯
 * actions; each opens one confirm. Anyone else reads.
 */
export function SearchPagesTable({
    kind = "for",
    kindCounts,
    rows,
    allRows = rows,
    site,
    reviewSite,
    reviewUrl,
    canPublish,
}: {
    /** Which kind the rows are (`?kind=`): trade pages or free tools. */
    kind?: PageKind;
    /** How many pages of each kind, for the Kind choice; none hides it. */
    kindCounts?: Partial<Record<PageKind, number>>;
    rows: PageRow[];
    /** Every kind's rows: what a page links to may be another kind (U12). */
    allRows?: PageRow[];
    site: string;
    reviewSite: string;
    reviewUrl: string;
    canPublish: boolean;
}) {
    const [filter, setFilter] = useState<Filter>("all");
    const [query, setQuery] = useState("");
    const [searchKey, setSearchKey] = useState(0);
    const [ticked, setTicked] = useState<Set<string>>(new Set());
    const [opened, setOpened] = useState<Opened | null>(null);

    const counts = countBy(rows);
    const shown = rows.filter(
        (r) => inFilter(r, filter) && matchesQuery(r, query),
    );
    const picked = rows.filter((r) => ticked.has(r.path));
    const allOn = shown.length > 0 && shown.every((r) => ticked.has(r.path));
    const pick = (next: Filter) => {
        setFilter(next);
        setTicked(new Set());
    };
    const clear = () => {
        setFilter("all");
        setQuery("");
        setSearchKey((n) => n + 1);
    };
    const open = (action: PageAction, from: PageRow[]) => {
        const pages = eligible(action, from);
        if (pages.length === 0) return;
        setOpened({ action, pages, skipped: from.length - pages.length });
    };
    const toggle = (path: string) =>
        setTicked((was) => {
            const next = new Set(was);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });

    return (
        <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {statCards(site).map((card) => (
                    <button
                        key={card.filter}
                        type="button"
                        aria-pressed={filter === card.filter}
                        onClick={() => pick(card.filter)}
                        className={cn(
                            // Half height on a phone, so the list starts sooner (F8).
                            "grid content-start gap-0.5 rounded-[11px] border bg-card px-3 py-2 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-1 sm:px-4 sm:py-3.5",
                            filter === card.filter && "border-foreground",
                        )}
                    >
                        <span className="label">{card.label}</span>
                        <span className="font-display text-xl font-semibold tabular-nums leading-none sm:text-[25px]">
                            {counts[card.filter]}
                        </span>
                        <span className="text-[11.5px] text-muted-foreground">
                            {card.hint}
                        </span>
                    </button>
                ))}
            </div>

            <ListToolbar
                search={
                    <ListSearch
                        key={searchKey}
                        placeholder="Find a page or search phrase"
                        describe="By the page's name or the search it answers"
                        defaultValue={query}
                        onSearch={setQuery}
                    />
                }
                filters={
                    <div
                        role="group"
                        aria-label="Show"
                        className="flex flex-wrap items-center gap-2"
                    >
                        {FILTERS.map((f) => (
                            <Chip
                                key={f}
                                as="toggle"
                                on={filter === f}
                                onClick={() => pick(f)}
                            >
                                {FILTER_LABEL[f]}
                                <span className="tabular-nums opacity-70">
                                    {counts[f]}
                                </span>
                            </Chip>
                        ))}
                        {kindCounts && (
                            <span className="md:ml-auto">
                                <Segmented<PageKind>
                                    label="Kind"
                                    size="sm"
                                    value={kind}
                                    options={KINDS.map((k) => ({
                                        value: k.kind,
                                        label: `${k.label} · ${k.path} · ${kindCounts[k.kind] ?? 0}`,
                                        href:
                                            k.kind === "for"
                                                ? "/search-pages"
                                                : `/search-pages?kind=${k.kind}`,
                                    }))}
                                />
                            </span>
                        )}
                    </div>
                }
                onClear={filter !== "all" || query ? clear : undefined}
                clearLabel={filter === "all" ? "Clear search" : "Clear filters"}
            />

            {shown.length === 0 ? (
                filter === "all" && !query ? (
                    <EmptyPanel
                        title="No pages here"
                        description="Archived pages show under Archived, and you can restore them."
                    />
                ) : (
                    <EmptyPanel
                        kind="no-results"
                        things="pages"
                        cause={query && filter === "all" ? "search" : "filters"}
                        query={query}
                        onClear={clear}
                    />
                )
            ) : (
                <ListTable>
                    {/* Not hidden from a screen reader: it holds the select-all tick. */}
                    <ListTableHead
                        role="presentation"
                        className={cn("hidden", COLUMNS)}
                    >
                        <span>
                            {canPublish && (
                                <Checkbox
                                    checked={allOn}
                                    onCheckedChange={() =>
                                        setTicked(
                                            allOn
                                                ? new Set()
                                                : new Set(
                                                      shown.map((r) => r.path),
                                                  ),
                                        )
                                    }
                                    aria-label="Select every page shown"
                                />
                            )}
                        </span>
                        <span>Page</span>
                        <span>Target search</span>
                        <span>{kind === "for" ? "Family" : "Section"}</span>
                        <span>Status</span>
                        <span>Content changed</span>
                        <span className="sr-only">Actions</span>
                    </ListTableHead>
                    <ul aria-label="Pages">
                        {shown.map((row) => (
                            <li
                                key={row.path}
                                className={cn(
                                    listTable.row,
                                    "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5",
                                    COLUMNS,
                                    ticked.has(row.path) && "bg-muted",
                                )}
                            >
                                <div className="row-span-2 pt-0.5 md:row-span-1 md:pt-0">
                                    {canPublish && (
                                        <Checkbox
                                            checked={ticked.has(row.path)}
                                            onCheckedChange={() =>
                                                toggle(row.path)
                                            }
                                            aria-label={`Select ${row.name}`}
                                        />
                                    )}
                                </div>
                                <Link
                                    href={`/search-pages/${row.slug}`}
                                    className="grid min-w-0 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="font-medium">
                                        {row.name}
                                    </span>
                                    <code className="font-mono text-[12px] text-muted-foreground">
                                        {row.path}
                                    </code>
                                </Link>
                                <span className="col-start-2 text-[13px] text-muted-foreground md:col-start-auto md:text-sm md:text-foreground">
                                    “{row.search}”
                                </span>
                                <span className="col-start-2 text-[13px] text-muted-foreground md:col-start-auto md:text-sm">
                                    {row.family}
                                </span>
                                <span className="col-start-2 grid justify-items-start gap-0.5 md:col-start-auto">
                                    <Badge variant={badgeOf(row).variant}>
                                        {badgeOf(row).label}
                                    </Badge>
                                    <span className="text-[12px] text-muted-foreground">
                                        {stateNote(row)}
                                    </span>
                                </span>
                                <span className="col-start-2 text-[13px] text-muted-foreground md:col-start-auto">
                                    {formatDate(row.updated)}
                                    {row.onSite && " · goes out with releases"}
                                </span>
                                <div className="col-start-3 row-start-1 justify-self-end md:col-start-auto md:row-start-auto">
                                    <RowMenu
                                        row={row}
                                        site={site}
                                        reviewSite={reviewSite}
                                        reviewUrl={reviewUrl}
                                        canPublish={canPublish}
                                        onAction={(action) =>
                                            open(action, [row])
                                        }
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                </ListTable>
            )}

            {canPublish && picked.length > 0 && (
                <>
                    {/* Room under the list, so the bar never sits on the rows it acts on (F5). */}
                    <div aria-hidden className="h-28" />
                    <div
                        role="region"
                        aria-label="Selected pages"
                        className="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border bg-popover p-2 pl-4 shadow-lg"
                    >
                        <strong className="mr-2 font-semibold">
                            {picked.length} selected
                        </strong>
                        {(["publish", "unpublish", "archive"] as const).map(
                            (action) => {
                                const n = eligible(action, picked).length;
                                return (
                                    <Button
                                        key={action}
                                        type="button"
                                        size="sm"
                                        variant={
                                            action === "publish"
                                                ? "default"
                                                : "outline"
                                        }
                                        disabled={n === 0}
                                        aria-describedby={
                                            action === "publish" &&
                                            heldWords(picked)
                                                ? "publish-held-bulk"
                                                : undefined
                                        }
                                        onClick={() => open(action, picked)}
                                    >
                                        {BULK_LABEL[action]}
                                        {/* A disabled button's count would read 0: its reason speaks instead. */}
                                        {n > 0 && ` ${n}`}
                                    </Button>
                                );
                            },
                        )}
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Clear selection"
                            onClick={() => setTicked(new Set())}
                        >
                            <X className="size-4" aria-hidden />
                        </Button>
                        {heldWords(picked) && (
                            <details
                                id="publish-held-bulk"
                                className="basis-full text-[12.5px] text-muted-foreground"
                            >
                                <summary className="cursor-pointer">
                                    {heldCount(picked)} held by checks · Show
                                    why
                                </summary>
                                <p className="mt-1 max-w-prose">
                                    {heldWords(picked)}
                                </p>
                            </details>
                        )}
                    </div>
                </>
            )}

            {opened && (
                <SearchPageDialog
                    action={opened.action}
                    pages={opened.pages}
                    rows={allRows}
                    skipped={opened.skipped}
                    site={site}
                    reviewSite={reviewSite}
                    reviewUrl={reviewUrl}
                    onOpenChange={(next) => {
                        if (!next) setOpened(null);
                    }}
                    onDone={() => setTicked(new Set())}
                />
            )}
        </div>
    );
}

function RowMenu({
    row,
    site,
    reviewSite,
    reviewUrl,
    canPublish,
    onAction,
}: {
    row: PageRow;
    site: string;
    reviewSite: string;
    reviewUrl: string;
    canPublish: boolean;
    onAction: (action: PageAction) => void;
}) {
    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Actions for ${row.name}`}
                >
                    <MoreHorizontal className="size-4" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                // The dialog takes the focus; handing it back to ⋯ would pull it out.
                onCloseAutoFocus={(event) => event.preventDefault()}
            >
                <DropdownMenuItem asChild>
                    <Link href={`/search-pages/${row.slug}`}>Open details</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <a
                        href={`${reviewUrl}${row.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Read it on {reviewSite} ↗
                    </a>
                </DropdownMenuItem>
                {canPublish && (
                    <>
                        <DropdownMenuSeparator />
                        {rowActions(row.state, site, row.pending).map(
                            (item) => {
                                // A disabled item can't be hovered on a phone: the reason is part of it.
                                const why =
                                    item.action === "publish"
                                        ? cantPublishWords(row)
                                        : null;
                                return (
                                    <DropdownMenuItem
                                        key={item.label}
                                        disabled={!item.action || !!why}
                                        className={cn(
                                            item.danger && "text-destructive",
                                            why &&
                                                "flex-col items-start gap-0.5",
                                        )}
                                        onSelect={() => {
                                            if (item.action)
                                                onAction(item.action);
                                        }}
                                    >
                                        {item.label}
                                        {why && (
                                            <span className="max-w-64 text-xs leading-snug">
                                                {why}
                                            </span>
                                        )}
                                    </DropdownMenuItem>
                                );
                            },
                        )}
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
