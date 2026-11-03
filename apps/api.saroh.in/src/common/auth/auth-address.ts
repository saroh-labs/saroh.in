import { EDITIONS, environmentOfHost, hostsFor, urlOf } from "@saroh/edition";

/**
 * The address to run sign-in on, when a request came in on another edition's
 * API address rather than the configured one. Null means the configured
 * instance. The Host header is the caller's, so it only ever picks from the
 * fixed list.
 */
export function otherAuthAddress(
    host: string | null | undefined,
    configuredUrl: string | undefined,
): string | null {
    if (!host || !configuredUrl) return null;
    const configured = new URL(configuredUrl).host;
    const name = host.trim().toLowerCase().replace(/:\d+$/, "");
    if (name === configured) return null;
    const environment = environmentOfHost(configured);
    if (!environment) return null;
    return EDITIONS.some((e) => hostsFor(e, environment).api === name)
        ? urlOf(name)
        : null;
}
