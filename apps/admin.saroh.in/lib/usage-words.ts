/**
 * How the Usage screen says storage and pages (#798). Client-safe: no
 * server imports, so a client component may take values from here.
 */

export type StorageOrder = "most" | "least" | "closest";

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
    /** The plan's storage limit in GB; null for none, or unread. */
    limitGb: number | null;
    /** `bytes` as a whole-number share of the limit; null with no limit. */
    usedPercent: number | null;
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

/** Decimal units, as the plan's GB limit counts (a disk's, not 2^30). */
type Unit = [bytes: number, unit: string, digits: number];
const KB: Unit = [1e3, "KB", 0];
const UNITS: Unit[] = [[1e9, "GB", 2], [1e6, "MB", 1], KB];

/**
 * Storage for people, in the unit that shows it: "0 MB" for nothing,
 * "640 KB", "12.4 MB", "2.35 GB". Anything stored reads at least 1 KB.
 */
export function formatStorage(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
    const [size, unit, digits] = UNITS.find(([size]) => bytes >= size) ?? KB;
    const value = Math.max(bytes / size, digits === 0 ? 1 : 0);
    return `${value.toLocaleString("en-IN", { maximumFractionDigits: digits })} ${unit}`;
}

/** A plan's GB limit in words: "4 GB", or a dash with none. */
export function formatLimit(limitGb: number | null): string {
    return limitGb === null ? "—" : formatStorage(limitGb * 1e9);
}

/** The query string's `order`: "least", "closest" or the default, "most". */
export function readOrder(value: string | undefined): StorageOrder {
    return value === "least" || value === "closest" ? value : "most";
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
