"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The visitor's bag on a merchant's site (round-2 G13): the browser's, until
 * checkout. Per site, in `localStorage`, holding only listing and variant
 * ids and quantities — never a name or a price, which the checkout's quote
 * re-reads from the server every time.
 *
 * Every read and write is wrapped: a private window, blocked storage or a
 * full disk leaves an empty bag that still works for the visit, never a
 * broken page. Other tabs of the same site see a change through the
 * `storage` event; this tab through its own listeners.
 */

export interface BagItem {
    listingId: string;
    /** The option bought; null for a product without options. */
    variantId: string | null;
    quantity: number;
}

/** The most lines, and of each, a bag holds (the API's own limits). */
export const MAX_BAG_ITEMS = 30;
export const MAX_ITEM_QUANTITY = 99;

const PREFIX = "saroh.bag.";
const keyOf = (site: string) => `${PREFIX}${site}`;
const EMPTY: readonly BagItem[] = Object.freeze([]);

function isItem(v: unknown): v is BagItem {
    if (typeof v !== "object" || v === null) return false;
    const i = v as Record<string, unknown>;
    return (
        typeof i.listingId === "string" &&
        i.listingId.length > 0 &&
        (i.variantId === null || typeof i.variantId === "string") &&
        typeof i.quantity === "number" &&
        Number.isInteger(i.quantity) &&
        i.quantity > 0
    );
}

/** What is stored, narrowed: anything else reads as an empty bag. */
export function parseBag(raw: string | null): BagItem[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(isItem)
            .slice(0, MAX_BAG_ITEMS)
            .map((i) => ({
                listingId: i.listingId,
                variantId: i.variantId,
                quantity: Math.min(MAX_ITEM_QUANTITY, i.quantity),
            }));
    } catch {
        return [];
    }
}

function readRaw(site: string): string | null {
    try {
        return window.localStorage.getItem(keyOf(site));
    } catch {
        return null;
    }
}

/** The bag as stored for `site`. */
export function readBag(site: string): BagItem[] {
    return parseBag(readRaw(site));
}

const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((listener) => listener());
}

/** Keep `items` as the bag for `site` (an empty bag is removed). */
export function writeBag(site: string, items: readonly BagItem[]): void {
    try {
        if (items.length === 0) window.localStorage.removeItem(keyOf(site));
        else window.localStorage.setItem(keyOf(site), JSON.stringify(items));
        // Stored again: storage is the bag once more, so another tab's
        // changes show and no refused write pins an old one.
        memory.delete(site);
    } catch {
        // Storage refused: this visit's bag still lives in the listeners'
        // snapshot below.
        memory.set(site, [...items]);
    }
    notify();
}

// A bag storage refused to keep, for this page's life.
const memory = new Map<string, BagItem[]>();

function current(site: string): BagItem[] {
    return memory.get(site) ?? readBag(site);
}

const same = (a: BagItem, b: { listingId: string; variantId: string | null }) =>
    a.listingId === b.listingId && a.variantId === b.variantId;

/** Add one line, or more of one already there, within the limits. */
export function addToBag(site: string, item: BagItem): BagItem[] {
    const items = current(site);
    const at = items.findIndex((i) => same(i, item));
    let next: BagItem[];
    if (at >= 0) {
        next = items.map((i, n) =>
            n === at
                ? {
                      ...i,
                      quantity: Math.min(
                          MAX_ITEM_QUANTITY,
                          i.quantity + item.quantity,
                      ),
                  }
                : i,
        );
    } else if (items.length >= MAX_BAG_ITEMS) {
        next = items;
    } else {
        next = [
            ...items,
            { ...item, quantity: Math.min(MAX_ITEM_QUANTITY, item.quantity) },
        ];
    }
    writeBag(site, next);
    return next;
}

/** Set a line's quantity; 0 takes it out. */
export function setQuantity(
    site: string,
    line: { listingId: string; variantId: string | null },
    quantity: number,
): BagItem[] {
    const q = Math.max(0, Math.min(MAX_ITEM_QUANTITY, Math.floor(quantity)));
    const next = current(site)
        .map((i) => (same(i, line) ? { ...i, quantity: q } : i))
        .filter((i) => i.quantity > 0);
    writeBag(site, next);
    return next;
}

/** Empty the bag: the order was placed. */
export function clearBag(site: string): void {
    memory.delete(site);
    writeBag(site, []);
}

/** How many things are in it. */
export function bagCount(items: readonly BagItem[]): number {
    return items.reduce((n, i) => n + i.quantity, 0);
}

// ── React ──────────────────────────────────────────────────────────────────

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key.startsWith(PREFIX)) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

// One snapshot per stored string, so React sees the same array until the
// bag really changes.
const snapshots = new Map<string, { raw: string | null; items: BagItem[] }>();

function snapshotOf(site: string): readonly BagItem[] {
    const kept = memory.get(site);
    if (kept) return kept;
    const raw = readRaw(site);
    const last = snapshots.get(site);
    if (last?.raw === raw) return last.items;
    const items = parseBag(raw);
    snapshots.set(site, { raw, items });
    return items;
}

/** The bag for `site`, kept up to date in this tab and across tabs. */
export function useBag(site: string): readonly BagItem[] {
    const getSnapshot = useCallback(() => snapshotOf(site), [site]);
    return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

// ── Opening the bag from elsewhere on the page ─────────────────────────────

const openers = new Set<() => void>();

/** Ask the header's bag to open (the product page's "View bag"). */
export function openBag(): void {
    openers.forEach((open) => open());
}

/** The header's bag listens here; returns how to stop. */
export function onOpenBag(open: () => void): () => void {
    openers.add(open);
    return () => {
        openers.delete(open);
    };
}
