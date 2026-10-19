/**
 * The header search's answer in words, and where each row leads (admin
 * console redesign U10, R15). Client-safe. The API (`GET /admin/search`)
 * sends ids and names, each kind only under the permission of the screen it
 * opens; these rules name them and build the links.
 */

/** Mirrors the API's `ConsoleSearchResult` (`admin-search.service.ts`). */
export type ConsoleSearchResult =
    | { kind: "business"; id: string; name: string; slug: string }
    | { kind: "user"; id: string; name: string | null; email: string }
    | {
          kind: "subscription";
          id: string;
          organizationId: string;
          organizationName: string;
      };

export type SearchNote = "email-needs-pii" | "provider-id-needs-billing";

export interface ConsoleSearch {
    results: ConsoleSearchResult[];
    note: SearchNote | null;
}

/** The shortest term the API searches for. */
export const SEARCH_MIN_LENGTH = 2;

/** How long typing must pause before a search goes out. */
export const SEARCH_DEBOUNCE_MS = 250;

export interface ResultWords {
    /** What it is, before its name: "Business". */
    kind: string;
    title: string;
    detail: string;
}

export function resultWords(result: ConsoleSearchResult): ResultWords {
    switch (result.kind) {
        case "business":
            return {
                kind: "Business",
                title: result.name,
                detail: result.slug,
            };
        case "user":
            // A user with no name is their email, as on Users.
            return result.name
                ? { kind: "User", title: result.name, detail: result.email }
                : { kind: "User", title: result.email, detail: "No name yet" };
        case "subscription":
            return {
                kind: "Subscription",
                title: result.organizationName,
                detail: "Its Saroh subscription, on Billing",
            };
    }
}

/** Where a row opens. A subscription opens its sheet on Billing. */
export function resultHref(result: ConsoleSearchResult, term: string): string {
    switch (result.kind) {
        case "business":
            return `/businesses/${encodeURIComponent(result.id)}`;
        case "user":
            return `/users/${encodeURIComponent(result.id)}`;
        case "subscription": {
            const search = new URLSearchParams({
                q: term.trim(),
                open: result.id,
            });
            return `/billing/subscriptions?${search.toString()}`;
        }
    }
}

/** Why a search found nothing it could have, said once under "Nothing found". */
export const NOTE_WORDS: Record<SearchNote, string> = {
    "email-needs-pii":
        "Finding someone by email needs access to personal data.",
    "provider-id-needs-billing":
        "Finding a business by its Razorpay id needs access to Billing.",
};
