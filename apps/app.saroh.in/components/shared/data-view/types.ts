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
    /**
     * A money column: set with `numeric`. Prices take Space Grotesk and
     * everything else stays in Geist (brand file §10) — money is
     * the figure people scan for.
     */
    money?: boolean;
    /** Hide from the table only; useful for a list-only summary line. */
    tableHidden?: boolean;
}

/**
 * A named subset of the rows — "Open", "Overdue", "Won this month".
 *
 * Filters are how a count on Home becomes a destination: the API emits
 * `/leads?view=open` and this is what `open` resolves against. The id is
 * therefore a URL contract, not an implementation detail — renaming one breaks
 * a link the API is already handing merchants.
 *
 * Applied client-side, over rows the page already loaded. That is the right
 * trade at these volumes (hundreds, not millions) because it makes switching
 * filters instant and needs no endpoint per view; when a list outgrows one
 * page, filtering moves to the query and this contract stays the same.
 */
export interface DataFilter<TRow> {
    /** Stable, URL-safe. Referenced by `?view=` and by API-emitted links. */
    id: string;
    label: string;
    /** Omit on the "all" filter; a filter with no predicate matches every row. */
    predicate?: (row: TRow) => boolean;
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
    /**
     * Controls for a single row — cancel, approve, a menu.
     *
     * Rendered in EVERY density, not just the table: dropping it below `lg`
     * would make the phone a feature-poor fallback rather than a different
     * density, which is the failure this primitive exists to prevent. In the
     * list rendering it sits beside the row link rather than inside it, so an
     * action never fires a navigation as well.
     */
    rowActions?: (row: TRow) => ReactNode;
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
    /** Named subsets, rendered as chips. The first is the default. */
    filters?: DataFilter<TRow>[];
    /**
     * Which filter is active on first render, from the page's `?view=` param.
     * Read on the server and passed in rather than pulled from
     * `useSearchParams` here: that hook forces every consumer into a Suspense
     * boundary, and the value is only ever needed once.
     */
    initialFilterId?: string;
    isLoading?: boolean;
    error?: string | null;
    /** What a row is, for counts and states: "3 products", "No products match…". */
    noun?: { one: string; other: string };
    /** Placeholder for the search field, e.g. "Search products". */
    searchPlaceholder?: string;
    /**
     * Opens a row in place — a preview drawer — instead of navigating. The
     * whole row is the target (brand file §10); the first cell becomes a real
     * button so the row stays reachable by keyboard.
     */
    onRowClick?: (row: TRow) => void;
    /** Rows can be selected, and the bulk bar offers these actions. */
    selectable?: boolean;
    bulkActions?: DataBulkAction<TRow>[];
    /**
     * The designed first-run state: shown when there are no rows at all. The
     * no-match and filtered-to-nothing states are built in, so every list says
     * the same thing when a search comes back empty.
     */
    emptyState?: {
        icon?: ReactNode;
        title: string;
        note?: string;
        action?: ReactNode;
    };
}

/**
 * One action in the bulk bar. `run` gets the selected rows and a way to clear
 * the selection; destructive actions confirm before they act (brand file §14).
 */
export interface DataBulkAction<TRow> {
    id: string;
    label: string;
    tone?: "default" | "destructive";
    run: (rows: TRow[], clear: () => void) => void;
}
