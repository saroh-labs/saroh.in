import type { DataPaging } from "@saroh/ui/data-view";

/**
 * For a `DataView` whose rows the server already paged by cursor, with its
 * own pager beside the list: `paging` says the rows are one page, and a
 * total of 0 keeps the view's footer ("Rows per page", "1 to 25 of 25")
 * off, so two pagers never contradict each other (admin audit F1).
 * Client-safe.
 */
export const SERVER_PAGED: DataPaging = {
    page: 1,
    total: 0,
    size: 25,
    to: () => ({}),
    onSize: () => undefined,
};
