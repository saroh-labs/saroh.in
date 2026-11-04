import { hostsFor, urlOf } from "@saroh/edition";

/**
 * Global's addresses. A development deploy builds with `GLOBAL_DEV_DOMAIN`
 * (scripts/cf-global-dev.mjs), which next.config.mjs hands to the browser's code.
 */
const hosts = hostsFor(
    "GLOBAL",
    process.env.GLOBAL_DEV_DOMAIN?.trim() ? "development" : "production",
);

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
