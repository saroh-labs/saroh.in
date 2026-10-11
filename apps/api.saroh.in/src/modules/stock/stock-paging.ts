import { BadRequestException } from "@nestjs/common";

/**
 * How the Stock screen's three lists page: the levels, the log and the
 * checks. Each is read by its page number (`page`, from 1, at `size` rows),
 * which is what a footer with numbered pages asks, or as before by `limit`
 * after a `cursor`. Never both.
 */

/** The sizes a numbered page offers; the DTO refuses any other. */
export const STOCK_PAGE_SIZES = [10, 25, 50, 100] as const;

/** Rows a numbered page holds when the caller names no size. */
export const STOCK_PAGE_SIZE = 50;

export interface StockPaging {
    cursor?: string;
    limit?: number;
    page?: number;
    size?: number;
}

export interface StockWindow {
    /** Rows to answer; undefined is every one. */
    take: number | undefined;
    /** Rows to pass over first: the pages before `page`. */
    skip: number;
}

/**
 * Which rows a read answers. `size` is the rows a page (`limit`, its older
 * name, still reads); a `page` with neither is 50 rows. With no `page`,
 * `size` or `limit` the answer is `otherwise` rows: what the list sent
 * before it had numbered pages (every row when left out).
 */
export function stockWindow(
    query: StockPaging,
    otherwise?: number,
): StockWindow {
    if (query.cursor && query.page) {
        throw new BadRequestException({
            message: "Page by a cursor or a page number, not both.",
            details: { field: "page" },
        });
    }
    const take =
        query.size ?? query.limit ?? (query.page ? STOCK_PAGE_SIZE : otherwise);
    return {
        take,
        skip: query.page && take ? (query.page - 1) * take : 0,
    };
}
