import { env } from "@/env";

/**
 * Where accounts sends a user once they are authenticated.
 *
 * accounts is the identity provider, so every destination it hands out lives on
 * another origin. `NEXT_PUBLIC_APP_URL` overrides the default when the app is
 * served from somewhere other than the usual pair (preview deploys, tunnels);
 * otherwise we fall back to the same dev/prod origins the app launcher uses.
 */
export function getAppUrl(): string {
    if (env.NEXT_PUBLIC_APP_URL) return env.NEXT_PUBLIC_APP_URL;
    return env.NODE_ENV === "production"
        ? "https://app.saroh.in"
        : "http://localhost:3003";
}

/**
 * The first-run funnel: create an organization, then choose modules.
 *
 * A freshly verified user has no organization yet, so this — not the app
 * launcher — is the correct landing spot. The launcher would offer them a grid
 * of products that all bounce straight back to onboarding anyway. app.saroh.in
 * redirects users who DO already have an org out of onboarding, so sending a
 * returning-but-unverified user here is harmless.
 */
export function getOnboardingUrl(): string {
    return `${getAppUrl()}/onboarding`;
}
