/**
 * Where a business came from (#1190): `src` and utm from the link its owner
 * landed on saroh.in by, carried in the `saroh_src` cookie
 * (`apps/saroh.in/lib/referral.ts`) and sent by the workspace as the
 * business is made (`apps/app.saroh.in/lib/organizations/referral-carry.ts`;
 * the same shape on all three, change one, change all).
 *
 * Written once, in the setup transaction, onto `Organization.signupSource`,
 * and never changed after: no other write names the column. Never refused:
 * a value of any other shape is dropped, so a bad link can't stop a
 * business being made. Never given to a browser tag (DEC-127).
 */
export interface SignupSource {
    src?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
}

/** The longest value kept, as saroh.in caps it. */
export const SIGNUP_SOURCE_MAX = 64;

const VALUE = new RegExp(`^[A-Za-z0-9._-]{1,${SIGNUP_SOURCE_MAX}}$`);

const KEYS = ["src", "utmSource", "utmMedium", "utmCampaign"] as const;

/** The safely shaped values sent, or null when none is. */
export function signupSourceOf(raw: unknown): SignupSource | null {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return null;
    }
    const source: SignupSource = {};
    for (const key of KEYS) {
        const value = (raw as Record<string, unknown>)[key];
        if (typeof value === "string" && VALUE.test(value.trim())) {
            source[key] = value.trim();
        }
    }
    return Object.keys(source).length > 0 ? source : null;
}
