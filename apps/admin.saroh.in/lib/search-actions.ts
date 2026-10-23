"use server";

import { getJson } from "./control-plane";
import type { ConsoleSearch } from "./search-words";
import { SEARCH_MIN_LENGTH } from "./search-words";

/**
 * The header search's read (admin console redesign U10), as a Server Action
 * because the box is a client component and never calls the API itself.
 * A refusal (403) is an empty answer: the search shows what this person may
 * open, never an error for what they may not.
 */
export async function searchConsoleAction(
    term: string,
): Promise<{ ok: true; data: ConsoleSearch } | { ok: false }> {
    const q = term.trim().slice(0, 200);
    if (q.length < SEARCH_MIN_LENGTH) {
        return { ok: true, data: { results: [], note: null } };
    }
    try {
        const data = await getJson<ConsoleSearch>(
            `/search?q=${encodeURIComponent(q)}`,
        );
        return { ok: true, data: data ?? { results: [], note: null } };
    } catch {
        return { ok: false };
    }
}
