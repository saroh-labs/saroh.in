import type { ChangeUnit, SitePage } from "@/lib/sites/service";

/**
 * Website › Pages' filters, sort and count, all read from and written to
 * the address so a link lands on the same list (a list's saved filter is
 * `?view=`): `view=fix` is the Needs fixing toggle (Overview's fix links
 * land with it on), `menu`, `who`, `status`, `by`, `sort` and `q`.
 */
export type MenuFilter = "all" | "in" | "out";
// TODO(batch 7): "Customers who sign in", once a page can be sign-in only.
export type WhoFilter = "all" | "public" | "hidden";
export type StatusFilter = "all" | "live" | "waiting" | "new";
export type PagesSort = "menu" | "edited" | "name";
export type PageStatus = Exclude<StatusFilter, "all">;

export interface PagesQuery {
    fix: boolean;
    menu: MenuFilter;
    who: WhoFilter;
    status: StatusFilter;
    /** A last editor's name; "" is everyone. */
    by: string;
    sort: PagesSort;
    q: string;
}

const pick = <V extends string>(
    value: string | null,
    allowed: readonly V[],
): V => (allowed.includes(value as V) ? (value as V) : allowed[0]);

export function readPagesQuery(params: URLSearchParams): PagesQuery {
    return {
        fix: params.get("view") === "fix",
        menu: pick(params.get("menu"), ["all", "in", "out"] as const),
        who: pick(params.get("who"), ["all", "public", "hidden"] as const),
        status: pick(params.get("status"), [
            "all",
            "live",
            "waiting",
            "new",
        ] as const),
        by: params.get("by") ?? "",
        sort: pick(params.get("sort"), ["menu", "edited", "name"] as const),
        q: params.get("q") ?? "",
    };
}

/** `params` with `query` written in; defaults leave the address. Other keys (`page`) stay. */
export function writePagesQuery(
    params: URLSearchParams,
    query: PagesQuery,
): URLSearchParams {
    const next = new URLSearchParams(params.toString());
    const put = (key: string, value: string, unset: string) => {
        if (value === unset) next.delete(key);
        else next.set(key, value);
    };
    put("view", query.fix ? "fix" : "", "");
    put("menu", query.menu, "all");
    put("who", query.who, "all");
    put("status", query.status, "all");
    put("by", query.by, "");
    put("sort", query.sort, "menu");
    put("q", query.q.trim(), "");
    return next;
}

/**
 * A page's status from the Publish sheet's change units (U7), the same
 * units the status chip and Overview count: Not live yet while the site
 * was never published or the page itself is new, Changes waiting while
 * any unit is on it, else Live.
 */
export function pageStatus(
    page: SitePage,
    units: readonly ChangeUnit[],
    live: boolean,
): PageStatus {
    if (!live) return "new";
    const mine = units.filter((u) => u.pageId === page.id);
    if (mine.some((u) => u.kind === "page" && u.change === "added"))
        return "new";
    return mine.length > 0 ? "waiting" : "live";
}

export interface PageFacts {
    inMenu: boolean;
    hidden: boolean;
    /** Null when the overview couldn't be read. */
    needsFix: boolean | null;
    /** Null when the changes couldn't be read. */
    status: PageStatus | null;
    editedBy: string | null;
    editedAt: string | null;
    title: string;
    path: string;
}

/** The query's narrowing filters, without the toggle: what the toggle's count is taken over. */
function passes(f: PageFacts, q: PagesQuery): boolean {
    const needle = q.q.trim().toLowerCase();
    return (
        (q.menu === "all" || (q.menu === "in") === f.inMenu) &&
        (q.who === "all" || (q.who === "hidden") === f.hidden) &&
        (q.status === "all" || f.status === q.status) &&
        (q.by === "" || f.editedBy === q.by) &&
        (needle === "" ||
            f.title.toLowerCase().includes(needle) ||
            f.path.toLowerCase().includes(needle))
    );
}

/** The pages to show, in the query's order; `facts` come in menu order. */
export function filterPages<T extends PageFacts>(
    facts: readonly T[],
    q: PagesQuery,
): T[] {
    const shown = facts.filter(
        (f) => passes(f, q) && (!q.fix || f.needsFix === true),
    );
    if (q.sort === "name")
        return shown.sort((a, b) => a.title.localeCompare(b.title));
    if (q.sort === "edited")
        // Newest first; never-edited pages last, still in menu order.
        return shown.sort((a, b) =>
            (b.editedAt ?? "").localeCompare(a.editedAt ?? ""),
        );
    return shown;
}

/** Whether anything narrows the list (Clear filters shows then). */
export function narrowed(q: PagesQuery): boolean {
    return (
        q.fix ||
        q.menu !== "all" ||
        q.who !== "all" ||
        q.status !== "all" ||
        q.by !== "" ||
        q.q.trim() !== ""
    );
}

/** The same query with every filter cleared; the sort stays. */
export function cleared(q: PagesQuery): PagesQuery {
    return {
        ...q,
        fix: false,
        menu: "all",
        who: "all",
        status: "all",
        by: "",
        q: "",
    };
}

/** "11 pages", or "5 of 11" while narrowed. */
export function pagesCount(shown: number, total: number): string {
    return shown === total
        ? `${total} ${total === 1 ? "page" : "pages"}`
        : `${shown} of ${total}`;
}
