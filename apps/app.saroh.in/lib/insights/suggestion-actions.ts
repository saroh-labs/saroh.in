"use server";

import { destroy, mutate } from "@/lib/api/http";

/**
 * Not now on Insights' suggestion card (DEC-171, #1087, #1091): hide one
 * suggestion from this person for 7 days, and its Undo. The API keeps it per
 * person and checks the key. Nothing is revalidated: the card takes the
 * suggestion out itself, and the next read of the page leaves it out.
 */

function path(key: string): string {
    return `/analytics/suggestions/${encodeURIComponent(key)}/not-now`;
}

export async function putOffSuggestion(key: string) {
    return mutate<{ key: string; hiddenUntil: string }>(
        path(key),
        "POST",
        {},
        "Couldn't hide that suggestion.",
    );
}

export async function bringBackSuggestion(key: string) {
    return destroy<Record<string, never>>(
        path(key),
        "Couldn't bring that suggestion back.",
    );
}
