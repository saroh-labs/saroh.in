import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * Cross-entity quick search for the command palette. Server-only: the
 * underlying HTTP plumbing imports next/headers, so this is reached from the
 * `/api/search` route handler rather than from the client directly.
 */
export type SearchKind =
    | "contact"
    | "lead"
    | "order"
    | "product"
    | "service"
    | "booking"
    | "invoice"
    | "subscription";

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
    /**
     * The search couldn't be read (10 Oct 2026). Not the same as finding
     * nothing: the palette says "Search isn't answering" and offers to try
     * again, where it used to say "Nothing matches".
     */
    failed?: true;
}

/**
 * Never throws: a palette that throws is worse than one that finds
 * nothing. But a search that couldn't be read says so (`failed`), so the
 * palette never tells someone their customer doesn't exist.
 */
export async function searchWorkspace(query: string): Promise<SearchResult> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return { query: trimmed, hits: [] };
    const failed = { query: trimmed, hits: [], failed: true as const };

    try {
        const base = await orgBase();
        // No business open: nothing to search, and nothing went wrong.
        if (!base) return { query: trimmed, hits: [] };
        const res = await apiFetch(
            `${base}/search?q=${encodeURIComponent(trimmed)}`,
        );
        if (!res.ok) return failed;
        const data = (await res.json()) as Partial<SearchResult> | null;
        return Array.isArray(data?.hits)
            ? { query: trimmed, hits: data.hits }
            : failed;
    } catch {
        return failed;
    }
}
