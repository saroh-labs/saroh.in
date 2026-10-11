/*
 * A paged list's sums: the sizes it offers, how many pages that makes and
 * which page numbers its footer draws. Plain functions with no client
 * mark, so a server page reads an address with the same ones the footer
 * (`ListPaging`, `list-toolbar.tsx`) draws from.
 */

/** The sizes every paged list offers. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** What a list shows before anyone chooses. */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * A size off an address: one of `PAGE_SIZES`, else `otherwise` (what this
 * browser last chose for the list, or the default).
 */
export function readPageSize(
    raw: string | number | undefined | null,
    otherwise: number = DEFAULT_PAGE_SIZE,
): number {
    const n = Number(raw);
    return (PAGE_SIZES as readonly number[]).includes(n) ? n : otherwise;
}

/** How many pages `total` rows make at `size` a page; never under one. */
export function pagesOf(total: number, size: number): number {
    return Math.max(1, Math.ceil(total / size));
}

/**
 * The page numbers a footer draws: always the first and the last, the
 * page on screen with one either side, and "gap" where numbers are left
 * out. Seven places at most, so the row never changes width as someone
 * pages: 1 2 3 4 5 … 20 · 1 … 9 10 11 … 20 · 1 … 16 17 18 19 20.
 */
export function pageNumbers(page: number, pages: number): (number | "gap")[] {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, "gap", pages];
    if (page >= pages - 3) {
        return [1, "gap", pages - 4, pages - 3, pages - 2, pages - 1, pages];
    }
    return [1, "gap", page - 1, page, page + 1, "gap", pages];
}

/** The cookie that keeps each list's chosen size between visits. */
export const ROWS_COOKIE = "saroh_rows";

/**
 * The sizes a browser has chosen, by list: "orders:25,customers:10" read
 * into `{ orders: 25, customers: 10 }`. Anything that isn't a list's name
 * and one of `PAGE_SIZES` is left out, so a damaged cookie is no choice.
 */
export function readRowsCookie(
    raw: string | undefined | null,
): Record<string, number> {
    const out: Record<string, number> = {};
    for (const part of (raw ?? "").split(",")) {
        const [list, size] = part.split(":");
        const n = Number(size);
        if (
            list &&
            /^[a-z0-9-]{1,40}$/.test(list) &&
            (PAGE_SIZES as readonly number[]).includes(n)
        ) {
            out[list] = n;
        }
    }
    return out;
}

/** The cookie's value for `sizes`; the default size is not written. */
export function writeRowsCookie(sizes: Record<string, number>): string {
    return Object.entries(sizes)
        .filter(([, n]) => n !== DEFAULT_PAGE_SIZE)
        .map(([list, n]) => `${list}:${n}`)
        .join(",");
}
