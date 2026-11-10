import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import { WEBHOOK_ROUTE } from "@saroh/integrations";

/**
 * Who may call the API from a browser.
 *
 * The workspace apps are a fixed list of first-party origins, and they call
 * with the session cookie: credentialed CORS for exactly those, never "*".
 *
 * The guardless `/public/*` routes are different in kind (U19). They are
 * called from merchants' own sites — `<slug>.saroh.app` and every custom
 * domain a business verifies — which no list can name ahead of time, and
 * they read no session: a public booking, an enquiry, a pay link. So any
 * origin may call them, WITHOUT credentials: the browser sends no cookie and
 * reads no response that one could have shaped. The webhook routes are
 * server-to-server and keep the strict answer.
 *
 * This is the only CORS layer: the Better Auth wrapper's own is off
 * (`disableTrustedOriginsCors` in app.module.ts). Left on, it added
 * Allow-Credentials: true to every answer, `/public/*` included, beside
 * the origin reflected here (pentest 29 Oct). No public route reads a
 * cookie: a site customer's session reaches the API through saroh.app's
 * server, never the browser.
 */
export function corsOptionsFor(
    path: string,
    trustedOrigins: string[],
    keyOrigins: readonly string[] = [],
): CorsOptions {
    const bare = path.split("?")[0] ?? "";
    switch (publicApiSurfaceOf(bare)) {
        // Only the publishable key's own origins, never credentials; an
        // unlisted origin gets no Allow-Origin, so the browser refuses.
        case "storefront":
            return { origin: [...keyOrigins], credentials: false };
        // Server to server with a secret key: no browser may read it.
        case "secret":
            return { origin: false };
        case "mcp":
            return {
                origin: trustedOrigins,
                credentials: false,
                exposedHeaders: MCP_EXPOSED_HEADERS,
            };
    }
    // A live read the edge may keep (review #4, #21) answers "*", never the
    // caller's own origin: one kept answer serves every site's address
    // (its saroh.app one, its own domain, the editor's preview), and an
    // answer naming the first caller's origin would be refused by the rest.
    if (EDGE_KEPT_READ.test(bare)) {
        return { origin: "*", credentials: false };
    }
    if (bare.startsWith("/public/") && !bare.startsWith(`/${WEBHOOK_ROUTE}/`)) {
        return { origin: true, credentials: false };
    }
    return {
        origin: trustedOrigins,
        credentials: true,
        exposedHeaders: EXPOSED_HEADERS,
    };
}

/** The public API's surfaces (plan 2026-11-10-001, Key Technical Decisions). */
export type PublicApiSurface = "storefront" | "secret" | "mcp";

/**
 * Which keyed surface a path is on: `/v1/storefront/…` (publishable key in
 * the path), the rest of `/v1` (secret key, Bearer) or `/mcp`. None of them
 * reads the session cookie.
 */
export function publicApiSurfaceOf(path: string): PublicApiSurface | undefined {
    const bare = path.split("?")[0] ?? "";
    if (bare === "/mcp" || bare.startsWith("/mcp/")) return "mcp";
    if (bare.startsWith("/v1/storefront/")) return "storefront";
    if (bare === "/v1" || bare.startsWith("/v1/")) return "secret";
    return undefined;
}

/** The publishable key a storefront path carries: `/v1/storefront/{pk_…}/…`. */
export function storefrontKeyOf(path: string): string | undefined {
    return /^\/v1\/storefront\/(pk_(?:live|test)_[0-9A-Za-z]{43})(?:[/?]|$)/.exec(
        path,
    )?.[1];
}

/**
 * The CORS delegate main.ts installs. A storefront path's preflight and
 * real request are answered from its key's allowed origins (the guard's
 * short cache, so both cost one lookup); a key that opens nothing, or a
 * failed lookup, answers no origin at all.
 */
export function corsDelegate(
    trustedOrigins: string[],
    keyOrigins: (token: string) => Promise<readonly string[]>,
) {
    return (
        req: { url?: string },
        callback: (error: Error | null, options: CorsOptions) => void,
    ): void => {
        const url = req.url ?? "";
        const token = storefrontKeyOf(url);
        if (!token) {
            callback(null, corsOptionsFor(url, trustedOrigins));
            return;
        }
        keyOrigins(token).then(
            (origins) =>
                callback(null, corsOptionsFor(url, trustedOrigins, origins)),
            () => callback(null, corsOptionsFor(url, trustedOrigins)),
        );
    };
}

/** What an MCP client in a browser may read besides the body. */
export const MCP_EXPOSED_HEADERS = [
    "Mcp-Session-Id",
    "Mcp-Protocol-Version",
    "WWW-Authenticate",
];

/**
 * The public live reads whose answer is the same for every visitor and may
 * be kept at the edge for a few seconds (`LIVE_READ_EDGE_CACHE`): On today,
 * the Timetable, and the shop's stock counts.
 */
export const EDGE_KEPT_READ =
    /^\/public\/sites\/[^/]+\/(today|timetable|shop\/stock)\/?$/;

/**
 * What a first-party page may read off a response besides its body. The
 * auth server's limiter answers "too many" with the wait in `X-Retry-After`,
 * and the sign-in page counts it down ("Resend code in 24s"). A browser
 * hides any header not named here from a page on another origin.
 */
export const EXPOSED_HEADERS = ["X-Retry-After"];
