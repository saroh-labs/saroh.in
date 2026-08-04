import type { ReactNode } from "react";

/**
 * One primitive, three densities.
 *
 * Table, grid and list are not three components — they are the same rows and
 * columns rendered at three densities. Keeping them one primitive is what makes
 * a new column appear everywhere at once, and what stops the mobile rendering
 * quietly rotting into a feature-poor fallback of the desktop one.
 */
export type DataViewMode = "table" | "grid" | "list";

/**
 * How much a column matters, which is what lets one declaration serve every
 * density. The list rendering shows `primary` and `secondary`; the table shows
 * everything; the grid picks by card slot.
 *
 * This is deliberately about IMPORTANCE, not about layout. A column author
 * answers "how much does this matter?" — never "where does this go on a phone?"
 */
export type ColumnPriority = "primary" | "secondary" | "detail";

export interface DataColumn<TRow> {
    /** Stable key; also the sort key when `sortable`. */
    id: string;
    /** Column header. Carry units here (e.g. "Value (₹)"), not in every cell. */
    header: string;
    priority: ColumnPriority;
    /** Cell content. Receives the whole row so a cell can compose. */
    cell: (row: TRow) => ReactNode;
    /**
     * Sort value. Absent means the column cannot be sorted — which is honest
     * for a composed cell whose ordering would be arbitrary.
     */
    sortValue?: (row: TRow) => string | number;
    /**
     * Right-align and use tabular figures. Money and counts should set this so
     * digits line up down the column, which is most of why a table beats a list
     * for this data in the first place.
     */
    numeric?: boolean;
    /** Hide from the table only; useful for a list-only summary line. */
    tableHidden?: boolean;
}

export interface DataViewProps<TRow> {
    /**
     * Stable identifier for this view, e.g. "contacts". The view-mode preference
     * is persisted per view, because a merchant may well want a table for
     * Contacts and a grid for Products.
     */
    viewId: string;
    rows: TRow[];
    columns: DataColumn<TRow>[];
    rowKey: (row: TRow) => string;
    /** Where a row navigates. Makes the whole row a target on touch. */
    rowHref?: (row: TRow) => string;
    /** Renderings offered. Omit `grid` where cards would be meaningless. */
    modes?: DataViewMode[];
    /** Rendering used above `lg` when the merchant has expressed no preference. */
    defaultMode?: DataViewMode;
    /** Card face for the grid rendering. Required when `grid` is offered. */
    renderCard?: (row: TRow) => ReactNode;
    /** Shown instead of the data when `rows` is empty. */
    empty?: ReactNode;
    /** Free-text filter across these columns. Omit to hide the search field. */
    searchableColumnIds?: string[];
    isLoading?: boolean;
    error?: string | null;
}
