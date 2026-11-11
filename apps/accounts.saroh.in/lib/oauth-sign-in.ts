/**
 * An AI app signing in to Saroh (plan 2026-11-10-001, U9): the pages
 * `/oauth/pick-business` and `/oauth/consent`. Better Auth sends the person
 * here with its signed sign-in request in the address; the pages hand it
 * back to the API untouched, which checks the signature.
 */

/** The page's query, as Better Auth signed it (repeated keys kept). */
export function oauthQueryOf(
    searchParams: Record<string, string | string[] | undefined>,
): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
        for (const v of Array.isArray(value) ? value : [value]) {
            if (v !== undefined) query.append(key, v);
        }
    }
    return query.toString();
}

/** Where a signed-out person signs in first, and comes back to. */
export function signInFirst(page: string, oauthQuery: string): string {
    return `/login?redirect=${encodeURIComponent(`${page}?${oauthQuery}`)}`;
}

export interface PickableBusiness {
    id: string;
    name: string;
}

/** What the consent page shows (the API's `GET /oauth/consent`). */
export interface ConsentDetails {
    app: { name: string | null; known: boolean };
    redirectHost: string | null;
    business: PickableBusiness | null;
    can: string[];
    refused: boolean;
}

/** An app's name as shown: its own, or a plain stand-in. */
export function appName(details: Pick<ConsentDetails, "app">): string {
    // An empty name counts as none.
    const name = details.app.name?.trim() ?? "";
    return name.length > 0 ? name : "This app";
}

export const OAUTH_WORDS = {
    pickTitle: (app: string) => `Which business should ${app} work with?`,
    pickDescription:
        "It works with one business at a time. To connect another, add the app again and pick that one.",
    noBusinessTitle: "You don't have a business on Saroh yet",
    noBusinessDescription:
        "Set one up first, then come back to the app and connect again.",
    continue: "Continue",
    continuing: "Continuing…",
    consentTitle: (app: string, business: string) =>
        `Let ${app} work with ${business}?`,
    unverified: "Unverified app",
    unverifiedNote:
        "Saroh doesn't know who makes this app. Only allow it if you added it yourself.",
    canHeading: "It will be able to",
    roleNote:
        "Never more than you can do yourself. It can't see sensitive customer notes, change billing or manage API keys.",
    dataLine: (app: string) =>
        `What ${app} reads from Saroh is sent to ${app}'s provider, and their terms apply to it.`,
    returnsTo: (host: string) => `After this you go back to ${host}.`,
    disconnect: "You can disconnect it any time in Settings › API and AI apps.",
    allow: "Allow",
    allowing: "Allowing…",
    deny: "Don't allow",
    refusedTitle: "Saroh can't connect this app",
    refusedDescription:
        "Its name copies Saroh or another AI company's, so it may not be what it says. Nothing was shared.",
    noPickTitle: "Pick a business first",
    noPickDescription:
        "This sign-in lost track of the business. Go back to the app and connect again.",
    unreachableTitle: "Couldn't reach Saroh",
    unreachableDescription:
        "Nothing has been shared. It's usually back in a moment.",
} as const;
