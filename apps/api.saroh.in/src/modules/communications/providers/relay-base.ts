import type { Resolver } from "../../link-preview/ssrf-guard";
import {
    checkUrl,
    resolveTarget,
    systemResolver,
} from "../../link-preview/ssrf-guard";

/**
 * Where a provider's call goes: its own API, or the relay a merchant named
 * in the credentials' `baseUrl` (a SendGrid or SMTP bridge of the same
 * shape). The relay is a merchant's address, so it goes through the
 * link-preview guard first: `https`, a public name, and every address that
 * name resolves to public. Throws, naming no value, when it doesn't pass.
 *
 * shortcut: the name is checked, not pinned, so a relay whose DNS changes
 * between the check and the call (rebinding) isn't stopped; pin the
 * connection as `safe-fetch.ts` does if relays become common.
 */
export async function relayBase(
    baseUrl: string | undefined,
    ownApi: string,
    resolve: Resolver = systemResolver,
): Promise<string> {
    if (baseUrl === undefined) return ownApi;
    let url: URL;
    try {
        url = new URL(baseUrl);
    } catch {
        throw new Error("The relay address isn't a web address");
    }
    const checked = url.protocol === "https:" ? checkUrl(url) : null;
    const reached = checked?.ok ? await resolveTarget(url, resolve) : null;
    if (!reached?.ok) {
        throw new Error("The relay address must be a public https address");
    }
    return url.href.replace(/\/$/, "");
}
