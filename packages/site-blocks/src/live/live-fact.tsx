"use client";

import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import type { LiveReadStatus } from "./live-state";
import type { LiveRead } from "./use-live-read";

/**
 * One live fact on a cached page (DEC-172, plan U8, #1042): a box that
 * keeps its height from the first paint, whatever it comes to say, so the
 * page never moves when the fact arrives, fails or ages (CLS).
 *
 * What it shows, by the read's status (`live-state.ts`):
 *
 * - **loading**: `loading`, else nothing: the reserved box, no number, no
 *   shimmer. The cached HTML is always this.
 * - **fresh** and **refreshing**: `fresh(value, fetchedAt)`.
 * - **stale** (older than a minute): `stale(value)`, which leaves out its
 *   counts; none given, nothing.
 * - **unknown** (`pick` found nothing to say) and **failed**: `fallback`,
 *   the plain way in the cached page already had ("See times"), else
 *   nothing. A failed read is never shown as "0" or as empty (the
 *   saroh-product-states rule).
 *
 * `reserve` is the box's height (a `min-h-*` class), the same in every
 * state.
 */

export type LiveFactState = LiveReadStatus | "unknown";

export function liveFactState<T, V>(
    read: LiveRead<T>,
    pick: (data: T) => V | null,
): { state: LiveFactState; value: V | null } {
    if (read.data === undefined) return { state: read.status, value: null };
    const value = pick(read.data);
    if (value === null) return { state: "unknown", value: null };
    return { state: read.status, value };
}

export function LiveFact<T, V>({
    read,
    pick,
    fresh,
    stale,
    fallback = null,
    loading,
    reserve,
    className,
    label,
}: {
    read: LiveRead<T>;
    /** The fact from the answer; null: nothing to say (unknown). */
    pick: (data: T) => V | null;
    fresh: (value: V, fetchedAt: number) => ReactNode;
    stale?: (value: V) => ReactNode;
    fallback?: ReactNode;
    /** What the cached page shows; none: the empty, reserved box. */
    loading?: ReactNode;
    /** The box's height, kept in every state (a `min-h-*` class). */
    reserve: string;
    className?: string;
    /** A name for the region, for a screen reader. */
    label?: string;
}) {
    const { state, value } = liveFactState(read, pick);
    let body: ReactNode;
    if (state === "loading") body = loading ?? null;
    else if (state === "unknown" || state === "failed") body = fallback;
    else if (value === null) body = fallback;
    else if (state === "stale") body = stale ? stale(value) : null;
    else body = fresh(value, read.fetchedAt ?? 0);
    return (
        <div
            data-live-fact=""
            data-live-state={state}
            aria-busy={state === "loading" ? true : undefined}
            aria-label={label}
            role={label ? "group" : undefined}
            className={cn(reserve, className)}
        >
            {body}
        </div>
    );
}
