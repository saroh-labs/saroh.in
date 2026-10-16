"use server";

import { apiFetch, orgBase } from "@/lib/api/http";

/** The path a product with a name would get, and who has it if taken. */
export interface PathSuggestion {
    /** "packing-tape-2"; "" when the name has no letters or numbers. */
    path: string;
    /** The product that has the name's own path; null when it is free. */
    holder: string | null;
}

/**
 * The path New product will create with, as the name is typed (products
 * audit, 16 Oct 2026): the name's own, or — when another product has it —
 * the first free number on it. A preview only: the API picks the path again
 * when it creates. Null when it couldn't be asked; the editor then shows the
 * name's own path, as it did before.
 */
export async function suggestProductPath(
    name: string,
    except?: string,
): Promise<PathSuggestion | null> {
    const base = await orgBase();
    if (!base) return null;
    const q = new URLSearchParams({ name: name.slice(0, 300) });
    if (except) q.set("except", except);
    try {
        const res = await apiFetch(`${base}/products/path?${q.toString()}`);
        if (!res.ok) return null;
        return (await res.json()) as PathSuggestion;
    } catch {
        return null;
    }
}
