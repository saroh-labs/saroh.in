import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

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
 */
export function corsOptionsFor(
    path: string,
    trustedOrigins: string[],
): CorsOptions {
    const bare = path.split("?")[0] ?? "";
    if (bare.startsWith("/public/") && !bare.startsWith("/public/webhooks/")) {
        return { origin: true, credentials: false };
    }
    return { origin: trustedOrigins, credentials: true };
}
