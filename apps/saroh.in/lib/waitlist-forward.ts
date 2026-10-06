import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/**
 * How `/api/waitlist` passes a join on to api.saroh.in (plan U30). Server
 * only: it signs with a secret.
 *
 * The API rate-limits per visitor, but it sees this server's address, not
 * the visitor's. So the call carries the visitor's address in the signed
 * `x-saroh-relay` header the API already trusts from saroh.app (ADR-011):
 *
 *     v1.<unix seconds>.<base64url(address)>.<base64url(host)>.<base64url(sig)>
 *
 * with `sig` = HMAC-SHA256 over `v1\n<seconds>\n<address>\n<host>`, the
 * same as `apps/saroh.app/lib/site-relay.ts` and the API's `signSiteRelay`.
 *
 * The address comes only from the platform's own header (`x-real-ip`, which
 * Vercel's edge writes over whatever a visitor sent). A client-sent
 * `X-Forwarded-For` is never read or passed on: anyone can write one, and
 * it would let them pick the key their limit is counted by.
 */
export const RELAY_HEADER = "x-saroh-relay";
const VERSION = "v1";

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

const b64 = (value: string | Buffer) =>
    Buffer.from(value).toString("base64url");

/** The header value for one call. */
export function signRelay(
    input: { address: string; host: string; now?: number },
    secret: string,
): string {
    const seconds = String(Math.floor((input.now ?? Date.now()) / 1000));
    const host = input.host.trim().toLowerCase().split(":")[0] ?? "";
    const sig = createHmac("sha256", secret)
        .update(`${VERSION}\n${seconds}\n${input.address}\n${host}`)
        .digest();
    return [VERSION, seconds, b64(input.address), b64(host), b64(sig)].join(
        ".",
    );
}

/**
 * The visitor's address from the platform's header, or null. Never
 * `X-Forwarded-For`.
 */
export function visitorAddress(headers: Headers): string | null {
    const raw = headers.get("x-real-ip")?.trim();
    return raw && isIP(raw) !== 0 ? raw : null;
}

/** The fields a join may carry, checked loosely here; the API validates. */
export interface JoinBody {
    email: string;
    business?: string;
    kind?: string;
    city?: string;
    plan?: string;
    source: string;
    ref?: string;
    /** Two letters, from the host's view of the connection. */
    country?: string;
}

const text = (value: unknown, max: number): string | undefined =>
    typeof value === "string" && value.trim() !== ""
        ? value.trim().slice(0, max)
        : undefined;

/**
 * The API body for what the page posted, or null when it is not a join.
 * The V2 form sends `business` and `kind` (and `src` for its source). An
 * email alone is the changelog's "Get one email when something ships"
 * (plan U4, KTD-5), which names its `src` (`changelog`); without one it is
 * the V1 form's body, still taken with its old source "saroh.in": U26
 * removed that form, but a V1 page left open across the release can post it.
 */
export function joinBody(posted: unknown): JoinBody | null {
    if (typeof posted !== "object" || posted === null) return null;
    const p = posted as Record<string, unknown>;
    const email = text(p.email, 320);
    if (!email) return null;
    const business = text(p.business, 120);
    if (!business) return { email, source: text(p.src, 64) ?? "saroh.in" };
    return {
        email,
        business,
        kind: text(p.kind, 40),
        city: text(p.city, 80),
        plan: text(p.plan, 10),
        source: text(p.src, 64) ?? "direct",
        ref: text(p.ref, 64),
    };
}

/**
 * The visitor's country as Vercel's edge saw their connection
 * (`x-vercel-ip-country`, two letters), or undefined anywhere it isn't set:
 * local dev, the browser tests, a request that didn't come through Vercel.
 * Never asked of the visitor.
 */
export function visitorCountry(headers: Headers): string | undefined {
    const raw = headers.get("x-vercel-ip-country")?.trim().toUpperCase();
    return raw && /^[A-Z]{2}$/.test(raw) ? raw : undefined;
}

/** The headers for the API call: JSON, and the relay when it can be signed. */
export function forwardHeaders(input: {
    headers: Headers;
    host: string;
    secret: string | null;
    now?: number;
}): Record<string, string> {
    const out: Record<string, string> = { "Content-Type": "application/json" };
    const address = visitorAddress(input.headers);
    if (address && input.secret) {
        out[RELAY_HEADER] = signRelay(
            { address, host: input.host, now: input.now },
            input.secret,
        );
    }
    return out;
}
