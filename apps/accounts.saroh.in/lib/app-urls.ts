import { env } from "@/env";
import { viaWelcome } from "@/lib/signup-welcome";

/**
 * Where accounts sends a user once they are authenticated.
 *
 * accounts is the identity provider, so every destination it hands out lives on
 * another origin. `NEXT_PUBLIC_APP_URL` overrides the default when the app is
 * served from somewhere other than the usual pair (preview deploys, tunnels).
 * Otherwise we fall back to the standard dev and production origins.
 *
 * This is where a sign-in lands when nothing else was asked for
 * (`lib/return-to.ts`): the app's front door sends someone with no business
 * to setup, opens the one business they have, or asks which of several.
 */
export function getAppUrl(): string {
    if (env.NEXT_PUBLIC_APP_URL) return env.NEXT_PUBLIC_APP_URL;
    return env.NODE_ENV === "production"
        ? "https://app.saroh.in"
        : "https://app.saroh.localhost";
}

/**
 * This app's own public address, for the tags that must be written as full
 * addresses (the sign-in page's share card and `og:url`).
 */
export function getAccountsUrl(): string {
    if (env.NEXT_PUBLIC_ACCOUNTS_URL) return env.NEXT_PUBLIC_ACCOUNTS_URL;
    return env.NODE_ENV === "production"
        ? "https://accounts.saroh.in"
        : "https://accounts.saroh.localhost";
}

/**
 * The first-run funnel: create an organization, then choose modules.
 *
 * A freshly verified user has no organization yet, so this is the correct
 * landing spot, and going straight to it saves the app a redirect.
 * app.saroh.in redirects users who DO already have an org out of onboarding,
 * so sending a returning-but-unverified user here is harmless.
 */
export function getOnboardingUrl(): string {
    return `${getAppUrl()}/onboarding`;
}

/**
 * Where a newly verified account's browser goes: `destination`, by way of
 * saroh.in's `/welcome` when `NEXT_PUBLIC_SIGNUP_WELCOME_URL` is set
 * (DEC-127, `lib/signup-welcome.ts`). Called in the browser, as the account
 * leaves.
 */
export function afterSignUp(destination: string): string {
    return viaWelcome({
        welcomeUrl: env.NEXT_PUBLIC_SIGNUP_WELCOME_URL,
        destination,
        base: window.location.origin,
        forwardable: [window.location.origin, new URL(getAppUrl()).origin],
        now: Date.now(),
    });
}
