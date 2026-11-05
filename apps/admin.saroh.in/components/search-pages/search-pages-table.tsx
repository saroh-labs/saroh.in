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
import { OptionSelect } from "@saroh/ui/option-select";
import { ChevronDown, MoreHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";

import { EmptyPanel } from "@/components/states/empty-panel";
import { formatDate } from "@/lib/format";
import type {
    Filter,
    Grouping,
    ListQuery,
    PageAction,
    PageKind,
    PageRow,
    Sorting,
} from "@/lib/search-page-words";
import {
    badgeOf,
    cantPublishWords,
    countBy,
    eligible,
    FILTER_LABEL,
    groupRows,
    heldCount,
    heldWords,
    inFilter,
    listHref,
    matchesQuery,
    nextAction,
    readListQuery,
    rowActions,
    rowNote,
    searchRepeatsName,
    sortRows,
} from "@/lib/search-page-words";

import { SearchPageDialog } from "./search-page-dialog";

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

const GROUP_OPTIONS: { value: Grouping; label: string }[] = [
    { value: "section", label: "Group: Section" },
    { value: "status", label: "Group: Status" },
    { value: "none", label: "No groups" },
];

const SORT_OPTIONS: { value: Sorting; label: string }[] = [
    { value: "name", label: "Name A–Z" },
    { value: "changed", label: "Recently changed" },
];

/** The row's grid: with groups by section the section is the group's header, not a column. */
const columns = (withSection: boolean) =>
    cn(
        "md:grid md:items-center md:gap-3",
        withSection
            ? "md:grid-cols-[2.25rem_minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(10rem,1.1fr)_6.5rem_14rem]"
            : "md:grid-cols-[2.25rem_minmax(0,2fr)_minmax(0,1.6fr)_minmax(10rem,1.1fr)_6.5rem_14rem]",
    );

const plural = (n: number, one: string, many = `${one}s`) =>
    `${n} ${n === 1 ? one : many}`;

/** Folds kept in this browser; in memory too, so a blocked storage still folds for the visit. */
const foldMemory = new Map<string, string>();
const foldListeners = new Set<() => void>();
function subscribeFolds(onChange: () => void) {
    foldListeners.add(onChange);
    return () => {
        foldListeners.delete(onChange);
    };
}
function readFolds(key: string): string {
    const kept = foldMemory.get(key);
    if (kept !== undefined) return kept;
    try {
        const saved = window.localStorage.getItem(key);
        if (saved && Array.isArray(JSON.parse(saved))) return saved;
    } catch {
        // Blocked or not JSON: every group starts open.
    }
    return "[]";
}
function writeFolds(key: string, keys: string[]) {
    const raw = JSON.stringify(keys);
    foldMemory.set(key, raw);
    try {
        window.localStorage.setItem(key, raw);
    } catch {
        // Not kept past this visit.
    }
    for (const l of foldListeners) l();
}

interface Opened {
    action: PageAction;
    pages: PageRow[];
    skipped: number;
}

/**
 * Every search page of one kind (DEC-193): chips narrow it by status, a
 * section and the search by name, phrase or address, all kept in the
 * address. Rows are grouped by section (or status), A–Z by name, each
 * group folding and ticking as one. Someone who may publish gets a tick
 * per row, the bar for what's ticked, each row's next step beside its ⋯
 * (on hover or focus at the desk), and the ⋯ actions; each opens one
 * confirm. Anyone else reads.
 */
export function SearchPagesTable({
    kind = "for",
    rows,
    allRows = rows,
    site,
    reviewSite,
    reviewUrl,
    canPublish,
}: {
    /** Which kind the rows are (`?kind=`): its tab is drawn by the page. */
    kind?: PageKind;
    rows: PageRow[];
    /** Every kind's rows: what a page links to may be another kind (U12). */
    allRows?: PageRow[];
    site: string;
    reviewSite: string;
    reviewUrl: string;
    canPublish: boolean;
}) {
    const params = useSearchParams();
    const [query, setQuery] = useState<ListQuery>(() =>
        readListQuery((k) => params.get(k)),
    );
    const [searchKey, setSearchKey] = useState(0);
    const [ticked, setTicked] = useState<Set<string>>(new Set());
    // Folded groups are this person's own, per kind (server HTML: all open).
    const foldKey = `saroh:search-pages:folded:${kind}`;
    const foldRaw = useSyncExternalStore(
        subscribeFolds,
        () => readFolds(foldKey),
        () => "[]",
    );
    const folded = useMemo(
        () => new Set(JSON.parse(foldRaw) as string[]),
        [foldRaw],
    );
    const setFolded = (next: Set<string>) => writeFolds(foldKey, [...next]);
    const [opened, setOpened] = useState<Opened | null>(null);
    const { status: filter, section } = query;

    // The address follows the filters (replace: Back leaves the list, not a filter).
    const set = (change: Partial<ListQuery>) => {
        const next = { ...query, ...change };
        setQuery(next);
        window.history.replaceState(null, "", listHref(kind, next));
    };

    const sections = [...new Set(rows.map((r) => r.family))].sort((a, b) =>
        a.localeCompare(b, "en"),
    );
    const inSection = rows.filter((r) => !section || r.family === section);
    const counts = countBy(inSection);
    const shown = sortRows(
        inSection.filter(
            (r) => inFilter(r, filter) && matchesQuery(r, query.q),
        ),
        query.sort,
    );
    const groups = groupRows(shown, query.group);
    const withSection = query.group !== "section";
    const COLUMNS = columns(withSection);
    const picked = rows.filter((r) => ticked.has(r.path));
    const allOn = shown.length > 0 && shown.every((r) => ticked.has(r.path));
    const narrowed = filter !== "all" || !!query.q || !!section;

    const pick = (next: Filter) => {
        set({ status: next });
        setTicked(new Set());
    };
    const clear = () => {
        set({ status: "all", q: "", section: "" });
        setSearchKey((n) => n + 1);
    };
    const open = (action: PageAction, from: PageRow[]) => {
        const pages = eligible(action, from);
        if (pages.length === 0) return;
        setOpened({ action, pages, skipped: from.length - pages.length });
    };
    const tick = (paths: string[], on: boolean) =>
        setTicked((was) => {
            const next = new Set(was);
            for (const p of paths) {
                if (on) next.add(p);
                else next.delete(p);
            }
            return next;
        });
    const fold = (key: string) => {
        const next = new Set(folded);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setFolded(next);
    };
    const named = groups.filter((g) => g.label !== null);

    return (
        <div className="grid gap-4">
            <ListToolbar
                search={
                    <ListSearch
                        key={searchKey}
                        placeholder="Find a page, address or search phrase"
                        describe="By the page's name, its address or the search it answers"
                        defaultValue={query.q}
                        onSearch={(q) => set({ q })}
                    />
                }
                filters={
                    <>
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
                                    // None of these: still there, quieter.
                                    className={cn(
                                        counts[f] === 0 &&
                                            filter !== f &&
                                            "border-dashed text-muted-foreground",
                                    )}
                                >
                                    {FILTER_LABEL[f]}
                                    <span className="tabular-nums opacity-70">
                                        {counts[f]}
                                    </span>
                                </Chip>
                            ))}
                        </div>
                        {sections.length > 1 && (
                            <OptionSelect
                                size="sm"
                                aria-label="Section"
                                className="w-auto min-w-44"
                                value={section}
                                onValueChange={(v) => {
                                    set({ section: v });
                                    setTicked(new Set());
                                }}
                                options={[
                                    {
                                        value: "",
                                        label: "All sections",
                                        count: rows.length,
                                    },
                                    ...sections.map((s) => ({
                                        value: s,
                                        label: s,
                                        count: rows.filter(
                                            (r) => r.family === s,
                                        ).length,
                                    })),
                                ]}
                            />
                        )}
                    </>
                }
                onClear={narrowed ? clear : undefined}
                clearLabel={
                    filter === "all" && !section
                        ? "Clear search"
                        : "Clear filters"
                }
                end={
                    <div className="flex flex-wrap items-center gap-2">
                        {named.length > 1 && (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                    setFolded(
                                        folded.size > 0
                                            ? new Set()
                                            : new Set(named.map((g) => g.key)),
                                    )
                                }
                            >
                                {folded.size > 0
                                    ? "Expand all"
                                    : "Collapse all"}
                            </Button>
                        )}
                        <OptionSelect
                            size="sm"
                            aria-label="Group"
                            className="w-auto"
                            value={query.group}
                            onValueChange={(group) => set({ group })}
                            options={GROUP_OPTIONS}
                        />
                        <OptionSelect
                            size="sm"
                            aria-label="Sort"
                            className="w-auto"
                            value={query.sort}
                            onValueChange={(sort) => set({ sort })}
                            options={SORT_OPTIONS}
                        />
                    </div>
                }
            />

            {shown.length === 0 ? (
                !narrowed ? (
                    <EmptyPanel
                        title="No pages here"
                        description="Archived pages show under Archived, and you can restore them."
                    />
                ) : (
                    <EmptyPanel
                        kind="no-results"
                        things="pages"
                        cause={
                            query.q && filter === "all" && !section
                                ? "search"
                                : "filters"
                        }
                        query={query.q}
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
                                        tick(
                                            shown.map((r) => r.path),
                                            !allOn,
                                        )
                                    }
                                    aria-label="Select every page shown"
                                />
                            )}
                        </span>
                        <span>Page</span>
                        <span>Search it answers</span>
                        {withSection && (
                            <span>{kind === "for" ? "Family" : "Section"}</span>
                        )}
                        <span>Status</span>
                        <span>Changed</span>
                        <span className="sr-only">Actions</span>
                    </ListTableHead>
                    <ul aria-label="Pages">
                        {groups.map((g) => {
                            const isFolded = folded.has(g.key);
                            const paths = g.rows.map((r) => r.path);
                            const on = paths.filter((p) =>
                                ticked.has(p),
                            ).length;
                            const live = g.rows.filter((r) => r.onSite).length;
                            return [
                                g.label !== null && (
                                    <li
                                        key={`group:${g.key}`}
                                        className="flex items-center gap-3 border-b border-border bg-muted/50 px-[14px] py-2"
                                    >
                                        <span className="flex w-[2.25rem] shrink-0">
                                            {canPublish && (
                                                <Checkbox
                                                    checked={
                                                        on === paths.length
                                                            ? true
                                                            : on > 0
                                                              ? "indeterminate"
                                                              : false
                                                    }
                                                    onCheckedChange={() =>
                                                        tick(
                                                            paths,
                                                            on !== paths.length,
                                                        )
                                                    }
                                                    aria-label={`Select every page in ${g.label}`}
                                                />
                                            )}
                                        </span>
                                        <button
                                            type="button"
                                            aria-expanded={!isFolded}
                                            onClick={() => fold(g.key)}
                                            className="flex min-w-0 flex-1 items-baseline gap-2.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11 coarse:items-center"
                                        >
                                            <span className="font-semibold">
                                                {g.label}
                                            </span>
                                            <span className="text-[12.5px] text-muted-foreground">
                                                {plural(g.rows.length, "page")}{" "}
                                                ·{" "}
                                                {live
                                                    ? `${live} live`
                                                    : "none live"}
                                                {on > 0 && ` · ${on} ticked`}
                                            </span>
                                            <ChevronDown
                                                aria-hidden
                                                className={cn(
                                                    "ml-auto size-4 self-center text-muted-foreground transition-transform duration-fast",
                                                    isFolded && "-rotate-90",
                                                )}
                                            />
                                        </button>
                                    </li>
                                ),
                                ...(isFolded ? [] : g.rows).map((row) => (
                                    <PageRowItem
                                        key={row.path}
                                        row={row}
                                        columns={COLUMNS}
                                        withSection={withSection}
                                        ticked={ticked.has(row.path)}
                                        onTick={() =>
                                            tick(
                                                [row.path],
                                                !ticked.has(row.path),
                                            )
                                        }
                                        site={site}
                                        reviewSite={reviewSite}
                                        reviewUrl={reviewUrl}
                                        canPublish={canPublish}
                                        onAction={(action) =>
                                            open(action, [row])
                                        }
                                    />
                                )),
                            ];
                        })}
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

/** One page's row: name over address, the phrase, status, change date, its next step and ⋯. */
function PageRowItem({
    row,
    columns,
    withSection,
    ticked,
    onTick,
    site,
    reviewSite,
    reviewUrl,
    canPublish,
    onAction,
}: {
    row: PageRow;
    columns: string;
    withSection: boolean;
    ticked: boolean;
    onTick: () => void;
    site: string;
    reviewSite: string;
    reviewUrl: string;
    canPublish: boolean;
    onAction: (action: PageAction) => void;
}) {
    const badge = badgeOf(row);
    const note = rowNote(row);
    const next = canPublish ? nextAction(row) : null;
    // Read it, then its next step: the job before Publish is reading the page.
    const quick = (
        <>
            <a
                href={`${reviewUrl}${row.path}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Read ${row.name} on ${reviewSite}`}
                className="inline-flex h-8 items-center whitespace-nowrap rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11"
            >
                Read ↗
            </a>
            {next && (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`${next.label}: ${row.name}`}
                    onClick={() => onAction(next.action)}
                >
                    {next.label}
                </Button>
            )}
        </>
    );
    return (
        <li
            className={cn(
                listTable.row,
                "group grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5",
                columns,
                ticked && "bg-muted",
            )}
        >
            <div className="row-span-3 pt-0.5 md:row-span-1 md:pt-0">
                {canPublish && (
                    <Checkbox
                        checked={ticked}
                        onCheckedChange={onTick}
                        aria-label={`Select ${row.name}`}
                    />
                )}
            </div>
            <div className="grid min-w-0">
                <span className="flex min-w-0 items-baseline gap-2">
                    <Link
                        href={`/search-pages/${row.slug}`}
                        className="truncate font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {row.name}
                    </Link>
                    {row.inApp && (
                        <span
                            title="Built into saroh.in: its words change with app releases"
                            className="shrink-0 rounded-full border px-1.5 text-[11px] text-muted-foreground"
                        >
                            In the app
                        </span>
                    )}
                </span>
                <code className="truncate font-mono text-[12px] text-muted-foreground">
                    {row.path}
                </code>
            </div>
            <span
                className={cn(
                    "col-start-2 truncate text-[13px] md:col-start-auto md:text-sm",
                    // Bright only when the phrase says more than the name.
                    searchRepeatsName(row)
                        ? "text-muted-foreground"
                        : "md:text-foreground",
                )}
            >
                “{row.search}”
            </span>
            {withSection && (
                <span className="col-start-2 hidden text-sm text-muted-foreground md:col-start-auto md:block">
                    {row.family}
                </span>
            )}
            <span className="col-start-2 grid justify-items-start gap-0.5 md:col-start-auto">
                <Badge variant={badge.variant}>{badge.label}</Badge>
                {note && (
                    <span className="text-[12px] text-muted-foreground">
                        {note}
                    </span>
                )}
            </span>
            <span className="col-start-2 hidden whitespace-nowrap text-[13px] text-muted-foreground md:col-start-auto md:block">
                {formatDate(row.updated)}
            </span>
            <div className="col-start-3 row-start-1 flex items-center justify-end gap-1 md:col-start-auto md:row-start-auto">
                {/* At the desk on hover or focus; a thumb sees them on the card below. */}
                <span className="hidden items-center gap-1 transition-opacity duration-fast coarse:opacity-100 md:flex md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                    {quick}
                </span>
                <RowMenu
                    row={row}
                    site={site}
                    reviewSite={reviewSite}
                    reviewUrl={reviewUrl}
                    canPublish={canPublish}
                    onAction={onAction}
                />
            </div>
            <div className="col-start-2 flex flex-wrap items-center gap-1 md:hidden">
                {quick}
            </div>
        </li>
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
