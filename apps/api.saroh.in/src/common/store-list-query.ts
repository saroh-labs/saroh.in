import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * A store's order and customer lists, paged as the workspace lists are
 * (`customer-workspace/customers-list.dto.ts`): 1-based `page`, `size` one of
 * the offered sizes (anything else is a 400), and `{ rows, total, page,
 * pageSize }` back. Never the whole store in one answer.
 */
/**
 * The most rows a "latest N" read returns (newest first), for a list the
 * screen draws whole: an inbox, a lead's timeline, the contacts list.
 * The app's `lib/lists/capped.ts` says the same number.
 */
export const LIST_LIMIT = 500;

export const STORE_PAGE_SIZE = 50;
export const STORE_PAGE_SIZES = [10, 25, 50, 100] as const;
const PAGE_MAX = 10_000;

export class StoreListQueryDto {
    /** 1-based. */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "page must be a whole number" })
    @Min(1)
    @Max(PAGE_MAX)
    page?: number;

    /** Rows per page: 10, 25, 50 or 100. */
    @IsOptional()
    @Type(() => Number)
    @IsIn(STORE_PAGE_SIZES, { message: "size is 10, 25, 50 or 100" })
    size?: number;
}

export interface StorePage<T> {
    rows: T[];
    total: number;
    page: number;
    pageSize: number;
}

/** `skip`/`take` for a query, with the default page and size. */
export function storePageOf(query: StoreListQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.size ?? STORE_PAGE_SIZE;
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
