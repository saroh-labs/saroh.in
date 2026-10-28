/** Saroh's own hosts, for the people who run it (moved from accounts' /apps). */
export interface SarohApp {
    name: string;
    blurb: string;
    devUrl: string;
    prodUrl: string;
}

export const SAROH_APPS: readonly SarohApp[] = [
    {
        name: "Application",
        blurb: "What a business runs on: orders, bookings, sites.",
        devUrl: "https://app.saroh.localhost",
        prodUrl: "https://app.saroh.in",
    },
    {
        name: "Accounts",
        blurb: "Sign-in, profiles and billing profiles.",
        devUrl: "https://accounts.saroh.localhost",
        prodUrl: "https://accounts.saroh.in",
    },
    {
        name: "Sites",
        blurb: "Published business websites.",
        devUrl: "https://saroh.app.localhost",
        prodUrl: "https://saroh.app",
    },
    {
        name: "Templates",
        blurb: "Website templates.",
        devUrl: "https://templates.saroh.localhost/ecommerce",
        prodUrl: "https://templates.saroh.in",
    },
    {
        name: "Docs",
        blurb: "Guides and API reference.",
        devUrl: "https://docs.saroh.localhost",
        prodUrl: "https://docs.saroh.in",
    },
    {
        name: "UI",
        blurb: "The design system.",
        devUrl: "https://ui.saroh.localhost",
        prodUrl: "https://ui.saroh.in",
    },
    {
        name: "Website",
        blurb: "The marketing site.",
        devUrl: "https://saroh.localhost",
        prodUrl: "https://saroh.in",
    },
];

/** The local host on a `.localhost` console, else the production one. */
export function sarohAppUrl(app: SarohApp, host: string | null): string {
    return host?.split(":")[0]?.endsWith(".localhost")
        ? app.devUrl
        : app.prodUrl;
}
