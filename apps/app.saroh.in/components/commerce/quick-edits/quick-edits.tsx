"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";

import type { QuickPatch } from "@/lib/products/cache";

/**
 * Products' quick edits (archive or publish, add stock, price; DEC-259,
 * owner 23 Nov) run through one seam: a control calls
 * `run(ids, patch, action)` with the Server Action it always called.
 *
 * The host on the Products list and a product's page
 * (`useQuickEditsHost`) shows `patch` at once in every cached list page and
 * the product's page, runs `action` with the tab's business, puts the
 * snapshot back when any answer is not `ok`, and reads Products again
 * once. With no host (a test), the action just runs.
 */
export interface QuickEdits {
    run<R extends { ok: boolean }>(
        ids: readonly string[],
        patch: QuickPatch,
        action: (orgId?: string) => Promise<R[]>,
    ): Promise<R[]>;
}

const NO_HOST: QuickEdits = { run: (_ids, _patch, action) => action() };

export const QuickEditsContext = createContext<QuickEdits | null>(null);

export function useQuickEdits(): QuickEdits {
    return useContext(QuickEditsContext) ?? NO_HOST;
}

/** The host, or null on a screen without one (a server-rendered one). */
export function useHostedQuickEdits(): QuickEdits | null {
    return useContext(QuickEditsContext);
}

/** One product, one action: `run` for the common case. */
export async function runOne<R extends { ok: boolean }>(
    quick: QuickEdits,
    id: string,
    patch: QuickPatch,
    action: (orgId?: string) => Promise<R>,
): Promise<R> {
    const res = (
        await quick.run([id], patch, async (orgId) => [await action(orgId)])
    ).at(0);
    if (!res) throw new Error("quick edit answered nothing");
    return res;
}

/**
 * After a product's sheet saved (details, description, photos): on the
 * product page its queries are read again (`useProductsSaved`); on a
 * screen still server-rendered (a post's editor), the page is.
 */
export const ProductSavedContext = createContext<(() => unknown) | null>(null);

export function useProductSaved(): () => unknown {
    const router = useRouter();
    return (
        useContext(ProductSavedContext) ??
        // rq-refresh-ok: off the product page only a post's editor (/sites/[siteId]/write) draws these sheets, server-rendered.
        (() => router.refresh())
    );
}
