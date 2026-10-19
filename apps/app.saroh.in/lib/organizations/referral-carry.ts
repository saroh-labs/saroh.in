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
 * The account manager's link a visitor's browser carried from saroh.in
 * (DEC-169, `?am=`): the same kind of cookie, `<code>.<seconds>`, set
 * beside the referral's (`apps/saroh.in/lib/referral.ts`; change one,
 * change both). Setup sends the code and when it was kept with the
 * business, and clears it once the business exists. Whether the code names
 * an account manager, and whether that counts, is the API's alone.
 */
export const MANAGER_COOKIE = "saroh_am";

const MANAGER_CODE = /^[2-9A-HJKMNP-Z]{8}$/;

/** The link's code and when it was kept, or nothing when it isn't one. */
export function carriedManagerLink(
    value: string | undefined,
): { managerLinkCode: string; managerLinkSetAt?: string } | undefined {
    if (!value || value.length > 64) return undefined;
    const parts = value.trim().split(".");
    const code = parts[0].toUpperCase();
    const seconds = parts.length > 1 ? parts[1] : "";
    if (!MANAGER_CODE.test(code)) return undefined;
    const keptAt = /^\d{9,11}$/.test(seconds)
        ? new Date(Number(seconds) * 1000).toISOString()
        : undefined;
    return {
        managerLinkCode: code,
        ...(keptAt ? { managerLinkSetAt: keptAt } : {}),
    };
}

/**
 * The code an owner typed for the Saroh teammate helping them, as the API
 * stores it, or nothing when the field was left empty. A code that isn't
 * shaped like one is the form's to point out (`managerCodeProblem`).
 */
export function typedManagerCode(
    value: string | undefined,
): string | undefined {
    const code = value?.replace(/[\s-]+/g, "").toUpperCase();
    return code && MANAGER_CODE.test(code) ? code : undefined;
}

/** What the form says under a typed code that can't be one, or null. */
export function managerCodeProblem(value: string | undefined): string | null {
    if (!value?.trim()) return null;
    return typedManagerCode(value)
        ? null
        : "A code is 8 letters and numbers. Check it with the person who gave it to you.";
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
