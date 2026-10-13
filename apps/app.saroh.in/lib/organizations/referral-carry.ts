/**
 * The referral code a visitor's browser carried here from saroh.in
 * (DEC-156): a first-party cookie saroh.in sets on the domain it shares
 * with the workspace (`apps/saroh.in/lib/referral.ts`; the name and the
 * shape are that file's, change one, change both).
 *
 * Setup reads it on the server as a business is made, sends it to the API
 * with the business, and clears it once the business exists. The app
 * decides nothing about it: whether the code names a business, and whether
 * that counts, is the API's alone. Nothing here is shown to anyone.
 */
export const REFERRAL_COOKIE = "saroh_ref";

const CODE = /^[a-hj-km-np-z2-9]{8}$/;

/** The cookie's value when it is shaped like a code; else nothing is sent. */
export function carriedReferral(value: string | undefined): string | undefined {
    const code = value?.trim().toLowerCase();
    return code && CODE.test(code) ? code : undefined;
}

/**
 * The domain the cookie was set on, from this app's own host: the host
 * without its first label (`app.saroh.in` → `saroh.in`). A cookie is
 * cleared only by naming the domain it was set with. Undefined for a host
 * with nothing above it to share (`localhost`, an address).
 */
export function referralCookieDomain(host: string | null): string | undefined {
    const name = host?.trim().toLowerCase().split(":")[0] ?? "";
    const labels = name.split(".");
    if (labels.length < 3 || /^[\d.]+$/.test(name)) return undefined;
    return labels.slice(1).join(".");
}
