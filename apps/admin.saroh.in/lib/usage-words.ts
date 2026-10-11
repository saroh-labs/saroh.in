/**
 * How the Usage screen says storage and pages (#798). Client-safe: no
 * server imports, so a client component may take values from here.
 */

export type StorageOrder = "most" | "least";

/** The API's storage page: one page of businesses, sorted by storage. */
export interface StorageUsageRow {
    id: string;
    name: string;
    slug: string;
    lifecycleStatus:
        "ACTIVE" | "SUSPENDED" | "PENDING_DELETION" | "DELETED_RETAINED";
    files: number;
    bytes: number;
    /** Decimal GB, up to the hundredth, as the plan's storage limit counts. */
    gb: number;
}

export interface StorageUsagePage {
    items: StorageUsageRow[];
    order: StorageOrder;
    page: number;
    limit: number;
    total: number;
    totalBytes: number;
    totalGb: number;
}

const GB = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/**
 * Storage in GB for people: "0 GB" for nothing, "2.35 GB" otherwise. The
 * API rounds up to the hundredth, so anything stored reads at least 0.01.
 */
export function formatGb(gb: number): string {
    if (!Number.isFinite(gb) || gb <= 0) return "0 GB";
    return `${GB.format(gb)} GB`;
}

/** The query string's `order`: "least" or the default, "most". */
export function readOrder(value: string | undefined): StorageOrder {
    return value === "least" ? "least" : "most";
}

/** The query string's `page`: a whole number from 1, else 1. */
export function readPage(value: string | undefined): number {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** How many pages `total` rows make at `limit` a page; at least one. */
export function pageCount(total: number, limit: number): number {
    if (limit <= 0) return 1;
    return Math.max(1, Math.ceil(total / limit));
}

/** The screen's own address for an order and page; the defaults stay out. */
export function usageHref(order: StorageOrder, page: number): string {
    const search = new URLSearchParams();
    if (order !== "most") search.set("order", order);
    if (page > 1) search.set("page", String(page));
    return search.size > 0 ? `/usage?${search.toString()}` : "/usage";
}
