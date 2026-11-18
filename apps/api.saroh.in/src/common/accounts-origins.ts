import {
    EDITIONS,
    editionOfHost,
    environmentOfHost,
    hostsFor,
    urlOf,
} from "@saroh/edition";

import { env } from "../env";

interface Source {
    ACCOUNTS_URL?: string;
    BETTER_AUTH_URL?: string;
    NODE_ENV?: string;
}

const LOCAL_ACCOUNTS = "https://accounts.saroh.localhost";

function originOf(url: string | undefined): string | null {
    if (!url) return null;
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}

/**
 * The sign-in sites that may ask Saroh to send a code (owner, 18 Nov): the
 * accounts app of each edition, in this API's environment, and nothing else.
 *
 * Read from env, never written here (the repo is public): `ACCOUNTS_URL`;
 * the environment that address, or else `BETTER_AUTH_URL`, belongs to gives
 * each edition's accounts in it (`@saroh/edition`, Global's development
 * one from `GLOBAL_DEV_DOMAIN`). In development with `ACCOUNTS_URL` unset,
 * the local accounts app. Asked on an edition's own API address (`apiHost`),
 * only that edition's accounts, and the `ACCOUNTS_URL` of a stack whose
 * hosts belong to no edition (a CI port, the local app).
 */
export function accountsOrigins(
    apiHost?: string | null,
    source: Source = env,
): string[] {
    const own =
        originOf(source.ACCOUNTS_URL) ??
        (source.NODE_ENV === "development" ? LOCAL_ACCOUNTS : null);
    const found = new Set<string>(own ? [own] : []);
    const anchor = own ?? originOf(source.BETTER_AUTH_URL);
    const environment = anchor ? environmentOfHost(new URL(anchor).host) : null;
    if (environment) {
        for (const edition of EDITIONS) {
            found.add(urlOf(hostsFor(edition, environment).accounts));
        }
    }
    const edition = apiHost ? editionOfHost(apiHost) : null;
    return [...found].filter((origin) => {
        if (!edition) return true;
        const of = editionOfHost(new URL(origin).host);
        return of === null || of === edition;
    });
}

/** The bare host names of {@link accountsOrigins}: what Turnstile's `hostname` must be. */
export function accountsHostnames(apiHost?: string | null): string[] {
    return accountsOrigins(apiHost).map((origin) => new URL(origin).hostname);
}

/**
 * Whether a request comes from an accounts site: its `Origin`, or its
 * `Referer` when there is no `Origin`. Neither is refused. A cheap filter
 * against scripts that don't bother to fake the header, never
 * authentication: anything outside a browser can send any `Origin`.
 */
export function fromAccounts(
    headers: { origin?: string | null; referer?: string | null },
    apiHost?: string | null,
): boolean {
    const origin = originOf((headers.origin ?? headers.referer)?.trim());
    return origin !== null && accountsOrigins(apiHost).includes(origin);
}
