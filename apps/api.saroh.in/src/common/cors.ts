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
): CorsOptions {
    const bare = path.split("?")[0] ?? "";
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
