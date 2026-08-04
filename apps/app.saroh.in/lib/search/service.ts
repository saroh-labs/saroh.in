import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * Cross-entity quick search for the command palette. Server-only: the
 * underlying HTTP plumbing imports next/headers, so this is reached from the
 * `/api/search` route handler rather than from the client directly.
 */
export type SearchKind = "contact" | "lead" | "order";

export interface SearchHit {
    kind: SearchKind;
    id: string;
    title: string;
    subtitle: string | null;
    /**
     * Where to go. Built by the API so the palette never has to know how a URL
     * is composed per entity type — the same contract Home's actions use.
     */
    href: string;
}

export interface SearchResult {
    query: string;
    hits: SearchHit[];
}

/** Empty on any failure: a palette that throws is worse than one that finds nothing. */
export async function searchWorkspace(query: string): Promise<SearchResult> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return { query: trimmed, hits: [] };

    const base = await orgBase();
    if (!base) return { query: trimmed, hits: [] };

    const res = await apiFetch(
        `${base}/search?q=${encodeURIComponent(trimmed)}`,
    );
    if (!res.ok) return { query: trimmed, hits: [] };
    return (await res.json()) as SearchResult;
}
