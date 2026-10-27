/**
 * What the `/api/*` routes that relay to api.saroh.in share (DEC-195, B9):
 * reading what the page posted, and the secret the visitor's address is
 * signed with (`lib/waitlist-forward.ts` signs it). Each route keeps its own
 * checks and answers.
 */

/** What was posted: its fields, or none when the body isn't a JSON object. */
export async function readPosted(
    req: Request,
): Promise<Record<string, unknown>> {
    let posted: unknown;
    try {
        posted = await req.json();
    } catch {
        posted = null;
    }
    return (
        typeof posted === "object" && posted !== null ? posted : {}
    ) as Record<string, unknown>;
}

/** A posted field as text, trimmed and cut to `max`; "" when it isn't text. */
export const postedText = (
    p: Record<string, unknown>,
    key: string,
    max: number,
): string => {
    const value = p[key];
    return typeof value === "string" ? value.trim().slice(0, max) : "";
};

/** The API's development fallback (`site-secrets.ts`); development and test only. */
const DEV_RELAY_SECRET =
    "saroh-dev-insecure-site-relay-secret-not-for-production";

/** The secret to sign with, or null where there is none to use. */
export function relaySecret(
    configured: string | undefined,
    nodeEnv: string | undefined,
): string | null {
    if (configured) return configured;
    if (nodeEnv === "development" || nodeEnv === "test")
        return DEV_RELAY_SECRET;
    return null;
}
