import type { Query } from "@tanstack/react-query";
import { defaultShouldDehydrateQuery } from "@tanstack/react-query";

/**
 * The domains whose queries may cross from the server render to the
 * browser (DEC-259). An allowlist, so a new domain is sent only once it is
 * named here: billing secrets, API keys, tokens and provider credentials
 * are never dehydrated.
 */
export const DEHYDRATE_DOMAINS: ReadonlySet<string> = new Set<string>([
    "home",
    "calendar",
]);

/** Done or still pending (an un-awaited prefetch must cross too), and allowed. */
export function shouldDehydrateQuery(query: Query): boolean {
    const domain = query.queryKey[0];
    return (
        typeof domain === "string" &&
        DEHYDRATE_DOMAINS.has(domain) &&
        (defaultShouldDehydrateQuery(query) || query.state.status === "pending")
    );
}
