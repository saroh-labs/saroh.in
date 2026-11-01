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
export type PageAction =
    | "publish"
    | "unpublish"
    | "archive"
    | "restore"
    /** Cancel this change: a staged change goes back to what the site has (DEC-201 amendment). */
    | "cancel";

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
    /** The same checks in a few words each, with their counts (`checkWhy`). */
    why?: string[];
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
    why: string[];
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

/** The one name for a staged change, everywhere (audit F3). */
export const WAITING_LABEL = "Waiting to deploy";

/** What Deploy changes does to a staged page: the deploy bar and its confirm. */
export const PENDING_LABEL: Record<Pending, string> = {
    on: "Goes live",
    off: "Comes off",
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
        ? { label: WAITING_LABEL, variant: "warning" }
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
            why: "why" in entry ? entry.why : [],
            search: entry.search,
            updated: entry.updated,
            record,
            state: stateOf(record),
            ...siteOf(record),
        };
    });
}

const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

/** A failing check in a few words, with its count (`docPageChecks` ids). */
export function checkWhy(check: {
    id: string;
    title: string;
    count: number;
}): string {
    const n = check.count;
    switch (check.id) {
        case "to-confirm":
            return plural(n, "fact to confirm", "facts to confirm");
        case "placeholders":
            return plural(n, "placeholder left", "placeholders left");
        case "quotes":
            return plural(
                n,
                "quote mark facing the wrong way",
                "quote marks facing the wrong way",
            );
        case "no-price":
            return "it names Saroh's price or plan";
        case "claims":
            return "it says something Saroh doesn't do";
        case "checked-on":
            return "the GST check date is too old";
        case "files":
            return plural(
                n,
                "problem with its files",
                "problems with its files",
            );
        default:
            return `"${check.title}" fails`;
    }
}

/**
 * Why a page can't be published, on one line: its first failing check and
 * how many more (the Overview tab lists them all). Null when nothing fails.
 */
export function cantPublishWords(
    row: Pick<PageRow, "blocked" | "why">,
): string | null {
    const n = row.blocked.length;
    if (!n) return null;
    const first = row.why?.[0];
    if (!first)
        return `Can't publish yet: ${plural(n, "check fails", "checks fail")}`;
    const more = n - 1;
    return `Can't publish yet: ${first}${more ? `, and ${plural(more, "more check", "more checks")}` : ""}`;
}

/** The line under a status: since when, or what Deploy changes does to it. */
export function stateNote(row: PageRow): string {
    const r = row.record;
    if (row.onSite && row.state === "live" && row.blocked.length)
        return `Left out of the site until it passes: ${row.blocked.join(", ")}`;
    if (canDo("publish", row.state) && row.blocked.length)
        return "Can't publish yet";
    if (row.pending === "on") return "Goes live when changes are deployed";
    if (row.pending === "off") return "Comes off when changes are deployed";
    switch (row.state) {
        case "live":
            return `Live since ${formatDate(r?.liveSince ?? r?.changedAt)}`;
        case "unpublished":
            return `Taken off ${formatDate(r?.changedAt)}`;
        case "archived":
            return `Archived ${formatDate(r?.changedAt)}`;
        case "draft":
            // Restored from the archive, or a staged change cancelled.
            return r
                ? `Back to draft ${formatDate(r.changedAt)}`
                : "Never published";
    }
}

export type Filter =
    "all" | "live" | "waiting" | "draft" | "unpublished" | "archived";

/**
 * The chips go by the site: a page waiting to come off still counts as
 * live. Waiting to deploy is every staged change, on or off.
 */
export function inFilter(
    row: Pick<PageRow, "state" | "onSite"> & { pending?: Pending | null },
    filter: Filter,
): boolean {
    const { state, onSite } = row;
    switch (filter) {
        case "all":
            return onSite || state !== "archived";
        case "live":
            return onSite;
        case "waiting":
            return !!row.pending;
        case "draft":
            return !onSite && state === "draft";
        case "unpublished":
            return !onSite && state === "unpublished";
        case "archived":
            return !onSite && state === "archived";
    }
}

export const FILTER_LABEL: Record<Filter, string> = {
    all: "All",
    live: "Live",
    waiting: WAITING_LABEL,
    draft: "Draft",
    unpublished: "Unpublished",
    archived: "Archived",
};

export function countBy(rows: readonly PageRow[]): Record<Filter, number> {
    const n = (f: Filter) => rows.filter((r) => inFilter(r, f)).length;
    return {
        all: n("all"),
        live: n("live"),
        waiting: n("waiting"),
        draft: n("draft"),
        unpublished: n("unpublished"),
        archived: n("archived"),
    };
}

export type Grouping = "section" | "status" | "none";
export type Sorting = "name" | "changed";

/** The list's filters, kept in the address so Back and a reload keep them. */
export interface ListQuery {
    status: Filter;
    q: string;
    /** One section (a /for/ family, a tool's or doc's hub group); "" is all. */
    section: string;
    group: Grouping;
    sort: Sorting;
}

const FILTERS_KNOWN: readonly Filter[] = [
    "all",
    "live",
    "waiting",
    "draft",
    "unpublished",
    "archived",
];

const pickOf = <T extends string>(
    known: readonly T[],
    v: string | null,
    or: T,
) => known.find((k) => k === v) ?? or;

export function readListQuery(get: (key: string) => string | null): ListQuery {
    return {
        status: pickOf(FILTERS_KNOWN, get("status"), "all"),
        q: get("q") ?? "",
        section: get("section") ?? "",
        group: pickOf(["section", "status", "none"], get("group"), "section"),
        sort: pickOf(["name", "changed"], get("sort"), "name"),
    };
}

/** The list's address for a kind and its filters; defaults are left out. */
export function listHref(kind: PageKind, q: ListQuery): string {
    const p = new URLSearchParams();
    if (kind !== "for") p.set("kind", kind);
    if (q.status !== "all") p.set("status", q.status);
    if (q.q) p.set("q", q.q);
    if (q.section) p.set("section", q.section);
    if (q.group !== "section") p.set("group", q.group);
    if (q.sort !== "name") p.set("sort", q.sort);
    const s = p.toString();
    return `/search-pages${s ? `?${s}` : ""}`;
}

const byName = (a: PageRow, b: PageRow) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** By name (the code's order is by address: "Google review QR" sat under R), or newest change first. */
export function sortRows(rows: readonly PageRow[], sort: Sorting): PageRow[] {
    return [...rows].sort((a, b) =>
        sort === "changed"
            ? b.updated.localeCompare(a.updated) || byName(a, b)
            : byName(a, b),
    );
}

/** Status groups, what needs a deploy first. */
const STATUS_GROUPS: Exclude<Filter, "all">[] = [
    "waiting",
    "live",
    "draft",
    "unpublished",
    "archived",
];

/** Rows in groups, each group keeping the rows' order; `none` is one group with no name. */
export function groupRows(
    rows: readonly PageRow[],
    group: Grouping,
): { key: string; label: string | null; rows: PageRow[] }[] {
    if (group === "none") return [{ key: "all", label: null, rows: [...rows] }];
    const keyOf = (r: PageRow) =>
        group === "section"
            ? r.family
            : FILTER_LABEL[
                  r.pending
                      ? "waiting"
                      : (STATUS_GROUPS.find(
                            (f) => f !== "waiting" && inFilter(r, f),
                        ) ?? "archived")
              ];
    const order =
        group === "status"
            ? STATUS_GROUPS.map((f) => FILTER_LABEL[f])
            : [...new Set(rows.map(keyOf))].sort((a, b) =>
                  a.localeCompare(b, "en"),
              );
    return order
        .map((key) => ({
            key,
            label: key,
            rows: rows.filter((r) => keyOf(r) === key),
        }))
        .filter((g) => g.rows.length > 0);
}

/** The line under a row's status, or null when it would say only "Never published". */
export function rowNote(row: PageRow): string | null {
    if (canDo("publish", row.state) && row.blocked.length)
        return cantPublishWords(row);
    const note = stateNote(row);
    return note === "Never published" ? null : note;
}

const plain = (s: string) =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

/** The search phrase only repeats the page's name ("GST calculator", “gst calculator”). */
export const searchRepeatsName = (row: Pick<PageRow, "name" | "search">) =>
    plain(row.name) === plain(row.search);

/** The one step a row offers beside its ⋯, or none. */
export function nextAction(
    row: PageRow,
): { action: PageAction; label: string } | null {
    if (row.pending) return { action: "cancel", label: "Cancel change" };
    if (row.state === "archived")
        return { action: "restore", label: "Restore" };
    if (canDo("publish", row.state) && !row.blocked.length)
        return { action: "publish", label: "Publish" };
    return null;
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
        case "cancel":
            // Goes by the staged change, not the state: see `eligible`.
            return false;
    }
}

/** Which pages an action can be done to; Publish leaves out a page whose checks fail, Cancel takes only staged ones. */
export function eligible<
    T extends { state: RowState; blocked?: string[]; pending?: Pending | null },
>(action: PageAction, rows: readonly T[]): T[] {
    return rows.filter((r) =>
        action === "cancel"
            ? !!r.pending
            : canDo(action, r.state) &&
              !(action === "publish" && r.blocked?.length),
    );
}

/**
 * The bulk bar: how many ticked pages can't be published and why. Publish
 * already takes only the rest (`eligible`), so it says so when there are any.
 */
export function heldWords(
    rows: readonly Pick<PageRow, "name" | "state" | "blocked" | "why">[],
): string | null {
    const held = rows.filter(
        (r) => canDo("publish", r.state) && r.blocked.length,
    );
    if (!held.length) return null;
    const rest = eligible("publish", rows).length;
    const names = held
        .map(
            (r) =>
                `${r.name} (${r.why?.length ? r.why.join(", ") : r.blocked.join(", ")})`,
        )
        .join("; ");
    return `${plural(held.length, "page can't", "pages can't")} be published yet: ${names}.${rest ? ` Publish ${rest} publishes the rest.` : ""}`;
}

/** The bulk bar's one line before the reasons open (audit F5): "3 held by checks". */
export function heldCount(
    rows: readonly Pick<PageRow, "state" | "blocked">[],
): number {
    return rows.filter((r) => canDo("publish", r.state) && r.blocked.length)
        .length;
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
    pending: Pending | null = null,
): { action: PageAction | null; label: string; danger?: boolean }[] {
    // A staged change can be taken back before it ships (DEC-201 amendment).
    const cancel = pending
        ? [{ action: "cancel" as const, label: "Cancel this change" }]
        : [];
    if (state === "archived")
        return [...cancel, { action: "restore", label: "Restore" }];
    if (state === "live")
        return [
            ...cancel,
            { action: "unpublish", label: "Unpublish" },
            { action: "archive", label: "Archive", danger: true },
        ];
    return [
        ...cancel,
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
    /** Waiting for Deploy changes. */
    pending?: Pending | null;
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

/** Each kind's list on the site, for a set of several kinds. */
const LIST_NAME: Record<PageKind, string> = {
    for: "/for/",
    tools: "/tools",
    ...(Object.fromEntries(
        DOC_KINDS.map((k) => [k.id, k.prefix.replace(/\/$/, "")]),
    ) as Record<DocKindId, string>),
};

/**
 * Where these pages are listed: one kind's own words, or every kind's list
 * named ("the /guides and /tools lists, the menu and the footer"), never
 * one kind's words for a mixed set (audit F4).
 */
export function listWordsFor(pages: readonly { kind?: PageKind }[]): string {
    const kinds = [...new Set(pages.map((p) => p.kind ?? "for"))];
    if (kinds.length <= 1) return LIST_WORDS[kinds[0] ?? "for"];
    const names = kinds.map((k) => LIST_NAME[k]);
    const menu = kinds.some((k) => k !== "for") ? ", the menu" : "";
    return `the ${names.slice(0, -1).join(", ")} and ${names.at(-1)} lists${menu} and the footer`;
}

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
    const listed = listWordsFor(pages);
    // Staged to go live and never on the site: Unpublish changes nothing there.
    const neverLive = n > 0 && pages.every((p) => p.pending === "on");
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
            if (neverLive)
                return {
                    title: `Take ${what} off ${site}?`,
                    confirm: `Unpublish ${count}`,
                    points: [
                        `${one ? "It isn't" : "They aren't"} on ${site} yet, so nothing changes there.`,
                        `${one ? "It's" : "They're"} marked Unpublished. To leave ${one ? "it" : "them"} as ${one ? "it was" : "they were"}, use Cancel this change instead.`,
                    ],
                    tick: null,
                    destructive: false,
                };
            return {
                title: `Take ${what} off ${site}?`,
                confirm: `Unpublish ${count}`,
                points: [
                    `${one ? "It stays" : "They stay"} on ${site} until changes are deployed. Then ${one ? "it leaves" : "they leave"} the sitemap and ${listWordsFor(pages)}.`,
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
        case "cancel": {
            const on = pages.filter((p) => p.pending === "on").length;
            return {
                title: `Cancel the change to ${what}?`,
                confirm: one ? "Cancel the change" : `Cancel ${n} changes`,
                points: [
                    on === n
                        ? `${one ? "It doesn't go" : "They don't go"} live at the next deploy. ${one ? "It goes" : "They go"} back to where ${one ? "it was" : "they were"} before.`
                        : on === 0
                          ? `${one ? "It stays" : "They stay"} live. ${one ? "It doesn't come" : "They don't come"} off at the next deploy.`
                          : `Each one goes back to where it was before: what's live stays live, the rest stay off.`,
                    `Nothing changes on ${site}, and nothing is left waiting to deploy for ${these}.`,
                ],
                tick: null,
                destructive: false,
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
    cancel: "cancelled",
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

/**
 * The toast after an action worked. `staged` is how many of the pages now
 * wait for Deploy changes; the toast then offers to go to the bar (F6).
 */
export function successWords(
    action: PageAction,
    pages: readonly { name: string }[],
    site: string,
): { title: string; description?: string; staged: boolean } {
    const n = pages.length;
    const one = n === 1;
    const what = one ? (pages[0]?.name ?? "The page") : `${n} pages`;
    switch (action) {
        case "publish":
            return {
                title: `${what} ${one ? "waits" : "wait"} to deploy.`,
                description: `Deploy changes to put ${one ? "it" : "them"} on ${site}.`,
                staged: true,
            };
        case "unpublish":
            return {
                title: `${what} ${one ? "waits" : "wait"} to come off.`,
                description: `Deploy changes to take ${one ? "it" : "them"} off ${site}.`,
                staged: true,
            };
        case "cancel":
            return {
                title: `Cancelled the change to ${what}.`,
                description: `Nothing changes on ${site}.`,
                staged: false,
            };
        case "archive":
            return {
                title: `Archived ${one ? "the page" : what}.`,
                staged: false,
            };
        case "restore":
            return {
                title: `Restored ${one ? "the page" : what} as a draft.`,
                staged: false,
            };
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
    const when = formatDateTime(event.at);
    const from = STATUS_WORD[event.fromStatus];
    const to = STATUS_WORD[event.toStatus];
    // Since R13 only a deploy changes the site (audit F2).
    if (event.action === "deploy") {
        const went =
            event.toStatus === "LIVE"
                ? `Went live on ${site}`
                : event.fromStatus === "LIVE"
                  ? `Came off ${site}`
                  : `Deployed to ${site}`;
        return {
            when,
            what: `${went} · deployed by ${who}`,
            detail: `Was ${from}, now ${to}.`,
        };
    }
    if (event.action === "cancel") {
        return {
            when,
            what: `Change cancelled by ${who}`,
            detail: `Back to ${to}, as the site has it. Nothing changed on ${site}.`,
        };
    }
    const what = `${verb.charAt(0).toUpperCase()}${verb.slice(1)} by ${who}`;
    const staged =
        (event.fromStatus === "LIVE") !== (event.toStatus === "LIVE");
    return {
        when,
        what,
        detail: staged
            ? `Was ${from}, set to ${event.toStatus === "LIVE" ? "go live" : "come off"} at the next deploy.`
            : `Was ${from}, now ${to}. Nothing changes on ${site}.`,
    };
}

/** "saroh.in" from "https://saroh.in/". */
export function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}
