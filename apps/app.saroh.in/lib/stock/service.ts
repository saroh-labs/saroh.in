import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { StockCell, StockEntryKind } from "./levels";

/**
 * Stock data access for app.saroh.in (#514): the levels, the log and the
 * checks the Stock screen, the quick look and the product page read, and
 * the counts, entries, adds, moves and undos they write. Everything goes to
 * `organizations/:org/stock`; the API decides who may (reading needs
 * `store:read`, writing "Count and move stock") and leaves out people's
 * names and order links for roles that can't see them. Server-only.
 *
 * Every write takes an idempotency key — one per tap, made by the caller —
 * so a retried save applies once.
 */

export interface StockLevelRow {
    productId: string;
    productName: string;
    productStatus: string;
    image: string | null;
    /** Null: the product counts as a whole. */
    variantId: string | null;
    variantTitle: string | null;
    sku: string | null;
    /** One per storefront, in the order of `storefronts`. */
    cells: StockCell[];
    lastChange: StockCell["lastChange"];
}

export interface StockLevels {
    storefronts: { id: string; name: string }[];
    rows: StockLevelRow[];
    /**
     * Products that don't track stock — Track stock off for the product or
     * for the whole business (#515): they always sell. The screen's footer.
     */
    untracked: {
        productId: string;
        name: string;
        status: string;
        /** Storefronts that marked it sold out by hand (#515). */
        soldOutAt?: string[];
    }[];
    /** The business's Track stock switch; off, every product is untracked. */
    tracking: boolean;
    /** The caller may count and move stock. */
    canWrite: boolean;
    /** Pass as `cursor` for the next page; null on the last. */
    nextCursor?: string | null;
    /** Rows that need someone across the business (short, sold out, low). */
    needsYou?: number;
    /** The business's time zone. */
    timezone?: string;
}

export interface StockLogEntry {
    id: string;
    kind: StockEntryKind;
    /** "Wasted", "Counted", … */
    word: string;
    quantity: number;
    before: number;
    after: number;
    expected: number | null;
    counted: number | null;
    mismatch: boolean;
    storeId: string;
    storeName: string;
    productId: string;
    productName: string;
    variantId: string | null;
    variantTitle: string | null;
    pairId: string | null;
    reversesId: string | null;
    undone: boolean;
    canUndo: boolean;
    note: string | null;
    createdAt: string;
    /** Null for a role that doesn't read the audit trail, or the system. */
    by: { id: string; name: string } | null;
    /** Null for a role that doesn't read orders. */
    order: { id: string; number: string } | null;
}

export interface StockLog {
    entries: StockLogEntry[];
    nextCursor: string | null;
    seesPeople: boolean;
    seesOrders: boolean;
    /** The business's time zone, for the log's days. */
    timezone?: string;
}

export type StockCheckKind =
    "SHORT" | "COUNT_MISMATCH" | "SALE_NOT_TAKEN" | "PROMISED_MISMATCH";

export interface StockCheck {
    key: string;
    kind: StockCheckKind;
    title: string;
    detail: string;
    storeId: string;
    storeName: string;
    productId: string;
    productName: string;
    variantId: string | null;
    variantTitle: string | null;
    stockLevelId: string | null;
    entryId: string | null;
    numbers: Record<string, number>;
    order: { id: string; number: string } | null;
    at: string | null;
}

export interface StockChecks {
    checks: StockCheck[];
    counts: Record<StockCheckKind, number>;
    canResolve: boolean;
    /** Pass as `cursor` for the next page; null on the last. */
    nextCursor?: string | null;
    /**
     * The check the page before ended on had closed, so this is the first
     * page again: replace the list rather than add to it.
     */
    restarted?: boolean;
}

/** A shelf after a change. */
export interface ShelfAfter {
    stockLevelId: string;
    storeId: string;
    productId: string;
    variantId: string | null;
    onHand: number;
    promised: number;
    lowStockAlert: number;
    short: number;
    canSell: number;
}

/** An entry as a write returns it. */
export interface WrittenEntry {
    id: string;
    kind: StockEntryKind;
    quantity: number;
    before: number;
    after: number;
}

export interface Shelf {
    storeId: string;
    productId: string;
    variantId?: string | null;
}

const NO_BUSINESS = "No active business.";

function query(params: Record<string, string | number | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") q.set(k, String(v));
    }
    const s = q.toString();
    return s ? `?${s}` : "";
}

async function write<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: NO_BUSINESS };
    const res = await apiFetch(`${base}/stock${path}`, {
        method: "POST",
        body: JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as T };
    return toFailure(data, "The stock didn't change. Try again.");
}

// ---- Reads ----

/**
 * Levels: every product that counts stock, a row per variant when it counts
 * per variant, a cell per storefront. Null when there is no business.
 */
export async function getStockLevels(
    filter: {
        storefront?: string;
        product?: string;
        /** Name or SKU. */
        q?: string;
        /** Only rows that need someone. */
        needs?: boolean;
        /** Products a page; left out, every row. */
        limit?: number;
        cursor?: string;
    } = {},
): Promise<StockLevels | null> {
    const base = await orgBase();
    if (!base) return null;
    const { needs, ...rest } = filter;
    return getJson<StockLevels>(
        `${base}/stock${query({ ...rest, needs: needs ? "true" : undefined })}`,
    );
}

/** The log, newest first, by kind, storefront, product or variant. */
export async function getStockLog(
    filter: {
        kind?: StockEntryKind[];
        storefront?: string;
        product?: string;
        variant?: string;
        cursor?: string;
        limit?: number;
    } = {},
): Promise<StockLog | null> {
    const base = await orgBase();
    if (!base) return null;
    const { kind, ...rest } = filter;
    return getJson<StockLog>(
        `${base}/stock/log${query({ ...rest, kind: kind?.join(",") })}`,
    );
}

/** What needs looking at. */
export async function getStockChecks(
    page: { limit?: number; cursor?: string } = {},
): Promise<StockChecks | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<StockChecks>(`${base}/stock/checks${query(page)}`);
}

// ---- Writes ----

/**
 * Count shelves. Each row carries what the counter was shown (`expected`,
 * "Log says N") and what they counted; `entryIds` is what Undo sends back.
 */
export function countStock(input: {
    counts: (Shelf & { expected: number | null; counted: number })[];
    note?: string;
    idempotencyKey: string;
}) {
    return write<{
        counted: number;
        changed: number;
        mismatched: number;
        entryIds: string[];
        results: {
            entry: WrittenEntry;
            shelf: ShelfAfter;
            mismatch: boolean;
        }[];
    }>("/counts", input);
}

/** Received, baked, wasted, or returned by a customer. */
export function recordStockEntry(
    input: Shelf & {
        kind: "RECEIVED" | "BAKED" | "WASTED" | "RETURNED";
        units: number;
        orderId?: string;
        note?: string;
        idempotencyKey: string;
    },
) {
    return write<{ entry: WrittenEntry; shelf: ShelfAfter }>("/entries", input);
}

/** "+N · Add": units received at a shelf. */
export function addStock(
    input: Shelf & { units: number; note?: string; idempotencyKey: string },
) {
    return write<{ entry: WrittenEntry; shelf: ShelfAfter }>("/adjust", input);
}

/** Move units not promised from one storefront to another. */
export function moveStock(input: {
    fromStoreId: string;
    toStoreId: string;
    productId: string;
    variantId?: string | null;
    units: number;
    note?: string;
    idempotencyKey: string;
}) {
    return write<{
        pairId: string;
        out: WrittenEntry;
        in: WrittenEntry;
        entryIds: string[];
    }>("/moves", input);
}

/** Undo changes made by hand, all or none. */
export function undoStock(input: {
    entryIds: string[];
    note?: string;
    idempotencyKey: string;
}) {
    return write<{ entries: WrittenEntry[]; entryIds: string[] }>(
        "/reverse",
        input,
    );
}

// ---- Track stock, for the whole business (#515) ----

/** The business's Track stock switch, and whether the caller may flip it. */
export async function getStockTracking(): Promise<{
    tracked: boolean;
    canChange: boolean;
} | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<{ tracked: boolean; canChange: boolean }>(
        `${base}/stock/tracking`,
    );
}

/**
 * Turn Track stock on or off for every product. Owner/Admin only
 * (`store:write`). Off is refused while anything is promised ("N are
 * promised to open orders — fulfil or cancel them first") and counts every
 * shelf to 0; on starts every shelf at 0.
 */
export async function setStockTracking(
    tracked: boolean,
): Promise<ApiResult<{ tracked: boolean; counted: number }>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: NO_BUSINESS };
    const res = await apiFetch(`${base}/stock/tracking`, {
        method: "PUT",
        body: JSON.stringify({ tracked }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) {
        return {
            ok: true,
            data: data as { tracked: boolean; counted: number },
        };
    }
    return toFailure(data, "Track stock didn't change. Try again.");
}

/** Mark a check looked at; it opens again if its numbers move on. */
export function resolveStockCheck(
    key: string,
    input: { note?: string; idempotencyKey: string },
) {
    return write<{ key: string; kind: StockCheckKind; resolvedAt: string }>(
        `/checks/${encodeURIComponent(key)}/resolve`,
        input,
    );
}
