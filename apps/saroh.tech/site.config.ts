/**
 * One place for what the site needs to know about the world. No secrets: the
 * PostHog key is a browser key, and it stays unset until the project exists.
 */
export const site = {
    name: "Saroh",
    url: "https://saroh.tech",
    appUrl: "https://app.saroh.tech",
    india: "https://www.saroh.in",
    company: "Virashi Softwares LLP",
    social: "@sarohtech",
    posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    posthogHost: "https://eu.i.posthog.com",
} as const;

/** The sign-up link, with the page that brought them for PostHog. */
export const signupHref = (from: string, extra: Record<string, string> = {}) =>
    `${site.appUrl}/signup?${new URLSearchParams({ from, ...extra }).toString()}`;

export const signInHref = `${site.appUrl}/signin`;
