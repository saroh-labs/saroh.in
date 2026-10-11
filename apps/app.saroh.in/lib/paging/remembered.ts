import "server-only";

import {
    DEFAULT_PAGE_SIZE,
    ROWS_COOKIE,
    readRowsCookie,
} from "@saroh/ui/lib/paging";
import { cookies } from "next/headers";

/**
 * The rows per page this browser last chose for `list` ("orders"), or 50.
 * For a list the server reads a page at a time: an address that names no
 * size opens at this one, so the choice holds between visits.
 */
export async function rememberedPageSize(list: string): Promise<number> {
    const sizes = readRowsCookie((await cookies()).get(ROWS_COOKIE)?.value);
    return sizes[list] ?? DEFAULT_PAGE_SIZE;
}
