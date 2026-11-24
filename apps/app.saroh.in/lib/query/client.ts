import { QueryCache, QueryClient } from "@tanstack/react-query";

import { ROLE_DENIED } from "@/lib/api/role-denied";
import { shouldDehydrateQuery } from "@/lib/query/dehydrate-allow";
import { ORGANIZATIONS_KEY } from "@/lib/query/keys";

/**
 * The React Query client (DEC-259): one per server render, one for the
 * browser's whole visit. Defaults: `staleTime` 0 (every visit shows the
 * cache at once and reads again), no retries, and no refetch on focus or
 * reconnect, which live refresh owns.
 */

/** A read route's refusal or failure: the status and the API's code. */
export class ReadFailed extends Error {
    constructor(
        readonly status: number,
        readonly code?: string,
    ) {
        super(`Read failed: ${status}${code ? ` ${code}` : ""}`);
        this.name = "ReadFailed";
    }
}

/** How a failed read is answered: set by the provider, which has the router. */
interface ReadErrorHooks {
    refresh: () => void;
    signIn: () => void;
}
let hooks: ReadErrorHooks | null = null;
export function setReadErrorHooks(next: ReadErrorHooks | null): void {
    hooks = next;
}

/** When the last stale-list refresh ran: one refresh, never a loop. */
let refreshedAt = 0;
const REFRESH_ONCE_MS = 10_000;

/**
 * A failed read's app-wide answer; the screen still shows its own failed
 * state. Signed out: drop the cache and load the page again, which the
 * middleware sends to sign-in. Another business than the one open
 * (`org_mismatch`), or a refusal that isn't about the role (removed from
 * the business in another tab or device): the list is stale, so mark it
 * and render the page again once. A role refusal is the screen's to say.
 */
export function onReadError(client: QueryClient, error: unknown): void {
    if (!(error instanceof ReadFailed)) return;
    if (error.status === 401) {
        client.clear();
        hooks?.signIn();
        return;
    }
    const stale =
        (error.status === 409 && error.code === "org_mismatch") ||
        (error.status === 403 && error.code !== ROLE_DENIED);
    if (!stale) return;
    void client.invalidateQueries({
        queryKey: ORGANIZATIONS_KEY,
        refetchType: "none",
    });
    if (Date.now() - refreshedAt < REFRESH_ONCE_MS) return;
    refreshedAt = Date.now();
    hooks?.refresh();
}

/** For tests: forget the last refresh. */
export function resetReadErrorGuard(): void {
    refreshedAt = 0;
}

export function makeQueryClient(): QueryClient {
    const client: QueryClient = new QueryClient({
        queryCache: new QueryCache({
            onError: (error) => onReadError(client, error),
        }),
        defaultOptions: {
            queries: {
                staleTime: 0,
                gcTime: 5 * 60_000,
                retry: false,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
            },
            dehydrate: { shouldDehydrateQuery },
        },
    });
    // The business list: once per full load, again only when it changes
    // (owner, 24 Nov 2026). Its writers invalidate it (`invalidate.ts`).
    client.setQueryDefaults(ORGANIZATIONS_KEY, {
        staleTime: Infinity,
        gcTime: Infinity,
    });
    return client;
}

let browserClient: QueryClient | undefined;

/**
 * The browser's one client, for the provider and for code outside React
 * (a switch, a sign-out). On the server each call makes a new one, so no
 * request ever sees another's cache; the server's own is
 * `server-client.ts`'s, scoped to the request.
 */
export function getBrowserQueryClient(): QueryClient {
    if (typeof window === "undefined") return makeQueryClient();
    browserClient ??= makeQueryClient();
    return browserClient;
}
