import type { Edition } from "@saroh/edition";
import { hostsFor, merchantSitesFor, urlOf } from "@saroh/edition";

import { EDITION, websiteOf } from "./edition";

/** Saroh's own hosts, for the people who run it (moved from accounts' /apps). */
export interface SarohApp {
    name: string;
    blurb: string;
    devUrl: string;
    prodUrl: string;
}

/**
 * Sites only India's addresses serve, so every console links to them.
 * shortcut: says so by hand; move to `@saroh/edition` when Global has its own.
 */
export const HELP_URL = "https://help.saroh.in";
export const DOCS_URL = "https://docs.saroh.in";

/** The hosts for an edition: its own where it has them, else the shared ones. */
export function sarohApps(edition: Edition = EDITION): readonly SarohApp[] {
    const hosts = hostsFor(edition, "production");
    return [
        {
            name: "Application",
            blurb: "What a business runs on: orders, bookings, sites.",
            devUrl: "https://app.saroh.localhost",
            prodUrl: urlOf(hosts.app),
        },
        {
            name: "Accounts",
            blurb: "Sign-in, profiles and billing profiles.",
            devUrl: "https://accounts.saroh.localhost",
            prodUrl: urlOf(hosts.accounts),
        },
        {
            name: "Sites",
            blurb: "Published business websites.",
            devUrl: "https://saroh.app.localhost",
            prodUrl: urlOf(merchantSitesFor("production").root),
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
            prodUrl: DOCS_URL,
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
            prodUrl: websiteOf(edition, "production"),
        },
    ];
}

/** The local host on a `.localhost` console, else the production one. */
export function sarohAppUrl(app: SarohApp, host: string | null): string {
    return host?.split(":")[0]?.endsWith(".localhost")
        ? app.devUrl
        : app.prodUrl;
}
