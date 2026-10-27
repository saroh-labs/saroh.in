import type { SearchPageEntry } from "@saroh/search-pages";

import { formatDate, formatDateTime } from "./format";

/**
 * Search pages in the console (DEC-193), in words. Client-safe: the list,
 * the page's header and its tabs all read these. The API keeps one record
 * per page path; the pages themselves are the package's manifest, so a
 * page with no record has never been published and reads as a draft.
 */

export type PageStatus = "LIVE" | "UNPUBLISHED" | "ARCHIVED" | "DRAFT";
export type PageAction = "publish" | "unpublish" | "archive" | "restore";

/** One row of `GET /admin/search-pages`. */
export interface SearchPageRecord {
    path: string;
    status: PageStatus;
    liveSince: string | null;
    changedAt: string;
    changedBy: { name: string | null } | null;
}

export interface Rebuild {
    running: boolean;
    startedAt?: string;
    url?: string;
}

export interface SearchPagesRead {
    pages: SearchPageRecord[];
    rebuild: Rebuild;
}

export interface SearchPageEvent {
    action: string;
    fromStatus: PageStatus;
    toStatus: PageStatus;
    by: { name: string | null } | null;
    at: string;
}

/** What the screen shows: the saved status, or that it changes in the rebuild under way. */
export type RowState =
    | "live"
    | "draft"
    | "publishing"
    | "unpublishing"
    | "unpublished"
    | "archived";

export type PageKind = "for" | "tools";

export interface PageRow {
    path: string;
    slug: string;
    kind: PageKind;
    name: string;
    /** A /for/ page's family, or a tool's section on the /tools hub. */
    family: string;
    /** A tool with its own page in saroh.in (no preview here). */
    inApp: boolean;
    search: string;
    updated: string;
    state: RowState;
    record: SearchPageRecord | null;
}

export const STATE_LABEL: Record<RowState, string> = {
    live: "Live",
    draft: "Draft",
    publishing: "Publishing…",
    unpublishing: "Coming off…",
    unpublished: "Unpublished",
    archived: "Archived",
};

export const STATE_BADGE: Record<
    RowState,
    "success" | "draft" | "warning" | "outline" | "neutral"
> = {
    live: "success",
    draft: "draft",
    publishing: "warning",
    unpublishing: "warning",
    unpublished: "outline",
    archived: "neutral",
};

/**
 * A change counts as part of the rebuild under way when it was saved no
 * more than this long before the rebuild started: the deploy is queued in
 * the same save and GitHub starts it a little after, and the build reads
 * which pages are live once it runs.
 * shortcut: a time window, not the deploy's own list of paths; upgrade if
 * the API ever says which paths a run carries.
 */
const IN_REBUILD_MS = 5 * 60_000;

function inRebuild(record: SearchPageRecord, rebuild: Rebuild): boolean {
    if (!rebuild.running || !rebuild.startedAt) return false;
    return (
        new Date(record.changedAt).getTime() >=
        new Date(rebuild.startedAt).getTime() - IN_REBUILD_MS
    );
}

export function stateOf(
    record: SearchPageRecord | null,
    rebuild: Rebuild,
): RowState {
    if (!record) return "draft";
    switch (record.status) {
        case "LIVE":
            return inRebuild(record, rebuild) ? "publishing" : "live";
        case "UNPUBLISHED":
            return inRebuild(record, rebuild) ? "unpublishing" : "unpublished";
        case "ARCHIVED":
            return "archived";
        case "DRAFT":
            return "draft";
    }
}

/** The manifest, each page with its record (or none): the manifest's order, records for pages no longer in the code left out. */
export function mergePages(
    manifest: readonly SearchPageEntry[],
    read: SearchPagesRead,
): PageRow[] {
    const byPath = new Map(read.pages.map((r) => [r.path, r]));
    return manifest.map((entry) => {
        const record = byPath.get(entry.path) ?? null;
        return {
            path: entry.path,
            slug: entry.slug,
            kind: entry.kind,
            name: entry.name,
            family: entry.kind === "for" ? entry.family : entry.group,
            inApp: entry.kind === "tools" && entry.inApp,
            search: entry.search,
            updated: entry.updated,
            record,
            state: stateOf(record, read.rebuild),
        };
    });
}

/** The line under a status: since when, or what the rebuild does to it. */
export function stateNote(row: PageRow): string {
    const r = row.record;
    switch (row.state) {
        case "publishing":
            return "Going live in this rebuild";
        case "unpublishing":
            return "Coming off in this rebuild";
        case "live":
            return `Live since ${formatDate(r?.liveSince ?? r?.changedAt)}`;
        case "unpublished":
            return `Taken off ${formatDate(r?.changedAt)}`;
        case "archived":
            return `Archived ${formatDate(r?.changedAt)}`;
        case "draft":
            return r
                ? `Restored ${formatDate(r.changedAt)}`
                : "Never published";
    }
}

export const isLive = (state: RowState) =>
    state === "live" || state === "unpublishing";

export type Filter = "all" | "live" | "draft" | "unpublished" | "archived";

export function inFilter(state: RowState, filter: Filter): boolean {
    switch (filter) {
        case "all":
            return state !== "archived";
        case "live":
            return isLive(state);
        case "draft":
            return state === "draft" || state === "publishing";
        case "unpublished":
            return state === "unpublished";
        case "archived":
            return state === "archived";
    }
}

export const FILTER_LABEL: Record<Filter, string> = {
    all: "All",
    live: "Live",
    draft: "Not live yet",
    unpublished: "Unpublished",
    archived: "Archived",
};

export function countBy(rows: readonly PageRow[]): Record<Filter, number> {
    const n = (f: Filter) => rows.filter((r) => inFilter(r.state, f)).length;
    return {
        all: n("all"),
        live: n("live"),
        draft: n("draft"),
        unpublished: n("unpublished"),
        archived: n("archived"),
    };
}

/** The stat cards over the list: the same filters as the chips, with a hint each. */
export function statCards(site: string): {
    filter: Exclude<Filter, "all">;
    label: string;
    hint: string;
}[] {
    return [
        { filter: "live", label: `Live on ${site}`, hint: "In the sitemap" },
        {
            filter: "draft",
            label: "Not live yet",
            hint: "Readable on the development site",
        },
        {
            filter: "unpublished",
            label: "Unpublished",
            hint: "Were live, taken off",
        },
        {
            filter: "archived",
            label: "Archived",
            hint: "Hidden, kept in the code",
        },
    ];
}

/** A search over the name, the search phrase and the address. */
export function matchesQuery(row: PageRow, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.name, row.search, row.path].some((s) =>
        s.toLowerCase().includes(q),
    );
}

/** Which pages an action can be done to, from where each is now (the API's rules). */
export function canDo(action: PageAction, state: RowState): boolean {
    switch (action) {
        case "publish":
            return state === "draft" || state === "unpublished";
        case "unpublish":
            return state === "live";
        case "archive":
            return state !== "archived" && !inFlight(state);
        case "restore":
            return state === "archived";
    }
}

/** A page the rebuild under way is putting on or taking off: wait for it. */
export const inFlight = (state: RowState) =>
    state === "publishing" || state === "unpublishing";

export function eligible<T extends { state: RowState }>(
    action: PageAction,
    rows: readonly T[],
): T[] {
    return rows.filter((r) => canDo(action, r.state));
}

/** A row's ⋯ menu, past Open details and Read it: what can be done to it. */
export function rowActions(
    state: RowState,
    site: string,
): { action: PageAction | null; label: string; danger?: boolean }[] {
    if (inFlight(state))
        return [{ action: null, label: "Wait for the rebuild" }];
    if (state === "archived") return [{ action: "restore", label: "Restore" }];
    if (state === "live")
        return [
            { action: "unpublish", label: "Unpublish" },
            { action: "archive", label: "Archive", danger: true },
        ];
    return [
        { action: "publish", label: `Publish on ${site}` },
        { action: "archive", label: "Archive", danger: true },
    ];
}

/**
 * Where a page's old link goes once it's taken off (DEC-193): its family's
 * page, or Home when the family has none or the page is that family page.
 * The site redirects to Home too while the family page isn't live.
 */
const FAMILY_PAGE: Record<string, string> = {
    Beauty: "salons",
    Health: "clinics",
    "Fitness and classes": "gyms",
    "Shops and food": "shops",
};

export function familyPage(family: string, slug: string): string | null {
    const page = FAMILY_PAGE[family];
    return page && page !== slug ? `/for/${page}` : null;
}

export interface DialogPage {
    name: string;
    slug: string;
    family: string;
    state: RowState;
    /** Free tools (#1253) go to the /tools list, and back to it when taken off. */
    kind?: PageKind;
}

/** The kinds the list chooses between (`?kind=`), with their words. */
export const KINDS: { kind: PageKind; label: string; path: string }[] = [
    { kind: "for", label: "Trade pages", path: "/for/" },
    { kind: "tools", label: "Free tools", path: "/tools/" },
];

export const kindOf = (asked: string | undefined): PageKind =>
    asked === "tools" ? "tools" : "for";

/** Where a page of this kind is listed on the site. */
const LIST_WORDS: Record<PageKind, string> = {
    for: "the /for/ list and the footer",
    tools: "the /tools list, the Tools menu and the footer",
};

export interface DialogWords {
    title: string;
    confirm: string;
    points: string[];
    /** Publishing asks "I've read … on <review site>" first. */
    tick: string | null;
    destructive: boolean;
}

/**
 * What a confirm says before an action, for one page or several. `checks`
 * is how many checks on the page didn't pass (one page only).
 */
export function dialogWords(
    action: PageAction,
    pages: readonly DialogPage[],
    site: string,
    reviewSite: string,
    checks = 0,
): DialogWords {
    const n = pages.length;
    const one = n === 1;
    const first = pages[0] as DialogPage | undefined;
    const what = one && first ? first.name : `${n} pages`;
    const these = one ? "this page" : "these pages";
    const count = one ? "page" : `${n} pages`;
    const tools = pages.length > 0 && pages.every((p) => p.kind === "tools");
    const listed = LIST_WORDS[tools ? "tools" : "for"];
    switch (action) {
        case "publish":
            return {
                title: `Publish ${what} on ${site}?`,
                confirm: `Publish ${count}`,
                points: [
                    `${site} rebuilds with ${these}. It takes a few minutes.`,
                    `${one ? "It goes" : "They go"} into the sitemap, ${listed}, so Google can find ${one ? "it" : "them"}.`,
                    checks > 0
                        ? `${checks === 1 ? "One check needs" : `${checks} checks need`} you: see "Checked before you publish".`
                        : "Later changes to the words go out with each release. You don't publish again.",
                ],
                tick: `I've read ${these} on ${reviewSite}`,
                destructive: false,
            };
        case "unpublish": {
            const to =
                one && first && !tools
                    ? familyPage(first.family, first.slug)
                    : null;
            return {
                title: `Take ${what} off ${site}?`,
                confirm: `Unpublish ${count}`,
                points: [
                    `${site} rebuilds without ${one ? "it" : "them"}, and ${one ? "it leaves" : "they leave"} the sitemap and ${tools ? "the /tools list" : "the /for/ list"}.`,
                    tools
                        ? `Anyone opening ${one ? "the old link" : "an old link"} is sent to /tools (or Home while no tool is live), not an error.`
                        : one
                          ? `Anyone opening the old link is sent to ${to ? `${to} (or Home while that isn't live)` : "Home"}, not an error.`
                          : "Anyone opening an old link is sent to its family page (Beauty, Health…), not an error.",
                    `Google drops ${one ? "it" : "them"} over the next few weeks. You can publish ${one ? "it" : "them"} again any time.`,
                ],
                tick: null,
                destructive: false,
            };
        }
        case "archive": {
            const live = pages.filter((p) => isLive(p.state)).length;
            return {
                title: `Archive ${what}?`,
                confirm: `Archive ${count}`,
                points: [
                    live > 0
                        ? one
                            ? `It's live now. ${site} rebuilds and takes it off first.`
                            : `${live} ${live === 1 ? "is" : "are"} live now. ${site} rebuilds and takes ${live === 1 ? "it" : "them"} off first.`
                        : `Nothing changes on ${site}. ${one ? "It isn't" : "They aren't"} live.`,
                    `${one ? "It leaves" : "Archived pages leave"} this list and can't be published until you restore ${one ? "it" : "them"}.`,
                    "The words stay in the code; nothing is deleted.",
                ],
                tick: null,
                destructive: true,
            };
        }
        case "restore":
            return {
                title: `Restore ${what}?`,
                confirm: "Restore",
                points: [
                    `${one ? "It comes" : "They come"} back to the list as a draft.`,
                    `Nothing changes on ${site} until you publish ${one ? "it" : "them"}.`,
                ],
                tick: null,
                destructive: false,
            };
    }
}

const PAST: Record<PageAction, string> = {
    publish: "published",
    unpublish: "unpublished",
    archive: "archived",
    restore: "restored",
};

/**
 * A 409: the API refused because a page isn't where the screen showed it.
 * Names the pages, never the codes.
 */
export function refusalWords(
    action: PageAction,
    paths: readonly string[],
    rows: readonly { path: string; name: string }[],
): string {
    const names = paths.map((p) => rows.find((r) => r.path === p)?.name ?? p);
    const one = names.length === 1;
    return `${names.join(", ")} can't be ${PAST[action]} from where ${one ? "it is" : "they are"} now. Someone may have just changed ${one ? "it" : "them"}. Nothing was changed: close this to see the list as it is.`;
}

/** The toast after an action worked. */
export function successWords(
    action: PageAction,
    n: number,
    rebuildQueued: boolean,
    site: string,
): { title: string; description?: string } {
    const pages = n === 1 ? "the page" : `${n} pages`;
    const rebuilding = rebuildQueued
        ? `${site} is rebuilding.`
        : `${site} can't rebuild from here (no deploy is set up), so it changes with the next deploy.`;
    switch (action) {
        case "publish":
            return { title: `Publishing ${pages}.`, description: rebuilding };
        case "unpublish":
            return { title: `Taking ${pages} off.`, description: rebuilding };
        case "archive":
            return {
                title: `Archived ${pages}.`,
                description: rebuildQueued ? rebuilding : undefined,
            };
        case "restore":
            return { title: `Restored ${pages} as a draft.` };
    }
}

/** The rebuild banner's middle sentence: how many go live or come off. */
export function rebuildWords(rows: readonly PageRow[]): string {
    const on = rows.filter((r) => r.state === "publishing").length;
    const off = rows.filter((r) => r.state === "unpublishing").length;
    const parts = [
        on ? `${on} ${on === 1 ? "page is" : "pages are"} going live` : "",
        off ? `${off} coming off` : "",
    ].filter(Boolean);
    return parts.length ? `${parts.join(", ")}.` : "";
}

/** "Where it shows on <site>": four places, each on or off. */
export function whereItShows(
    state: RowState,
    site: string,
    kind: PageKind = "for",
): { label: string; on: boolean; value: string }[] {
    const live = isLive(state);
    return [
        {
            label: "The page itself",
            on: live,
            value: live
                ? "Live"
                : state === "publishing"
                  ? "After this rebuild"
                  : `Not on ${site}`,
        },
        { label: "Sitemap", on: live, value: live ? "Listed" : "Not listed" },
        {
            label:
                kind === "tools"
                    ? "The /tools list, the menu and the footer"
                    : "The /for/ list and the footer",
            on: live,
            value: live ? "Linked" : "Not linked",
        },
        {
            label: "Search engines",
            on: live,
            value: live ? "Allowed to index" : "Can't find it",
        },
    ];
}

const STATUS_WORD: Record<PageStatus, string> = {
    LIVE: "live",
    UNPUBLISHED: "unpublished",
    ARCHIVED: "archived",
    DRAFT: "a draft",
};

/** One History row: when, what and who, and the change in words. */
export function historyWords(
    event: SearchPageEvent,
    site: string,
): { when: string; what: string; detail: string } {
    // The two app tools' records, made by a migration (#1253).
    if (event.action === "seeded") {
        return {
            when: formatDateTime(event.at),
            what: "Live before publish control",
            detail: `It was on ${site} before pages were published from here, so it started live.`,
        };
    }
    const who =
        event.by?.name ?? (event.by ? "someone" : "a former staff member");
    const verb =
        event.action in PAST ? PAST[event.action as PageAction] : event.action;
    const what = `${verb.charAt(0).toUpperCase()}${verb.slice(1)} by ${who}`;
    let detail = `Was ${STATUS_WORD[event.fromStatus]}, now ${STATUS_WORD[event.toStatus]}.`;
    if (event.toStatus === "LIVE") detail += ` Put on ${site}.`;
    else if (event.fromStatus === "LIVE") detail += ` Taken off ${site}.`;
    return { when: formatDateTime(event.at), what, detail };
}

/** "saroh.in" from "https://saroh.in/". */
export function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}
