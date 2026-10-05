/**
 * Pay pages on a business's own address (DEC-069, plan L6; KTD-6).
 *
 * A pay link is `<origin>/pay/<token>` (an invoice) or `/pay/o/<token>` (an
 * order). On the apex these are the `app/pay/**` routes as they always were.
 * On a tenant host the middleware rewrites the same path to those routes —
 * not into `[domain]`, whose layout 404s a host with no live publication,
 * and a pay link must still open after the site is unpublished — and names
 * the host it came in on in {@link TENANT_HOST_HEADER}.
 *
 * The page then compares that host with the link's canonical `payUrl` from
 * the API. A different business's host (or an old address) is sent to
 * `payUrl`, so one business's invoice is never shown under another's name.
 * The apex never redirects: every link issued before DEC-069 keeps working.
 *
 * Pure, so the middleware (edge) and the pages share it and a unit test can
 * reach it without either runtime.
 */

/** The request header naming the tenant host a pay page was opened on. */
export const TENANT_HOST_HEADER = "x-saroh-tenant-host";

/**
 * `/pay/<token>` and `/pay/o/<token>`, and an invoice link's PDF
 * (`/pay/<token>/pdf`, DEC-083) — nothing else under or beside them.
 */
const PAY_PATH = /^\/pay\/(?:(?:o\/)?[^/]+|[^/]+\/pdf)\/?$/;

/** Whether a tenant path is one of the two pay pages, or a link's PDF. */
export function isPayPath(path: string): boolean {
    return PAY_PATH.test(path);
}

/** A host as the pages compare it: lower-cased, with no port. */
export function bareHost(host: string | null | undefined): string | null {
    const bare = host?.trim().toLowerCase().split(":")[0];
    return bare !== undefined && bare.length > 0 ? bare : null;
}

/**
 * Where a pay page opened on `tenantHost` must go instead, or null to serve
 * it here.
 *
 * Null on the apex (no tenant host), when the API sent no usable `payUrl`
 * (an older API: serve as before), and when the hosts match. The comparison
 * is on hostnames only, so a port never makes one host two.
 */
export function payRedirect(
    tenantHost: string | null | undefined,
    payUrl: string | null | undefined,
): string | null {
    const here = bareHost(tenantHost);
    if (!here || !payUrl) return null;
    let target: URL;
    try {
        target = new URL(payUrl);
    } catch {
        return null;
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
        return null;
    }
    return target.hostname.toLowerCase() === here ? null : target.toString();
}
