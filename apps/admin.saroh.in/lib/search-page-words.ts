import type { SearchPageEntry } from "@saroh/search-pages";
import type { DocKindId } from "@saroh/search-pages/kinds";
import { DOC_KINDS } from "@saroh/search-pages/kinds";

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
    /** What staff last chose: publish, unpublish, archive and restore stage it. */
    status: PageStatus;
    /** What the last Deploy changes sent to the site (R13). */
    releasedStatus: PageStatus;
    liveSince: string | null;
    changedAt: string;
    changedBy: { name: string | null } | null;
    deployedAt?: string | null;
    deployedBy?: { name: string | null } | null;
}

export interface Rebuild {
    running: boolean;
    startedAt?: string;
    url?: string;
    /** The paths a deploy still waiting to start carries. */
    paths?: string[];
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

/** The status staff last chose (staged). */
export type RowState = "live" | "draft" | "unpublished" | "archived";

/** A staged change the site doesn't have yet: going on, or coming off. */
export type Pending = "on" | "off";

/** /for/, tools, and the groups on the shared kit (`@saroh/search-pages/kinds`). */
export type PageKind = "for" | "tools" | DocKindId;

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
    /** On the site now: what the last Deploy changes released. */
    onSite: boolean;
    /** Waiting for Deploy changes, or null. */
    pending: Pending | null;
    record: SearchPageRecord | null;
    /**
     * A GST page's, guide's or download's checks that fail (their titles):
     * it can't be published, and a live one is left out of the site's
     * build (plan 2026-10-31-002, R9). Always empty for /for/ and tools.
     */
    blocked: string[];
    /** The search pages its words link to: each must be live before it is (U12). */
    links: string[];
    /** Links in its words to a search page that isn't in the code: a typo. */
    deadLinks: string[];
}

/** A GST page, guide or download as the list has it, with its failing checks. */
export interface DocEntry {
    kind: DocKindId;
    path: string;
    slug: string;
    name: string;
    search: string;
    updated: string;
    /** Its group on the hub: "By trade", "Bookings and no-shows". */
    group: string;
    blocked: string[];
    /** `docLinks`: what its words link to, and what the template draws only when live. */
    links: { required: string[]; optional: string[] };
}

export const STATE_LABEL: Record<RowState, string> = {
    live: "Live",
    draft: "Draft",
    unpublished: "Unpublished",
    archived: "Archived",
};

export const STATE_BADGE: Record<
    RowState,
    "success" | "draft" | "warning" | "outline" | "neutral"
> = {
    live: "success",
    draft: "draft",
    unpublished: "outline",
    archived: "neutral",
};

const PENDING_LABEL: Record<Pending, string> = {
    on: "Published · not deployed yet",
    off: "Taken off · not deployed yet",
};

/** A row's status badge: the staged status, or that it waits for Deploy changes. */
export function badgeOf(
    row: Pick<PageRow, "state" | "pending" | "onSite"> & { blocked?: string[] },
): {
    label: string;
    variant: (typeof STATE_BADGE)[RowState] | "error";
} {
    // Live, but the site's build leaves it out until its checks pass.
    if (row.onSite && row.state === "live" && row.blocked?.length)
        return { label: "Held by checks", variant: "error" };
    return row.pending
        ? { label: PENDING_LABEL[row.pending], variant: "warning" }
        : { label: STATE_LABEL[row.state], variant: STATE_BADGE[row.state] };
}

export function stateOf(record: SearchPageRecord | null): RowState {
    switch (record?.status ?? "DRAFT") {
        case "LIVE":
            return "live";
        case "UNPUBLISHED":
            return "unpublished";
        case "ARCHIVED":
            return "archived";
        case "DRAFT":
            return "draft";
    }
}

/** Where the staged status and the released one put the page on and off the site. */
export function siteOf(record: SearchPageRecord | null): {
    onSite: boolean;
    pending: Pending | null;
} {
    const onSite = record?.releasedStatus === "LIVE";
    const staged = record?.status === "LIVE";
    return {
        onSite,
        pending: staged === onSite ? null : staged ? "on" : "off",
    };
}

/** The manifest, each page with its record (or none): the manifest's order, records for pages no longer in the code left out. */
export function mergePages(
    manifest: readonly (SearchPageEntry | DocEntry)[],
    read: SearchPagesRead,
): PageRow[] {
    const byPath = new Map(read.pages.map((r) => [r.path, r]));
    const inCode = new Set(manifest.map((e) => e.path));
    return manifest.map((entry) => {
        const record = byPath.get(entry.path) ?? null;
        const links =
            "links" in entry ? entry.links : { required: [], optional: [] };
        return {
            links: links.required,
            // An optional link to no page is never drawn (a /for/ page not written yet).
            deadLinks: links.required.filter((l) => !inCode.has(l)),
            path: entry.path,
            slug: entry.slug,
            kind: entry.kind,
            name: entry.name,
            family: entry.kind === "for" ? entry.family : entry.group,
            inApp: entry.kind === "tools" && entry.inApp,
            blocked: "blocked" in entry ? entry.blocked : [],
            search: entry.search,
            updated: entry.updated,
            record,
            state: stateOf(record),
            ...siteOf(record),
        };
    });
}

/** The line under a status: since when, or what Deploy changes does to it. */
export function stateNote(row: PageRow): string {
    const r = row.record;
    if (row.onSite && row.state === "live" && row.blocked.length)
        return `Left out of the site until it passes: ${row.blocked.join(", ")}`;
    if (row.pending === "on") return "Goes live when changes are deployed";
    if (row.pending === "off") return "Stays live until changes are deployed";
    switch (row.state) {
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

export type Filter = "all" | "live" | "draft" | "unpublished" | "archived";

/** The chips go by the site: a page waiting to come off still counts as live. */
export function inFilter(
    row: Pick<PageRow, "state" | "onSite">,
    filter: Filter,
): boolean {
    const { state, onSite } = row;
    switch (filter) {
        case "all":
            return onSite || state !== "archived";
        case "live":
            return onSite;
        case "draft":
            return !onSite && (state === "draft" || state === "live");
        case "unpublished":
            return !onSite && state === "unpublished";
        case "archived":
            return !onSite && state === "archived";
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
    const n = (f: Filter) => rows.filter((r) => inFilter(r, f)).length;
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
            return state !== "archived";
        case "restore":
            return state === "archived";
    }
}

/** Which pages an action can be done to; Publish leaves out a page whose checks fail. */
export function eligible<T extends { state: RowState; blocked?: string[] }>(
    action: PageAction,
    rows: readonly T[],
): T[] {
    return rows.filter(
        (r) =>
            canDo(action, r.state) &&
            !(action === "publish" && r.blocked?.length),
    );
}

/** Why Publish is held back for these pages: each one's name and failing checks. */
export function heldWords(
    rows: readonly Pick<PageRow, "name" | "state" | "blocked">[],
): string | null {
    const held = rows.filter(
        (r) => canDo("publish", r.state) && r.blocked.length,
    );
    if (!held.length) return null;
    return `Can't publish until its checks pass: ${held
        .map((r) => `${r.name} (${r.blocked.join(", ")})`)
        .join("; ")}.`;
}

/** A page a page being published links to, that isn't live (staged) and isn't in the same publish (U12). */
export interface MissingLink {
    path: string;
    /** Its row; null when no page in the code has this address (a typo). */
    row: PageRow | null;
    /** The pages being published that link to it. */
    from: string[];
}

/**
 * What Publish needs first: every page the pages being published link to
 * must be live or published with them. `add` can join this publish (its own
 * links followed too); `blocking` can't, and holds Publish back.
 */
export function publishLinks(
    pages: readonly PageRow[],
    rows: readonly PageRow[],
): { add: PageRow[]; blocking: MissingLink[] } {
    const going = new Set(pages.map((p) => p.path));
    const queue = [...pages];
    const add: PageRow[] = [];
    const blocking: MissingLink[] = [];
    const block = (path: string, row: PageRow | null, from: string) => {
        const was = blocking.find((b) => b.path === path);
        if (was) was.from.push(from);
        else blocking.push({ path, row, from: [from] });
    };
    // The iterator also reaches pages pushed while it runs: what added pages link to.
    for (const page of queue) {
        for (const link of page.deadLinks) block(link, null, page.name);
        for (const link of page.links) {
            const row = rows.find((r) => r.path === link);
            if (!row || row.state === "live" || going.has(link)) continue;
            if (canDo("publish", row.state) && !row.blocked.length) {
                going.add(link);
                add.push(row);
                queue.push(row);
            } else block(link, row, page.name);
        }
    }
    return { add, blocking };
}

const NOT_LIVE: Record<Exclude<RowState, "live">, string> = {
    draft: "not published",
    unpublished: "taken off",
    archived: "archived",
};

/** The Publish dialog's warning: each page linked to that isn't live, with its state and the fix. */
export function linkWords(
    links: { add: readonly PageRow[]; blocking: readonly MissingLink[] },
    pages: readonly PageRow[],
): { title: string; lines: string[]; button: string | null } | null {
    const { add, blocking } = links;
    if (!add.length && !blocking.length) return null;
    const linkedFrom = (path: string) =>
        [...pages, ...add]
            .filter((p) => p.links.includes(path))
            .map((p) => p.name)
            .join(", ");
    const lines = [
        ...add.map(
            (r) =>
                `${r.name} (${r.path}) is ${NOT_LIVE[r.state as Exclude<RowState, "live">]}. ${linkedFrom(r.path)} links to it.`,
        ),
        ...blocking.map((b) => {
            const from = b.from.join(", ");
            if (!b.row)
                return `${from} links to ${b.path}. This link goes to a page that doesn't exist. Fix the link in the code, then publish.`;
            const was = `${b.row.name} (${b.path}) is ${NOT_LIVE[b.row.state as Exclude<RowState, "live">]}, and ${from} links to it.`;
            return b.row.state === "archived"
                ? `${was} Restore it first, then publish it with this.`
                : `${was} It can't be published until its checks pass: ${b.row.blocked.join(", ")}. Fix them first.`;
        }),
    ];
    return {
        title: "Links to pages that aren't live",
        lines,
        button: add.length ? "Publish these too" : null,
    };
}

/** Where a taken-off page's links go meanwhile, in words. */
function takenOffTo(kind: PageKind): string {
    if (kind === "for") return "its family page";
    if (kind === "tools") return "the /tools list";
    return `the ${DOC_KINDS.find((k) => k.id === kind)?.hubLabel ?? "Saroh"} list`;
}

/** Unpublish and Archive: the live pages that link to these, and where their links go meanwhile. Never blocks. */
export function linkedFromWords(
    pages: readonly PageRow[],
    rows: readonly PageRow[],
): string | null {
    const off = new Set(pages.map((p) => p.path));
    const linking = rows.filter(
        (r) =>
            r.state === "live" &&
            !off.has(r.path) &&
            r.links.some((l) => off.has(l)),
    );
    if (!linking.length) return null;
    const n = linking.length;
    const one = pages.length === 1;
    const kinds = new Set(pages.map((p) => p.kind));
    const to =
        kinds.size === 1
            ? takenOffTo(pages[0].kind)
            : "the list above each page";
    return `${n === 1 ? "1 live page links" : `${n} live pages link`} here (${linking.map((r) => r.name).join(", ")}); their links will go to ${to} until you publish ${one ? "it" : "them"} again.`;
}

/** A row's ⋯ menu, past Open details and Read it: what can be done to it. */
export function rowActions(
    state: RowState,
    site: string,
): { action: PageAction | null; label: string; danger?: boolean }[] {
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
    /** On the site now (released). */
    onSite?: boolean;
    /** Free tools (#1253) go to the /tools list, and back to it when taken off. */
    kind?: PageKind;
}

/** The kinds the list chooses between (`?kind=`), with their words. */
export const KINDS: { kind: PageKind; label: string; path: string }[] = [
    { kind: "for", label: "Trade pages", path: "/for/" },
    { kind: "tools", label: "Free tools", path: "/tools/" },
    ...DOC_KINDS.map((k) => ({
        kind: k.id,
        label: k.hubLabel,
        path: k.prefix,
    })),
];

export const kindOf = (asked: string | undefined): PageKind =>
    KINDS.find((k) => k.kind === asked)?.kind ?? "for";

/** Where a page of this kind is listed on the site. */
const LIST_WORDS: Record<PageKind, string> = {
    for: "the /for/ list and the footer",
    tools: "the /tools list, the Tools menu and the footer",
    ...(Object.fromEntries(DOC_KINDS.map((k) => [k.id, k.listWords])) as Record<
        DocKindId,
        string
    >),
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
    const kind = first?.kind ?? "for";
    const listed =
        LIST_WORDS[
            pages.every((p) => (p.kind ?? "for") === kind) ? kind : "for"
        ];
    switch (action) {
        case "publish":
            return {
                title: `Publish ${what} on ${site}?`,
                confirm: `Publish ${count}`,
                points: [
                    `Nothing changes on ${site} yet. ${one ? "It goes" : "They go"} live when changes are deployed, with every other change waiting.`,
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
                    `${one ? "It stays" : "They stay"} on ${site} until changes are deployed. Then ${one ? "it leaves" : "they leave"} the sitemap and ${tools ? "the /tools list" : "the /for/ list"}.`,
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
            const live = pages.filter((p) => p.onSite).length;
            return {
                title: `Archive ${what}?`,
                confirm: `Archive ${count}`,
                points: [
                    live > 0
                        ? one
                            ? `It's live now. It comes off ${site} when changes are deployed.`
                            : `${live} ${live === 1 ? "is" : "are"} live now. ${live === 1 ? "It comes" : "They come"} off ${site} when changes are deployed.`
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

const PAST: Record<PageAction | "deploy", string> = {
    publish: "published",
    unpublish: "unpublished",
    archive: "archived",
    restore: "restored",
    deploy: "deployed",
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

/** The toast after an action worked: staged, waiting for Deploy changes. */
export function successWords(
    action: PageAction,
    n: number,
    site: string,
): { title: string; description?: string } {
    const pages = n === 1 ? "the page" : `${n} pages`;
    switch (action) {
        case "publish":
            return {
                title: `Published ${pages}.`,
                description: `Deploy changes to put ${n === 1 ? "it" : "them"} on ${site}.`,
            };
        case "unpublish":
            return {
                title: `Took ${pages} off.`,
                description: `Deploy changes to take ${n === 1 ? "it" : "them"} off ${site}.`,
            };
        case "archive":
            return { title: `Archived ${pages}.` };
        case "restore":
            return { title: `Restored ${pages} as a draft.` };
    }
}

/** The rebuild banner's middle sentence: how many pages it carries, when known. */
export function rebuildWords(rebuild: Rebuild): string {
    const n = rebuild.paths?.length ?? 0;
    if (n === 0) return "";
    return `${n} ${n === 1 ? "page changes" : "pages change"} in it.`;
}

/** The deploy bar and its confirm (R13): every staged change, in one rebuild. */
export function deployWords(
    rows: readonly Pick<PageRow, "pending">[],
    site: string,
): {
    title: string;
    on: number;
    off: number;
    dialogTitle: string;
    points: string[];
} {
    const on = rows.filter((r) => r.pending === "on").length;
    const off = rows.filter((r) => r.pending === "off").length;
    const n = on + off;
    const changes = `${n} ${n === 1 ? "change" : "changes"}`;
    return {
        title: n
            ? `${changes} waiting to deploy`
            : "No changes waiting to deploy",
        on,
        off,
        dialogTitle: `Deploy ${changes} to ${site}?`,
        points: [
            `${site} rebuilds once with every change below. It takes a few minutes.`,
            on
                ? `${on} ${on === 1 ? "page goes" : "pages go"} live, into the sitemap and the lists.`
                : "",
            off
                ? `${off} ${off === 1 ? "page comes" : "pages come"} off. Old links send people to the page above them, not an error.`
                : "",
        ].filter(Boolean),
    };
}

/** The toast after Deploy changes worked. */
export function deployedWords(
    n: number,
    rebuildQueued: boolean,
    site: string,
): { title: string; description: string } {
    return {
        title: `Deploying ${n} ${n === 1 ? "change" : "changes"}.`,
        description: rebuildQueued
            ? `${site} is rebuilding.`
            : `${site} can't rebuild from here (no deploy is set up), so they go out with the next deploy.`,
    };
}

/** "Where it shows on <site>": four places, each on or off, as released. */
export function whereItShows(
    row: Pick<PageRow, "onSite" | "pending">,
    site: string,
    kind: PageKind = "for",
): { label: string; on: boolean; value: string }[] {
    const live = row.onSite;
    return [
        {
            label: "The page itself",
            on: live,
            value: live
                ? row.pending === "off"
                    ? "Live until changes are deployed"
                    : "Live"
                : row.pending === "on"
                  ? "After changes are deployed"
                  : `Not on ${site}`,
        },
        { label: "Sitemap", on: live, value: live ? "Listed" : "Not listed" },
        {
            label:
                kind === "tools"
                    ? "The /tools list, the menu and the footer"
                    : kind === "for"
                      ? "The /for/ list and the footer"
                      : `The${LIST_WORDS[kind].slice("the".length)}`,
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
        event.action in PAST
            ? PAST[event.action as keyof typeof PAST]
            : event.action;
    const what = `${verb.charAt(0).toUpperCase()}${verb.slice(1)} by ${who}`;
    let detail = `Was ${STATUS_WORD[event.fromStatus]}, now ${STATUS_WORD[event.toStatus]}.`;
    // Since R13 only a deploy changes the site; older rows are left unsaid.
    if (event.action === "deploy") {
        if (event.toStatus === "LIVE") detail += ` Put on ${site}.`;
        else if (event.fromStatus === "LIVE") detail += ` Taken off ${site}.`;
    }
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
