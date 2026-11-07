import type { Edition } from "@saroh/edition";
import {
    EDITIONS,
    editionOfHost,
    environmentOfHost,
    hostsFor,
    urlOf,
} from "@saroh/edition";

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

/**
 * The edition of the sign-in instance a request on `host` reaches: its mail
 * comes from that edition's sender, and its GitHub app is that edition's.
 * A local stack, or any address of no edition, is India, as before Global.
 */
export function authEditionOf(
    host: string | null | undefined,
    configuredUrl: string | undefined,
): Edition {
    const address = otherAuthAddress(host, configuredUrl) ?? configuredUrl;
    return address
        ? (editionOfHost(new URL(address).host) ?? "INDIA")
        : "INDIA";
}

/**
 * The API address that runs an edition's sign-in, in the configured
 * instance's environment; the configured address itself on a local stack.
 */
export function authHostOf(
    edition: Edition,
    configuredUrl: string | undefined,
): string | undefined {
    if (!configuredUrl) return undefined;
    const environment = environmentOfHost(new URL(configuredUrl).host);
    return environment ? hostsFor(edition, environment).api : undefined;
}

type GithubKeys = Partial<
    Record<
        | "AUTH_GITHUB_ID"
        | "AUTH_GITHUB_SECRET"
        | "AUTH_GITHUB_GLOBAL_ID"
        | "AUTH_GITHUB_GLOBAL_SECRET",
        string | undefined
    >
>;

/**
 * An edition's GitHub app (KTD5): GitHub allows one callback per OAuth app,
 * so Global has its own pair. Both set: the pair. Neither: none, and GitHub
 * is off there. Half a pair is off too, with `half` naming the missing one
 * for the startup WARN.
 */
export function githubKeysOf(
    edition: Edition,
    keys: GithubKeys,
): {
    pair: { clientId: string; clientSecret: string } | null;
    half: string | null;
} {
    const [idName, secretName] =
        edition === "GLOBAL"
            ? (["AUTH_GITHUB_GLOBAL_ID", "AUTH_GITHUB_GLOBAL_SECRET"] as const)
            : (["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"] as const);
    const clientId = keys[idName]?.trim() ?? "";
    const clientSecret = keys[secretName]?.trim() ?? "";
    if (clientId && clientSecret) {
        return { pair: { clientId, clientSecret }, half: null };
    }
    if (clientId || clientSecret) {
        return { pair: null, half: clientId ? secretName : idName };
    }
    return { pair: null, half: null };
}
