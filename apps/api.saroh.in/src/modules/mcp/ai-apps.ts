import type { OrgAction } from "../organizations/organization-actions";
import { ORG_ACTIONS } from "../organizations/organization-actions";
import { OWNER_ONLY_ACTIONS } from "../organizations/organization-policy";

/**
 * Rules for AI apps that connect by sign-in (plan 2026-11-10-001, U9): what
 * a granted scope lets the app do, which apps Saroh knows, and which names
 * an unknown app may not use.
 */

/** Never through an AI app, whatever the person may do (R7). */
export const NEVER_FOR_AI: ReadonlySet<OrgAction> = new Set<OrgAction>([
    ...OWNER_ONLY_ACTIONS,
    "apikey:manage",
    "webhook:manage",
    "customer:sensitive",
]);

const isRead = (action: OrgAction) => /:read(-own)?$/.test(action);

/**
 * The actions granted scopes stand for: `saroh:read` every read,
 * `saroh:write` every other action but publishing, `site:publish`
 * publishing. Never {@link NEVER_FOR_AI}. The person's live role narrows
 * this again on every call.
 */
export function actionsForScopes(scopes: readonly string[]): Set<OrgAction> {
    const granted = new Set(scopes);
    const out = new Set<OrgAction>();
    for (const action of ORG_ACTIONS) {
        if (NEVER_FOR_AI.has(action)) continue;
        if (action === "site:publish") {
            if (granted.has("site:publish")) out.add(action);
        } else if (isRead(action)) {
            if (granted.has("saroh:read")) out.add(action);
        } else if (granted.has("saroh:write")) {
            out.add(action);
        }
    }
    return out;
}

/**
 * Apps Saroh knows: a Client ID Metadata Document published on the AI
 * provider's own domain (Claude, Claude Code, ChatGPT). Anything else,
 * registered dynamically or from another domain, is an "Unverified app".
 */
const KNOWN_CLIENT_HOSTS = new Set(["claude.ai", "chatgpt.com"]);

export function isKnownClient(clientId: string): boolean {
    try {
        const url = new URL(clientId);
        return url.protocol === "https:" && KNOWN_CLIENT_HOSTS.has(url.host);
    } catch {
        return false;
    }
}

/** Names an unknown app may not wear: Saroh's, and the known AI providers'. */
const IMITATED = ["saroh", "claude", "anthropic", "chatgpt", "openai"];

/**
 * Whether a name imitates Saroh, Claude, ChatGPT or OpenAI. Spacing,
 * punctuation and case don't hide it ("Chat GPT", "s.a.r.o.h"), nor do the
 * digits that pass for letters.
 */
export function imitatesKnownName(name: string | null | undefined): boolean {
    if (!name) return false;
    const plain = name
        .normalize("NFKD")
        .toLowerCase()
        .replace(/0/g, "o")
        .replace(/1/g, "l")
        .replace(/[^a-z]/g, "");
    return IMITATED.some((word) => plain.includes(word));
}

/** An app the consent page refuses: unknown, and wearing a known name. */
export function refusedClient(client: {
    clientId: string;
    name: string | null;
}): boolean {
    return !isKnownClient(client.clientId) && imitatesKnownName(client.name);
}

/** What each scope lets an app do, in the consent page's words. */
export const SCOPE_WORDS: Record<string, string> = {
    "saroh:read":
        "See your business: products, bookings, orders, customers, enquiries and your website",
    "saroh:write":
        "Make changes for you: add and edit products, bookings, orders and your website's draft",
    "site:publish": "Publish your website's draft so visitors see it",
    offline_access: "Stay connected until you disconnect it",
};
