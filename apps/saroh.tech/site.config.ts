import { hostsFor, urlOf } from "@saroh/edition";

/**
 * Global's addresses. A development deploy builds with `GLOBAL_DEV_DOMAIN`
 * (scripts/cf-global-dev.mjs), a production one with `GLOBAL_PRODUCTION_HOSTS=on`
 * (wrangler.jsonc's production vars, through scripts/cf-env.mjs), and next.config.mjs
 * hands both to the browser's code. Any other build talks to the local stack,
 * so a test form never writes a real message or emails staff.
 */
const LOCAL_HOSTS = {
    app: "app.saroh.localhost",
    api: "api.saroh.localhost",
    accounts: "accounts.saroh.localhost",
};
const hosts = process.env.GLOBAL_DEV_DOMAIN?.trim()
    ? hostsFor("GLOBAL", "development")
    : process.env.GLOBAL_PRODUCTION_HOSTS === "on"
      ? hostsFor("GLOBAL", "production")
      : LOCAL_HOSTS;

const ACCOUNTS_URL = urlOf(hosts.accounts);

/**
 * One place for what the site needs to know about the world. No secrets: the
 * PostHog key is a browser key, and it stays unset until the project exists.
 */
export const site = {
    name: "Saroh",
    url: "https://saroh.tech",
    appUrl: urlOf(hosts.app),
    apiUrl: urlOf(hosts.api),
    india: "https://www.saroh.in",
    company: "Virashi Softwares LLP",
    posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    posthogHost: "https://eu.i.posthog.com",
} as const;

/** The sign-up link, with the page that brought them, as saroh.in's `src`. */
export const signupHref = (src: string, extra: Record<string, string> = {}) =>
    `${ACCOUNTS_URL}/signup?${new URLSearchParams({ src, ...extra }).toString()}`;

export const signInHref = `${ACCOUNTS_URL}/login`;
