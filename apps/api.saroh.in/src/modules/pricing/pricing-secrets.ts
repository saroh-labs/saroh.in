import { env } from "../../env";
import { devFallbackAllowed } from "../site-accounts/site-secrets";

/**
 * The secret that signs a pricing draft-preview token (plans catalogue
 * KTD-10), read at use like the site sign-in secrets: the API boots without
 * it, and only minting a preview link fails. Development and test (as
 * `NODE_ENV` itself declares them) fall back to a fixed public value so a
 * fresh clone can preview a draft; anywhere else a missing secret throws.
 */
const DEV_PREVIEW_SECRET =
    "saroh-dev-insecure-pricing-preview-secret-not-for-production";

/** The signing secret, or null where none is set and no fallback may stand in. */
export function pricingPreviewSecretOrNull(): string | null {
    if (env.PRICING_PREVIEW_SECRET) return env.PRICING_PREVIEW_SECRET;
    return devFallbackAllowed() ? DEV_PREVIEW_SECRET : null;
}

export function pricingPreviewSecret(): string {
    const secret = pricingPreviewSecretOrNull();
    if (secret) return secret;
    throw new Error(
        "PRICING_PREVIEW_SECRET is not set. A pricing draft can't be previewed without it; see docs/architecture/ENVIRONMENT.md.",
    );
}
